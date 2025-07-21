const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { apiRateLimiter } = require('../middleware/rateLimiter');
const { logger } = require('../utils/logger');
const axios = require('axios');

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

    if (!credentials || !credentials.clientId || !credentials.clientSecret || !credentials.tenantId) {
      return res.status(400).json({ 
        error: 'Organization credentials are not properly configured',
        details: 'Missing clientId, clientSecret, or tenantId'
      });
    }

    req.organization = organization;
    req.credentials = {
      tenantId: credentials.tenantId || organization.tenant_id,
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret
    };

    next();
  } catch (error) {
    logger.error('Error fetching organization credentials:', error);
    res.status(500).json({ error: 'Failed to fetch organization credentials' });
  }
}

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
      
      if (error.response) {
        // Compliance service returned an error
        return res.status(error.response.status || 500).json({
          error: 'Compliance assessment failed',
          message: error.response.data?.message || error.message
        });
      }
      
      res.status(500).json({ 
        error: 'Failed to start compliance assessment',
        message: error.message 
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

module.exports = router;