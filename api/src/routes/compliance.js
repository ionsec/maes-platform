const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, requireRole, requirePermission } = require('../middleware/auth');
const { apiRateLimiter } = require('../middleware/rateLimiter');
const { logger } = require('../utils/logger');
const axios = require('axios');
const { getRow } = require('../services/database');

const router = express.Router();

// Apply rate limiting to all compliance routes
router.use(apiRateLimiter);

// Middleware to get organization credentials
async function getOrganizationCredentials(req, res, next) {
  try {
    const { pool } = require('../services/database');
    const organizationId = req.params.organizationId || req.body.organizationId;
    
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    const result = await pool.query(
      'SELECT id, name, tenant_id, credentials FROM maes.organizations WHERE id = $1 AND is_active = true',
      [organizationId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Organization not found or inactive' });
    }

    const organization = result.rows[0];
    const credentials = organization.credentials;
    
    // Check for both clientId and applicationId (legacy naming)
    const clientId = credentials?.clientId || credentials?.applicationId;

    if (!credentials || !clientId) {
      logger.warn(`Organization ${organizationId} missing credentials for compliance assessment`);
      return res.status(400).json({ 
        error: 'Organization credentials are not properly configured',
        details: 'This organization does not have Microsoft 365 credentials configured. Please configure Azure AD app credentials (clientId) in the organization settings before running compliance assessments.',
        missingFields: {
          clientId: !clientId,
          tenantId: !credentials?.tenantId && !organization.tenant_id
        },
        organizationId,
        hasCredentials: !!credentials,
        hasClientId: !!clientId
      });
    }

    req.organization = organization;
    req.credentials = {
      tenantId: credentials.tenantId || organization.tenant_id,
      clientId: clientId  // Use the resolved clientId
    };

    next();
  } catch (error) {
    logger.error('Error fetching organization credentials:', error);
    res.status(500).json({ error: 'Failed to fetch organization credentials' });
  }
}

// Check if organization has credentials configured
router.get('/organization/:organizationId/credentials-status', 
  authenticateToken, 
  async (req, res) => {
    try {
      const { pool } = require('../services/database');
      const { organizationId } = req.params;
      
      // Verify user has access to this organization
      const orgCheck = await pool.query(
        'SELECT 1 FROM maes.user_organizations WHERE user_id = $1 AND organization_id = $2',
        [req.user.id, organizationId]
      );

      if (orgCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied to this organization' });
      }

      const result = await pool.query(
        'SELECT id, name, tenant_id, credentials FROM maes.organizations WHERE id = $1 AND is_active = true',
        [organizationId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Organization not found or inactive' });
      }

      const organization = result.rows[0];
      const credentials = organization.credentials;
      
      // Check for both clientId and applicationId (legacy naming)
      const clientId = credentials?.clientId || credentials?.applicationId;
      const hasCredentials = !!(credentials && clientId);

      res.json({
        success: true,
        organizationId,
        organizationName: organization.name,
        hasCredentials,
        credentialsConfigured: {
          clientId: !!clientId,
          applicationId: !!credentials?.applicationId,  // Include legacy field
          tenantId: !!(credentials?.tenantId || organization.tenant_id),
          certificateThumbprint: !!credentials?.certificateThumbprint,
          certificatePath: !!credentials?.certificatePath
        },
        message: hasCredentials 
          ? 'Organization has credentials configured for compliance assessments' 
          : 'Organization needs Azure AD app credentials configured before running compliance assessments'
      });

    } catch (error) {
      logger.error('Error checking organization credentials status:', error);
      res.status(500).json({ 
        error: 'Failed to check credentials status',
        message: error.message 
      });
    }
  }
);

// Get available compliance controls
router.get('/controls/:assessmentType?', authenticateToken, async (req, res) => {
  try {
    const { pool } = require('../services/database');
    const assessmentType = req.params.assessmentType || 'cis_v400';
    const { section, severity, active } = req.query;

    let query = `
      SELECT 
        id, control_id, section, title, description, rationale, impact, 
        remediation, severity, weight, is_active, created_at
      FROM maes.compliance_controls 
      WHERE assessment_type = $1
    `;
    const params = [assessmentType];
    let paramIndex = 2;

    if (section) {
      query += ` AND section = $${paramIndex}`;
      params.push(section);
      paramIndex++;
    }

    if (severity) {
      query += ` AND severity = $${paramIndex}`;
      params.push(severity);
      paramIndex++;
    }

    if (active !== undefined) {
      query += ` AND is_active = $${paramIndex}`;
      params.push(active === 'true');
      paramIndex++;
    }

    query += ' ORDER BY control_id ASC';

    const result = await pool.query(query, params);

    // Group controls by section
    const controlsBySection = result.rows.reduce((acc, control) => {
      if (!acc[control.section]) {
        acc[control.section] = [];
      }
      acc[control.section].push(control);
      return acc;
    }, {});

    res.json({
      success: true,
      assessmentType,
      totalControls: result.rows.length,
      controls: result.rows,
      controlsBySection
    });

  } catch (error) {
    logger.error('Error fetching compliance controls:', error);
    res.status(500).json({ 
      error: 'Failed to fetch compliance controls',
      message: error.message 
    });
  }
});

// Start compliance assessment
router.post('/assess/:organizationId', 
  authenticateToken, 
  requireRole('admin'),
  getOrganizationCredentials,
  [
    body('assessmentType').optional().isIn(['cis_v400', 'cis_v300', 'custom', 'orca_style']),
    body('name').optional().isLength({ min: 1, max: 255 }),
    body('description').optional().isLength({ max: 1000 }),
    body('isBaseline').optional().isBoolean()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { organizationId } = req.params;
      const {
        assessmentType = 'cis_v400',
        name,
        description,
        isBaseline = false,
        priority = 10
      } = req.body;

      logger.info(`Starting compliance assessment for organization ${organizationId}, type: ${assessmentType}`);

      // Call compliance service
      const complianceServiceUrl = process.env.COMPLIANCE_SERVICE_URL || 'http://compliance:3002';
      
      const response = await axios.post(`${complianceServiceUrl}/api/assessment/start`, {
        organizationId,
        credentials: req.credentials,
        assessmentType,
        options: {
          name: name || `${assessmentType.toUpperCase()} Assessment - ${new Date().toISOString()}`,
          description: description || 'Manual compliance assessment',
          triggeredBy: req.user.id,
          isScheduled: false,
          isBaseline,
          priority
        }
      }, {
        headers: {
          'x-service-token': process.env.SERVICE_AUTH_TOKEN,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      if (response.data.success) {
        logger.info(`Compliance assessment started for organization ${organizationId} by user ${req.user.id}`);
        
        res.json({
          success: true,
          message: 'Compliance assessment started successfully',
          jobId: response.data.jobId,
          assessmentType,
          organizationId
        });
      } else {
        throw new Error('Compliance service returned unsuccessful response');
      }

    } catch (error) {
      logger.error('Error starting compliance assessment:', error);
      logger.error('Error details:', {
        organizationId,
        credentials: req.credentials,
        errorMessage: error.message,
        errorResponse: error.response?.data
      });
      
      if (error.response) {
        // Compliance service returned an error
        return res.status(error.response.status || 500).json({
          error: 'Compliance assessment failed',
          message: error.response.data?.message || error.message,
          details: error.response.data
        });
      }
      
      res.status(500).json({ 
        error: 'Failed to start compliance assessment',
        message: error.message,
        details: 'Check server logs for more information'
      });
    }
  }
);

// Get compliance assessments for an organization
router.get('/assessments/:organizationId', 
  authenticateToken, 
  async (req, res) => {
    try {
      const { organizationId } = req.params;
      const { limit = 50, offset = 0, status, assessmentType } = req.query;
      const { pool } = require('../services/database');

      // Verify user has access to this organization
      const orgCheck = await pool.query(
        'SELECT 1 FROM maes.user_organizations WHERE user_id = $1 AND organization_id = $2',
        [req.user.id, organizationId]
      );

      if (orgCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied to this organization' });
      }

      let query = `
        SELECT 
          ca.id, ca.assessment_type, ca.name, ca.description, ca.status, ca.progress,
          ca.total_controls, ca.compliant_controls, ca.non_compliant_controls,
          ca.manual_review_controls, ca.not_applicable_controls, ca.error_controls,
          ca.compliance_score, ca.weighted_score, ca.started_at, ca.completed_at,
          ca.duration, ca.is_baseline, ca.is_scheduled, ca.created_at,
          u.username as triggered_by_username
        FROM maes.compliance_assessments ca
        LEFT JOIN maes.users u ON ca.triggered_by = u.id
        WHERE ca.organization_id = $1
      `;
      const params = [organizationId];
      let paramIndex = 2;

      if (status) {
        query += ` AND ca.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      if (assessmentType) {
        query += ` AND ca.assessment_type = $${paramIndex}`;
        params.push(assessmentType);
        paramIndex++;
      }

      query += ` ORDER BY ca.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(parseInt(limit), parseInt(offset));

      const result = await pool.query(query, params);

      // Get total count
      let countQuery = `
        SELECT COUNT(*) 
        FROM maes.compliance_assessments 
        WHERE organization_id = $1
      `;
      const countParams = [organizationId];
      let countParamIndex = 2;

      if (status) {
        countQuery += ` AND status = $${countParamIndex}`;
        countParams.push(status);
        countParamIndex++;
      }

      if (assessmentType) {
        countQuery += ` AND assessment_type = $${countParamIndex}`;
        countParams.push(assessmentType);
      }

      const countResult = await pool.query(countQuery, countParams);
      const totalCount = parseInt(countResult.rows[0].count);

      res.json({
        success: true,
        assessments: result.rows,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: totalCount,
          hasMore: (parseInt(offset) + result.rows.length) < totalCount
        }
      });

    } catch (error) {
      logger.error('Error fetching compliance assessments:', error);
      res.status(500).json({ 
        error: 'Failed to fetch assessments',
        message: error.message 
      });
    }
  }
);

// Get specific assessment details with results
router.get('/assessment/:assessmentId', 
  authenticateToken, 
  async (req, res) => {
    try {
      const { assessmentId } = req.params;
      const { includeResults = 'true' } = req.query;
      const { pool } = require('../services/database');

      // Get assessment details
      const assessmentResult = await pool.query(`
        SELECT 
          ca.*, o.name as organization_name,
          u.username as triggered_by_username
        FROM maes.compliance_assessments ca
        LEFT JOIN maes.organizations o ON ca.organization_id = o.id
        LEFT JOIN maes.users u ON ca.triggered_by = u.id
        WHERE ca.id = $1
      `, [assessmentId]);

      if (assessmentResult.rows.length === 0) {
        return res.status(404).json({ error: 'Assessment not found' });
      }

      const assessment = assessmentResult.rows[0];

      // Verify user has access to this organization
      const orgCheck = await pool.query(
        'SELECT 1 FROM maes.user_organizations WHERE user_id = $1 AND organization_id = $2',
        [req.user.id, assessment.organization_id]
      );

      if (orgCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied to this assessment' });
      }

      let response = {
        success: true,
        assessment
      };

      // Include results if requested
      if (includeResults === 'true') {
        const resultsQuery = `
          SELECT 
            cr.id, cr.status, cr.score, cr.actual_result, cr.expected_result,
            cr.evidence, cr.remediation_guidance, cr.error_message, cr.checked_at,
            cc.control_id, cc.section, cc.title, cc.description, cc.severity, cc.weight
          FROM maes.compliance_results cr
          JOIN maes.compliance_controls cc ON cr.control_id = cc.id
          WHERE cr.assessment_id = $1
          ORDER BY cc.control_id
        `;
        
        const resultsResult = await pool.query(resultsQuery, [assessmentId]);
        
        // Group results by section
        const resultsBySection = resultsResult.rows.reduce((acc, result) => {
          if (!acc[result.section]) {
            acc[result.section] = [];
          }
          acc[result.section].push(result);
          return acc;
        }, {});

        response.results = resultsResult.rows;
        response.resultsBySection = resultsBySection;
      }

      res.json(response);

    } catch (error) {
      logger.error('Error fetching assessment details:', error);
      res.status(500).json({ 
        error: 'Failed to fetch assessment details',
        message: error.message 
      });
    }
  }
);

// Compare two assessments
router.get('/compare/:baselineId/:currentId', 
  authenticateToken, 
  async (req, res) => {
    try {
      const { baselineId, currentId } = req.params;
      const { pool } = require('../services/database');

      // Get both assessments
      const assessmentsResult = await pool.query(`
        SELECT 
          ca.id, ca.organization_id, ca.assessment_type, ca.name, ca.compliance_score,
          ca.weighted_score, ca.completed_at, ca.total_controls, ca.compliant_controls,
          ca.non_compliant_controls
        FROM maes.compliance_assessments ca
        WHERE ca.id IN ($1, $2) AND ca.status = 'completed'
      `, [baselineId, currentId]);

      if (assessmentsResult.rows.length !== 2) {
        return res.status(400).json({ 
          error: 'Both assessments must exist and be completed' 
        });
      }

      const [assessment1, assessment2] = assessmentsResult.rows;
      const baseline = assessment1.id === baselineId ? assessment1 : assessment2;
      const current = assessment1.id === currentId ? assessment1 : assessment2;

      // Verify same organization and assessment type
      if (baseline.organization_id !== current.organization_id) {
        return res.status(400).json({ 
          error: 'Assessments must be from the same organization' 
        });
      }

      if (baseline.assessment_type !== current.assessment_type) {
        return res.status(400).json({ 
          error: 'Assessments must be of the same type' 
        });
      }

      // Verify user has access to this organization
      const orgCheck = await pool.query(
        'SELECT 1 FROM maes.user_organizations WHERE user_id = $1 AND organization_id = $2',
        [req.user.id, baseline.organization_id]
      );

      if (orgCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied to these assessments' });
      }

      // Get detailed results comparison
      const comparisonQuery = `
        WITH baseline_results AS (
          SELECT cr.control_id, cr.status as baseline_status, cr.score as baseline_score
          FROM maes.compliance_results cr
          WHERE cr.assessment_id = $1
        ),
        current_results AS (
          SELECT cr.control_id, cr.status as current_status, cr.score as current_score
          FROM maes.compliance_results cr
          WHERE cr.assessment_id = $2
        )
        SELECT 
          cc.control_id, cc.section, cc.title, cc.severity,
          br.baseline_status, br.baseline_score,
          cr.current_status, cr.current_score,
          CASE 
            WHEN br.baseline_status != cr.current_status THEN 'changed'
            WHEN br.baseline_score != cr.current_score THEN 'score_changed'
            ELSE 'unchanged'
          END as change_type
        FROM maes.compliance_controls cc
        LEFT JOIN baseline_results br ON cc.id = br.control_id
        LEFT JOIN current_results cr ON cc.id = cr.control_id
        WHERE cc.assessment_type = $3
        ORDER BY cc.control_id
      `;

      const comparisonResult = await pool.query(comparisonQuery, [
        baselineId, currentId, baseline.assessment_type
      ]);

      // Analyze changes
      const changes = {
        improved: [],
        degraded: [],
        unchanged: [],
        new_issues: [],
        resolved: []
      };

      comparisonResult.rows.forEach(control => {
        const { baseline_status, current_status, change_type } = control;
        
        if (change_type === 'unchanged') {
          changes.unchanged.push(control);
        } else if (baseline_status === 'non_compliant' && current_status === 'compliant') {
          changes.resolved.push(control);
        } else if (baseline_status === 'compliant' && current_status === 'non_compliant') {
          changes.new_issues.push(control);
        } else if (baseline_status === 'non_compliant' && current_status === 'manual_review') {
          changes.improved.push(control);
        } else if (baseline_status === 'manual_review' && current_status === 'non_compliant') {
          changes.degraded.push(control);
        }
      });

      // Calculate score change
      const scoreChange = current.compliance_score - baseline.compliance_score;
      const weightedScoreChange = current.weighted_score - baseline.weighted_score;

      res.json({
        success: true,
        baseline: {
          id: baseline.id,
          name: baseline.name,
          completedAt: baseline.completed_at,
          score: baseline.compliance_score,
          weightedScore: baseline.weighted_score
        },
        current: {
          id: current.id,
          name: current.name,
          completedAt: current.completed_at,
          score: current.compliance_score,
          weightedScore: current.weighted_score
        },
        changes: {
          scoreChange: Math.round(scoreChange * 100) / 100,
          weightedScoreChange: Math.round(weightedScoreChange * 100) / 100,
          totalChanges: changes.improved.length + changes.degraded.length + 
                       changes.new_issues.length + changes.resolved.length,
          improved: changes.improved.length,
          degraded: changes.degraded.length,
          newIssues: changes.new_issues.length,
          resolved: changes.resolved.length,
          unchanged: changes.unchanged.length
        },
        detailedChanges: changes,
        summary: {
          trend: scoreChange > 0 ? 'improving' : scoreChange < 0 ? 'declining' : 'stable',
          significance: Math.abs(scoreChange) > 5 ? 'significant' : 'minor'
        }
      });

    } catch (error) {
      logger.error('Error comparing assessments:', error);
      res.status(500).json({ 
        error: 'Failed to compare assessments',
        message: error.message 
      });
    }
  }
);

// Test Graph API connection for an organization
router.post('/test-connection/:organizationId', 
  authenticateToken, 
  requireRole('admin'),
  getOrganizationCredentials,
  async (req, res) => {
    try {
      const complianceServiceUrl = process.env.COMPLIANCE_SERVICE_URL || 'http://compliance:3002';
      
      // We'll implement a test endpoint in the compliance service
      // For now, return a simple response
      res.json({
        success: true,
        message: 'Graph API connection test functionality will be implemented in compliance service',
        organizationId: req.params.organizationId,
        credentialsConfigured: true
      });

    } catch (error) {
      logger.error('Error testing Graph API connection:', error);
      res.status(500).json({ 
        error: 'Failed to test connection',
        message: error.message 
      });
    }
  }
);

// Schedule management endpoints
router.post('/schedule/:organizationId',
  authenticateToken,
  requireRole('admin'),
  [
    body('name').notEmpty().isLength({ min: 1, max: 255 }),
    body('frequency').isIn(['daily', 'weekly', 'monthly', 'quarterly']),
    body('assessmentType').optional().isIn(['cis_v400', 'cis_v300', 'custom', 'orca_style'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { organizationId } = req.params;
      const { name, description, frequency, assessmentType = 'cis_v400' } = req.body;

      const complianceServiceUrl = process.env.COMPLIANCE_SERVICE_URL || 'http://compliance:3002';
      
      const response = await axios.post(`${complianceServiceUrl}/api/schedule`, {
        organizationId,
        name,
        description,
        assessmentType,
        frequency,
        createdBy: req.user.id
      }, {
        headers: {
          'x-service-token': process.env.SERVICE_AUTH_TOKEN,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      if (response.data.success) {
        logger.info(`Created compliance schedule for organization ${organizationId} by user ${req.user.id}`);
        res.json({
          success: true,
          schedule: response.data.schedule,
          message: 'Compliance schedule created successfully'
        });
      } else {
        throw new Error('Compliance service returned unsuccessful response');
      }

    } catch (error) {
      logger.error('Error creating compliance schedule:', error);
      
      if (error.response) {
        return res.status(error.response.status || 500).json({
          error: 'Failed to create schedule',
          message: error.response.data?.message || error.message
        });
      }
      
      res.status(500).json({ 
        error: 'Failed to create compliance schedule',
        message: error.message 
      });
    }
  }
);

router.get('/schedules/:organizationId',
  authenticateToken,
  async (req, res) => {
    try {
      const { organizationId } = req.params;
      const { pool } = require('../services/database');

      // Verify user has access to this organization
      const orgCheck = await pool.query(
        'SELECT 1 FROM maes.user_organizations WHERE user_id = $1 AND organization_id = $2',
        [req.user.id, organizationId]
      );

      if (orgCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied to this organization' });
      }

      const complianceServiceUrl = process.env.COMPLIANCE_SERVICE_URL || 'http://compliance:3002';
      
      const response = await axios.get(`${complianceServiceUrl}/api/schedules/${organizationId}`, {
        headers: {
          'x-service-token': process.env.SERVICE_AUTH_TOKEN
        },
        timeout: 10000
      });

      if (response.data.success) {
        res.json({
          success: true,
          schedules: response.data.schedules
        });
      } else {
        throw new Error('Compliance service returned unsuccessful response');
      }

    } catch (error) {
      logger.error('Error fetching compliance schedules:', error);
      
      if (error.response) {
        return res.status(error.response.status || 500).json({
          error: 'Failed to fetch schedules',
          message: error.response.data?.message || error.message
        });
      }
      
      res.status(500).json({ 
        error: 'Failed to fetch compliance schedules',
        message: error.message 
      });
    }
  }
);

router.put('/schedule/:scheduleId',
  authenticateToken,
  requireRole('admin'),
  async (req, res) => {
    try {
      const { scheduleId } = req.params;
      const complianceServiceUrl = process.env.COMPLIANCE_SERVICE_URL || 'http://compliance:3002';
      
      const response = await axios.put(`${complianceServiceUrl}/api/schedule/${scheduleId}`, req.body, {
        headers: {
          'x-service-token': process.env.SERVICE_AUTH_TOKEN,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      if (response.data.success) {
        res.json({
          success: true,
          schedule: response.data.schedule,
          message: 'Schedule updated successfully'
        });
      } else {
        throw new Error('Compliance service returned unsuccessful response');
      }

    } catch (error) {
      logger.error('Error updating compliance schedule:', error);
      
      if (error.response) {
        return res.status(error.response.status || 500).json({
          error: 'Failed to update schedule',
          message: error.response.data?.message || error.message
        });
      }
      
      res.status(500).json({ 
        error: 'Failed to update compliance schedule',
        message: error.message 
      });
    }
  }
);

router.delete('/schedule/:scheduleId',
  authenticateToken,
  requireRole('admin'),
  async (req, res) => {
    try {
      const { scheduleId } = req.params;
      const complianceServiceUrl = process.env.COMPLIANCE_SERVICE_URL || 'http://compliance:3002';
      
      const response = await axios.delete(`${complianceServiceUrl}/api/schedule/${scheduleId}`, {
        headers: {
          'x-service-token': process.env.SERVICE_AUTH_TOKEN
        },
        timeout: 10000
      });

      if (response.data.success) {
        res.json({
          success: true,
          message: 'Schedule deleted successfully'
        });
      } else {
        throw new Error('Compliance service returned unsuccessful response');
      }

    } catch (error) {
      logger.error('Error deleting compliance schedule:', error);
      
      if (error.response) {
        return res.status(error.response.status || 500).json({
          error: 'Failed to delete schedule',
          message: error.response.data?.message || error.message
        });
      }
      
      res.status(500).json({ 
        error: 'Failed to delete compliance schedule',
        message: error.message 
      });
    }
  }
);

// Generate compliance assessment report
router.get('/assessment/:assessmentId/report', 
  authenticateToken, 
  async (req, res) => {
    try {
      const { assessmentId } = req.params;
      const { format = 'html' } = req.query;
      const { pool } = require('../services/database');

      // Get assessment details with results
      const assessmentResult = await pool.query(`
        SELECT 
          ca.*, o.name as organization_name, o.tenant_id,
          u.username as triggered_by_username, u.email as triggered_by_email
        FROM maes.compliance_assessments ca
        LEFT JOIN maes.organizations o ON ca.organization_id = o.id
        LEFT JOIN maes.users u ON ca.triggered_by = u.id
        WHERE ca.id = $1 AND ca.status = 'completed'
      `, [assessmentId]);

      if (assessmentResult.rows.length === 0) {
        return res.status(404).json({ error: 'Assessment not found or not completed' });
      }

      const assessment = assessmentResult.rows[0];

      // Verify user has access to this organization
      const orgCheck = await pool.query(
        'SELECT 1 FROM maes.user_organizations WHERE user_id = $1 AND organization_id = $2',
        [req.user.id, assessment.organization_id]
      );

      if (orgCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied to this assessment' });
      }

      // Get detailed results with control information
      const resultsQuery = `
        SELECT 
          cr.id, cr.status, cr.score, cr.actual_result, cr.expected_result,
          cr.evidence, cr.remediation_guidance, cr.error_message, cr.checked_at,
          cc.control_id, cc.section, cc.title, cc.description, cc.severity, 
          cc.weight, cc.rationale, cc.impact, cc.remediation
        FROM maes.compliance_results cr
        JOIN maes.compliance_controls cc ON cr.control_id = cc.id
        WHERE cr.assessment_id = $1
        ORDER BY cc.control_id
      `;
      
      const resultsResult = await pool.query(resultsQuery, [assessmentId]);
      const results = resultsResult.rows;

      // Parse metadata for tenant info and permission check
      const tenantInfo = assessment.metadata?.tenantInfo || {};
      const permissionCheck = assessment.metadata?.permissionCheck || {};

      // Group results by section and status
      const resultsBySection = results.reduce((acc, result) => {
        if (!acc[result.section]) {
          acc[result.section] = [];
        }
        acc[result.section].push(result);
        return acc;
      }, {});

      const resultsByStatus = results.reduce((acc, result) => {
        if (!acc[result.status]) {
          acc[result.status] = [];
        }
        acc[result.status].push(result);
        return acc;
      }, {});

      // Extract failing entities from evidence
      const failingEntities = [];
      results.forEach(result => {
        if (result.evidence && result.evidence.failingEntities) {
          result.evidence.failingEntities.forEach(entity => {
            failingEntities.push({
              ...entity,
              controlId: result.control_id,
              controlTitle: result.title,
              section: result.section
            });
          });
        }
      });

      // Generate HTML report
      if (format === 'html') {
        const htmlReport = generateHTMLReport({
          assessment,
          results,
          resultsBySection,
          resultsByStatus,
          tenantInfo,
          permissionCheck,
          failingEntities
        });

        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Content-Disposition', `inline; filename="compliance-report-${assessmentId}.html"`);
        return res.send(htmlReport);
      }

      // Return JSON format
      res.json({
        success: true,
        report: {
          assessment: {
            id: assessment.id,
            name: assessment.name,
            description: assessment.description,
            organizationName: assessment.organization_name,
            assessmentType: assessment.assessment_type,
            status: assessment.status,
            complianceScore: assessment.compliance_score,
            weightedScore: assessment.weighted_score,
            startedAt: assessment.started_at,
            completedAt: assessment.completed_at,
            duration: assessment.duration,
            triggeredBy: assessment.triggered_by_username,
            totalControls: assessment.total_controls,
            compliantControls: assessment.compliant_controls,
            nonCompliantControls: assessment.non_compliant_controls,
            manualReviewControls: assessment.manual_review_controls,
            errorControls: assessment.error_controls
          },
          tenantInfo: {
            id: tenantInfo.id,
            displayName: tenantInfo.displayName,
            primaryDomain: tenantInfo.primaryDomain,
            userCount: tenantInfo.userCount,
            groupCount: tenantInfo.groupCount,
            applicationCount: tenantInfo.applicationCount,
            roleCount: tenantInfo.roleCount,
            totalLicenses: tenantInfo.totalLicenses,
            assignedLicenses: tenantInfo.assignedLicenses,
            country: tenantInfo.country,
            createdDateTime: tenantInfo.createdDateTime
          },
          apiPermissions: {
            availablePermissions: permissionCheck.availablePermissions?.length || 0,
            missingPermissions: permissionCheck.missingPermissions?.length || 0,
            criticalMissing: permissionCheck.criticalMissing?.length || 0,
            permissionScore: permissionCheck.permissionScore || 0
          },
          summary: {
            totalResults: results.length,
            compliantCount: resultsByStatus.compliant?.length || 0,
            nonCompliantCount: resultsByStatus.non_compliant?.length || 0,
            manualReviewCount: resultsByStatus.manual_review?.length || 0,
            errorCount: resultsByStatus.error?.length || 0,
            sectionsEvaluated: Object.keys(resultsBySection).length,
            failingEntitiesCount: failingEntities.length
          },
          resultsBySection,
          failingEntities: failingEntities.slice(0, 100), // Limit for performance
          nonCompliantControls: resultsByStatus.non_compliant || [],
          recommendations: generateRecommendations(resultsByStatus, failingEntities)
        }
      });

    } catch (error) {
      logger.error('Error generating compliance report:', error);
      res.status(500).json({ 
        error: 'Failed to generate compliance report',
        message: error.message 
      });
    }
  }
);

// Helper function to generate HTML report
function generateHTMLReport({ assessment, results, resultsBySection, resultsByStatus, tenantInfo, permissionCheck, failingEntities }) {
  const complianceColor = assessment.compliance_score >= 80 ? 'success' : assessment.compliance_score >= 60 ? 'warning' : 'danger';
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Compliance Assessment Report - ${assessment.name}</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        .report-header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
        .metric-card { border-left: 4px solid #007bff; }
        .status-compliant { color: #28a745; }
        .status-non-compliant { color: #dc3545; }
        .status-manual-review { color: #ffc107; }
        .status-error { color: #dc3545; }
        .failing-entity { background-color: #fff5f5; border-left: 3px solid #dc3545; margin: 5px 0; padding: 10px; }
        @media print { .no-print { display: none !important; } }
    </style>
</head>
<body>
    <div class="container-fluid">
        <!-- Header -->
        <div class="report-header p-4 mb-4">
            <h1>${assessment.name}</h1>
            <p class="mb-0">Generated on ${new Date().toLocaleString()} | Organization: ${assessment.organization_name}</p>
        </div>

        <!-- Executive Summary -->
        <div class="row mb-4">
            <div class="col-12">
                <h2>Executive Summary</h2>
                <div class="row">
                    <div class="col-md-3">
                        <div class="card metric-card h-100">
                            <div class="card-body text-center">
                                <h3 class="text-${complianceColor}">${assessment.compliance_score}%</h3>
                                <p class="card-text">Overall Compliance</p>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="card metric-card h-100">
                            <div class="card-body text-center">
                                <h3 class="text-success">${assessment.compliant_controls}</h3>
                                <p class="card-text">Compliant Controls</p>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="card metric-card h-100">
                            <div class="card-body text-center">
                                <h3 class="text-danger">${assessment.non_compliant_controls}</h3>
                                <p class="card-text">Non-Compliant</p>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="card metric-card h-100">
                            <div class="card-body text-center">
                                <h3>${failingEntities.length}</h3>
                                <p class="card-text">Failing Entities</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Tenant Information -->
        <div class="row mb-4">
            <div class="col-md-6">
                <div class="card">
                    <div class="card-header">
                        <h4>Tenant Information</h4>
                    </div>
                    <div class="card-body">
                        <table class="table table-borderless">
                            <tr><td><strong>Tenant ID:</strong></td><td>${tenantInfo.id || 'N/A'}</td></tr>
                            <tr><td><strong>Display Name:</strong></td><td>${tenantInfo.displayName || 'N/A'}</td></tr>
                            <tr><td><strong>Primary Domain:</strong></td><td>${tenantInfo.primaryDomain || 'N/A'}</td></tr>
                            <tr><td><strong>Users:</strong></td><td>${tenantInfo.userCount || 0}</td></tr>
                            <tr><td><strong>Groups:</strong></td><td>${tenantInfo.groupCount || 0}</td></tr>
                            <tr><td><strong>Applications:</strong></td><td>${tenantInfo.applicationCount || 0}</td></tr>
                            <tr><td><strong>Licenses:</strong></td><td>${tenantInfo.assignedLicenses || 0} / ${tenantInfo.totalLicenses || 0}</td></tr>
                        </table>
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="card">
                    <div class="card-header">
                        <h4>API Permissions Status</h4>
                    </div>
                    <div class="card-body">
                        <div class="progress mb-3">
                            <div class="progress-bar bg-success" style="width: ${permissionCheck.permissionScore || 0}%">
                                ${permissionCheck.permissionScore || 0}%
                            </div>
                        </div>
                        <p>Available: ${permissionCheck.availablePermissions?.length || 0} permissions</p>
                        <p>Missing: ${permissionCheck.missingPermissions?.length || 0} permissions</p>
                        ${permissionCheck.criticalMissing?.length > 0 ? `<p class="text-danger">Critical Missing: ${permissionCheck.criticalMissing.length}</p>` : ''}
                    </div>
                </div>
            </div>
        </div>

        <!-- Failing Entities -->
        ${failingEntities.length > 0 ? `
        <div class="row mb-4">
            <div class="col-12">
                <h3>Failing Entities</h3>
                <div class="accordion" id="failingEntitiesAccordion">
                    ${failingEntities.slice(0, 20).map((entity, index) => `
                    <div class="failing-entity">
                        <strong>${entity.type}:</strong> ${entity.displayName || entity.userPrincipalName || 'Unknown'}
                        <br><small>Control: ${entity.controlId} - ${entity.controlTitle}</small>
                        <br><small>Reason: ${entity.reason}</small>
                        ${entity.lastSignIn ? `<br><small>Last Sign-in: ${new Date(entity.lastSignIn).toLocaleString()}</small>` : ''}
                    </div>
                    `).join('')}
                    ${failingEntities.length > 20 ? `<p class="text-muted">... and ${failingEntities.length - 20} more entities</p>` : ''}
                </div>
            </div>
        </div>
        ` : ''}

        <!-- Control Results by Section -->
        <div class="row mb-4">
            <div class="col-12">
                <h3>Control Results by Section</h3>
                ${Object.entries(resultsBySection).map(([section, controls]) => `
                <div class="card mb-3">
                    <div class="card-header">
                        <h5>${section} (${controls.filter(c => c.status === 'compliant').length}/${controls.length} Compliant)</h5>
                    </div>
                    <div class="card-body">
                        ${controls.map(control => `
                        <div class="mb-3 p-3 border-start border-3 ${control.status === 'compliant' ? 'border-success' : control.status === 'non_compliant' ? 'border-danger' : 'border-warning'}">
                            <div class="d-flex justify-content-between align-items-start">
                                <div>
                                    <strong>${control.control_id}:</strong> ${control.title}
                                    <span class="badge bg-${control.severity === 'level1' ? 'primary' : 'secondary'} ms-2">${control.severity}</span>
                                </div>
                                <span class="status-${control.status.replace('_', '-')}">${control.status.replace('_', ' ').toUpperCase()}</span>
                            </div>
                            <p class="mb-2 text-muted">${control.description}</p>
                            ${control.remediation_guidance ? `<div class="alert alert-info"><strong>Remediation:</strong> ${control.remediation_guidance}</div>` : ''}
                            ${control.error_message ? `<div class="alert alert-danger"><strong>Error:</strong> ${control.error_message}</div>` : ''}
                        </div>
                        `).join('')}
                    </div>
                </div>
                `).join('')}
            </div>
        </div>

        <!-- Assessment Details -->
        <div class="row mb-4">
            <div class="col-12">
                <h3>Assessment Details</h3>
                <table class="table table-bordered">
                    <tr><td><strong>Assessment Type:</strong></td><td>${assessment.assessment_type.toUpperCase()}</td></tr>
                    <tr><td><strong>Started:</strong></td><td>${new Date(assessment.started_at).toLocaleString()}</td></tr>
                    <tr><td><strong>Completed:</strong></td><td>${new Date(assessment.completed_at).toLocaleString()}</td></tr>
                    <tr><td><strong>Duration:</strong></td><td>${Math.floor(assessment.duration / 60)} minutes ${assessment.duration % 60} seconds</td></tr>
                    <tr><td><strong>Triggered By:</strong></td><td>${assessment.triggered_by_username}</td></tr>
                </table>
            </div>
        </div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
  `;
}

// Helper function to generate recommendations
function generateRecommendations(resultsByStatus, failingEntities) {
  const recommendations = [];
  
  if (resultsByStatus.non_compliant?.length > 0) {
    recommendations.push({
      priority: 'High',
      category: 'Security Controls',
      title: `Address ${resultsByStatus.non_compliant.length} Non-Compliant Controls`,
      description: 'Review and implement remediation guidance for all non-compliant controls to improve security posture.'
    });
  }

  const userFailures = failingEntities.filter(e => e.type === 'User');
  if (userFailures.length > 0) {
    recommendations.push({
      priority: 'High',
      category: 'User Management',
      title: `Review ${userFailures.length} Users with Compliance Issues`,
      description: 'These users have configuration issues that need immediate attention, particularly around MFA and access controls.'
    });
  }

  const policyGaps = failingEntities.filter(e => e.type === 'Policy Gap');
  if (policyGaps.length > 0) {
    recommendations.push({
      priority: 'Critical',
      category: 'Policy Configuration',
      title: 'Address Policy Coverage Gaps',
      description: 'Critical security policies are missing or have incomplete coverage. Review and enhance conditional access policies.'
    });
  }

  if (resultsByStatus.manual_review?.length > 0) {
    recommendations.push({
      priority: 'Medium',
      category: 'Manual Review',
      title: `${resultsByStatus.manual_review.length} Controls Require Manual Review`,
      description: 'These controls cannot be automatically assessed and require manual verification.'
    });
  }

  return recommendations;
}

// Report generation endpoints
router.post('/assessments/:assessmentId/report',
  authenticateToken,
  requirePermission('canManageCompliance'),
  [
    body('format').optional().isIn(['html', 'json', 'csv', 'pdf', 'xlsx']).withMessage('Invalid format'),
    body('type').optional().isIn(['full', 'executive', 'remediation', 'comparison']).withMessage('Invalid report type'),
    body('options').optional().isObject().withMessage('Options must be an object')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { assessmentId } = req.params;
      const { format = 'html', type = 'full', options = {} } = req.body;

      // Verify the assessment belongs to the user's organization
      const assessment = await getRow(
        `SELECT * FROM maes.compliance_assessments 
         WHERE id = $1 AND organization_id = $2`,
        [assessmentId, req.organizationId]
      );

      if (!assessment) {
        return res.status(404).json({
          error: 'Assessment not found'
        });
      }

      if (assessment.status !== 'completed') {
        return res.status(400).json({
          error: 'Assessment must be completed before generating a report'
        });
      }

      // Forward request to compliance service
      const response = await axios.post(
        `http://compliance:3002/api/assessment/${assessmentId}/report`,
        { format, type, options },
        {
          headers: {
            'x-service-token': process.env.SERVICE_AUTH_TOKEN,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info(`Report generation initiated for assessment ${assessmentId}`);

      res.json(response.data);

    } catch (error) {
      logger.error('Generate report error:', error);
      
      if (error.response) {
        return res.status(error.response.status).json(error.response.data);
      }
      
      res.status(500).json({
        error: 'Failed to generate report',
        message: error.message
      });
    }
  }
);

// Get reports for an assessment
router.get('/assessments/:assessmentId/reports',
  authenticateToken,
  requirePermission('canManageCompliance'),
  async (req, res) => {
    try {
      const { assessmentId } = req.params;

      // Verify the assessment belongs to the user's organization
      const assessment = await getRow(
        `SELECT * FROM maes.compliance_assessments 
         WHERE id = $1 AND organization_id = $2`,
        [assessmentId, req.organizationId]
      );

      if (!assessment) {
        return res.status(404).json({
          error: 'Assessment not found'
        });
      }

      // Forward request to compliance service
      const response = await axios.get(
        `http://compliance:3002/api/assessment/${assessmentId}/reports`,
        {
          headers: {
            'x-service-token': process.env.SERVICE_AUTH_TOKEN
          }
        }
      );

      res.json(response.data);

    } catch (error) {
      logger.error('Get reports error:', error);
      
      if (error.response) {
        return res.status(error.response.status).json(error.response.data);
      }
      
      res.status(500).json({
        error: 'Failed to get reports',
        message: error.message
      });
    }
  }
);

// Download report
router.get('/assessments/:assessmentId/report/:fileName/download',
  authenticateToken,
  requirePermission('canManageCompliance'),
  async (req, res) => {
    try {
      const { assessmentId, fileName } = req.params;

      // Verify the assessment belongs to the user's organization
      const assessment = await getRow(
        `SELECT * FROM maes.compliance_assessments 
         WHERE id = $1 AND organization_id = $2`,
        [assessmentId, req.organizationId]
      );

      if (!assessment) {
        return res.status(404).json({
          error: 'Assessment not found'
        });
      }

      // Stream the file from compliance service
      const response = await axios.get(
        `http://compliance:3002/api/assessment/${assessmentId}/report/${fileName}/download`,
        {
          headers: {
            'x-service-token': process.env.SERVICE_AUTH_TOKEN
          },
          responseType: 'stream'
        }
      );

      // Forward headers
      if (response.headers['content-type']) {
        res.setHeader('Content-Type', response.headers['content-type']);
      }
      if (response.headers['content-disposition']) {
        res.setHeader('Content-Disposition', response.headers['content-disposition']);
      }
      if (response.headers['content-length']) {
        res.setHeader('Content-Length', response.headers['content-length']);
      }

      // Stream the file to the client
      response.data.pipe(res);

    } catch (error) {
      logger.error('Download report error:', error);
      
      if (error.response && error.response.status !== 500) {
        return res.status(error.response.status).json({
          error: error.response.data?.error || 'Failed to download report'
        });
      }
      
      res.status(500).json({
        error: 'Failed to download report',
        message: error.message
      });
    }
  }
);

module.exports = router;