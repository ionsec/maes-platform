const { ComplianceAssessment, ComplianceControl, ComplianceResult } = require('../models');
const graphClientService = require('./graphClient');
const { logger } = require('../logger');

class AssessmentEngine {
  constructor() {
    this.controlCheckers = new Map();
    this.initializeControlCheckers();
  }

  /**
   * Initialize control checking functions
   */
  initializeControlCheckers() {
    // CIS v4.0.0 control checkers
    this.controlCheckers.set('1.1.1', this.checkGlobalAdminMFA.bind(this));
    this.controlCheckers.set('1.1.2', this.checkAdminAccountsNaming.bind(this));
    this.controlCheckers.set('1.1.3', this.checkGuestUserRestrictions.bind(this));
    this.controlCheckers.set('1.2.1', this.checkConditionalAccessMFA.bind(this));
    this.controlCheckers.set('1.2.2', this.checkBlockLegacyAuth.bind(this));
    this.controlCheckers.set('3.1.1', this.checkOAuthAppReview.bind(this));
    this.controlCheckers.set('6.5.4', this.checkSMTPAuthDisabled.bind(this));
    this.controlCheckers.set('7.2.11', this.checkSharePointSharingLinks.bind(this));
    this.controlCheckers.set('8.2.2', this.checkTeamsExternalAccess.bind(this));
    
    // Add more control checkers as needed
    logger.info(`Initialized ${this.controlCheckers.size} compliance control checkers`);
  }

  /**
   * Run compliance assessment for an organization
   * @param {string} organizationId - Organization ID
   * @param {Object} credentials - Organization credentials
   * @param {string} assessmentType - Type of assessment (e.g., 'cis_v400')
   * @param {Object} options - Assessment options
   * @returns {Object} Assessment results
   */
  async runAssessment(organizationId, credentials, assessmentType = 'cis_v400', options = {}) {
    let assessment = null;
    
    try {
      // Create assessment record
      assessment = await ComplianceAssessment.create({
        organization_id: organizationId,
        assessment_type: assessmentType,
        name: options.name || `${assessmentType.toUpperCase()} Assessment - ${new Date().toISOString()}`,
        description: options.description || `Automated compliance assessment`,
        triggered_by: options.triggeredBy,
        is_scheduled: options.isScheduled || false,
        is_baseline: options.isBaseline || false,
        parameters: options.parameters || {},
        metadata: {
          startTime: new Date().toISOString(),
          version: '1.0.0'
        }
      });

      logger.info(`Started compliance assessment ${assessment.id} for organization ${organizationId}`);

      // Update assessment status
      await assessment.update({
        status: 'running',
        started_at: new Date()
      });

      // Get applicable controls
      const controls = await ComplianceControl.findAll({
        where: {
          assessment_type: assessmentType,
          is_active: true
        },
        order: [['control_id', 'ASC']]
      });

      if (controls.length === 0) {
        throw new Error(`No active controls found for assessment type: ${assessmentType}`);
      }

      logger.info(`Found ${controls.length} controls to evaluate`);

      // Update assessment with total controls
      await assessment.update({
        total_controls: controls.length,
        progress: 5
      });

      // Create Graph client
      const graphClient = await graphClientService.getGraphClient(organizationId, credentials);

      // Test connection first
      const connectionTest = await graphClientService.testConnection(graphClient);
      if (!connectionTest.success) {
        logger.warn(`Graph API connection test failed, continuing with limited functionality:`, connectionTest);
      }

      // Run controls evaluation
      const results = [];
      let completedControls = 0;
      let complianceStats = {
        compliant: 0,
        nonCompliant: 0,
        manualReview: 0,
        notApplicable: 0,
        error: 0
      };

      for (const control of controls) {
        try {
          logger.debug(`Evaluating control ${control.control_id}: ${control.title}`);
          
          const result = await this.evaluateControl(assessment.id, control, graphClient);
          results.push(result);

          // Update statistics
          switch (result.status) {
            case 'compliant':
              complianceStats.compliant++;
              break;
            case 'non_compliant':
              complianceStats.nonCompliant++;
              break;
            case 'manual_review':
              complianceStats.manualReview++;
              break;
            case 'not_applicable':
              complianceStats.notApplicable++;
              break;
            case 'error':
              complianceStats.error++;
              break;
          }

          completedControls++;
          const progress = Math.floor((completedControls / controls.length) * 90) + 5; // 5-95%
          
          await assessment.update({ progress });

          logger.debug(`Control ${control.control_id} evaluated: ${result.status}`);

        } catch (error) {
          logger.error(`Error evaluating control ${control.control_id}:`, error);
          
          // Create error result
          await ComplianceResult.create({
            assessment_id: assessment.id,
            control_id: control.id,
            status: 'error',
            score: 0,
            error_message: error.message,
            error_details: { stack: error.stack }
          });

          complianceStats.error++;
          completedControls++;
        }
      }

      // Calculate overall compliance score
      const { overallScore, weightedScore } = this.calculateComplianceScores(results, controls);

      // Update final assessment status
      await assessment.update({
        status: 'completed',
        completed_at: new Date(),
        progress: 100,
        compliant_controls: complianceStats.compliant,
        non_compliant_controls: complianceStats.nonCompliant,
        manual_review_controls: complianceStats.manualReview,
        not_applicable_controls: complianceStats.notApplicable,
        error_controls: complianceStats.error,
        compliance_score: overallScore,
        weighted_score: weightedScore,
        duration: Math.floor((new Date() - assessment.started_at) / 1000),
        metadata: {
          ...assessment.metadata,
          endTime: new Date().toISOString(),
          connectionTest: connectionTest
        }
      });

      logger.info(`Compliance assessment ${assessment.id} completed with score: ${overallScore}%`);

      return {
        success: true,
        assessmentId: assessment.id,
        totalControls: controls.length,
        results: results,
        statistics: complianceStats,
        overallScore: overallScore,
        weightedScore: weightedScore,
        duration: assessment.duration
      };

    } catch (error) {
      logger.error(`Compliance assessment failed:`, error);

      if (assessment) {
        await assessment.update({
          status: 'failed',
          completed_at: new Date(),
          error_message: error.message,
          error_details: { stack: error.stack },
          duration: assessment.started_at ? 
            Math.floor((new Date() - assessment.started_at) / 1000) : null
        });
      }

      throw error;
    }
  }

  /**
   * Evaluate a single control
   * @param {string} assessmentId - Assessment ID
   * @param {Object} control - Control definition
   * @param {Object} graphClient - Microsoft Graph client
   * @returns {Object} Control evaluation result
   */
  async evaluateControl(assessmentId, control, graphClient) {
    const startTime = new Date();

    try {
      const checker = this.controlCheckers.get(control.control_id);
      
      if (!checker) {
        // No automated checker available, mark for manual review
        const result = await ComplianceResult.create({
          assessment_id: assessmentId,
          control_id: control.id,
          status: 'manual_review',
          score: 0,
          remediation_guidance: `Automated check not available for control ${control.control_id}. Manual review required.`,
          metadata: {
            reason: 'no_automated_checker'
          }
        });

        return {
          controlId: control.control_id,
          status: 'manual_review',
          score: 0,
          result: result
        };
      }

      // Run the automated checker
      const checkResult = await checker(graphClient, control);
      
      // Create compliance result record
      const result = await ComplianceResult.create({
        assessment_id: assessmentId,
        control_id: control.id,
        status: checkResult.status,
        score: checkResult.score || 0,
        actual_result: checkResult.actualResult,
        expected_result: control.expected_result,
        evidence: checkResult.evidence,
        remediation_guidance: checkResult.remediationGuidance,
        error_message: checkResult.error,
        metadata: {
          checkDuration: new Date() - startTime,
          checkerVersion: '1.0.0'
        }
      });

      return {
        controlId: control.control_id,
        status: checkResult.status,
        score: checkResult.score || 0,
        result: result
      };

    } catch (error) {
      logger.error(`Error in control evaluation ${control.control_id}:`, error);
      
      const result = await ComplianceResult.create({
        assessment_id: assessmentId,
        control_id: control.id,
        status: 'error',
        score: 0,
        error_message: error.message,
        error_details: { stack: error.stack },
        metadata: {
          checkDuration: new Date() - startTime
        }
      });

      return {
        controlId: control.control_id,
        status: 'error',
        score: 0,
        result: result
      };
    }
  }

  /**
   * Calculate overall compliance scores
   * @param {Array} results - Control evaluation results
   * @param {Array} controls - Control definitions
   * @returns {Object} Calculated scores
   */
  calculateComplianceScores(results, controls) {
    if (results.length === 0) {
      return { overallScore: 0, weightedScore: 0 };
    }

    // Simple score: percentage of compliant controls
    const compliantCount = results.filter(r => r.status === 'compliant').length;
    const evaluatedCount = results.filter(r => r.status !== 'not_applicable').length;
    const overallScore = evaluatedCount > 0 ? (compliantCount / evaluatedCount) * 100 : 0;

    // Weighted score: based on control weights and severity
    let totalWeightedScore = 0;
    let totalWeight = 0;

    results.forEach(result => {
      const control = controls.find(c => c.control_id === result.controlId);
      if (control && result.status !== 'not_applicable') {
        const weight = control.weight || 1.0;
        const severityMultiplier = control.severity === 'level2' ? 1.5 : 1.0;
        const adjustedWeight = weight * severityMultiplier;
        
        totalWeightedScore += (result.score / 100) * adjustedWeight;
        totalWeight += adjustedWeight;
      }
    });

    const weightedScore = totalWeight > 0 ? (totalWeightedScore / totalWeight) * 100 : 0;

    return {
      overallScore: Math.round(overallScore * 100) / 100,
      weightedScore: Math.round(weightedScore * 100) / 100
    };
  }

  // Control checker implementations
  async checkGlobalAdminMFA(graphClient, control) {
    try {
      // Get directory roles to find Global Administrator role
      const roles = await graphClient.api('/directoryRoles').get();
      const globalAdminRole = roles.value.find(role => 
        role.displayName === 'Global Administrator'
      );

      if (!globalAdminRole) {
        return {
          status: 'error',
          error: 'Could not find Global Administrator role'
        };
      }

      // Get members of Global Administrator role
      const members = await graphClient
        .api(`/directoryRoles/${globalAdminRole.id}/members`)
        .get();

      if (members.value.length === 0) {
        return {
          status: 'not_applicable',
          actualResult: { globalAdminCount: 0 },
          evidence: { members: [] }
        };
      }

      // Check MFA status for each global admin
      let mfaEnabled = 0;
      let totalAdmins = members.value.length;
      const adminDetails = [];

      for (const member of members.value) {
        try {
          const authMethods = await graphClient
            .api(`/users/${member.id}/authentication/methods`)
            .get();

          const hasMFA = authMethods.value.some(method => 
            method['@odata.type'].includes('microsoftAuthenticator') ||
            method['@odata.type'].includes('phoneAuthentication')
          );

          if (hasMFA) {
            mfaEnabled++;
          }

          adminDetails.push({
            id: member.id,
            displayName: member.displayName,
            userPrincipalName: member.userPrincipalName,
            mfaEnabled: hasMFA
          });

        } catch (error) {
          logger.warn(`Could not check MFA for user ${member.id}:`, error.message);
        }
      }

      const isCompliant = mfaEnabled === totalAdmins;
      
      return {
        status: isCompliant ? 'compliant' : 'non_compliant',
        score: isCompliant ? 100 : (mfaEnabled / totalAdmins) * 100,
        actualResult: {
          totalGlobalAdmins: totalAdmins,
          globalAdminsWithMFA: mfaEnabled,
          complianceRate: (mfaEnabled / totalAdmins) * 100
        },
        evidence: { adminDetails },
        remediationGuidance: isCompliant ? null : 
          `${totalAdmins - mfaEnabled} Global Administrator(s) do not have MFA enabled. Enable MFA for all Global Administrator accounts.`
      };

    } catch (error) {
      return {
        status: 'error',
        error: `Failed to check Global Admin MFA: ${error.message}`
      };
    }
  }

  async checkConditionalAccessMFA(graphClient, control) {
    try {
      const policies = await graphClient
        .api('/identity/conditionalAccess/policies')
        .get();

      const mfaPolicies = policies.value.filter(policy => 
        policy.state === 'enabled' &&
        policy.grantControls &&
        policy.grantControls.builtInControls &&
        policy.grantControls.builtInControls.includes('mfa')
      );

      const hasUserMFAPolicy = mfaPolicies.some(policy =>
        policy.conditions &&
        policy.conditions.users &&
        (policy.conditions.users.includeUsers?.includes('All') ||
         policy.conditions.users.includeGroups?.length > 0)
      );

      return {
        status: hasUserMFAPolicy ? 'compliant' : 'non_compliant',
        score: hasUserMFAPolicy ? 100 : 0,
        actualResult: {
          totalPolicies: policies.value.length,
          mfaPolicies: mfaPolicies.length,
          hasUserMFAPolicy: hasUserMFAPolicy
        },
        evidence: { mfaPolicies: mfaPolicies.map(p => ({
          id: p.id,
          displayName: p.displayName,
          state: p.state
        })) },
        remediationGuidance: hasUserMFAPolicy ? null :
          'Create a Conditional Access policy that requires MFA for all users or specific groups.'
      };

    } catch (error) {
      return {
        status: 'error',
        error: `Failed to check Conditional Access MFA policies: ${error.message}`
      };
    }
  }

  // Add more control checker implementations...
  async checkSMTPAuthDisabled(graphClient, control) {
    // This would typically check Exchange Online settings
    // For now, return manual review as it requires Exchange admin APIs
    return {
      status: 'manual_review',
      remediationGuidance: 'Check Exchange Online admin center to ensure SMTP AUTH is disabled tenant-wide'
    };
  }

  async checkOAuthAppReview(graphClient, control) {
    try {
      const applications = await graphClient
        .api('/applications')
        .select('id,displayName,createdDateTime,requiredResourceAccess')
        .get();

      const highRiskApps = applications.value.filter(app => {
        const hasHighRiskPermissions = app.requiredResourceAccess?.some(resource => 
          resource.resourceAccess?.some(permission => 
            permission.type === 'Role' && // Application permissions
            (permission.id.includes('full_access') || permission.id.includes('all'))
          )
        );
        return hasHighRiskPermissions;
      });

      return {
        status: highRiskApps.length === 0 ? 'compliant' : 'manual_review',
        score: highRiskApps.length === 0 ? 100 : 50,
        actualResult: {
          totalApplications: applications.value.length,
          highRiskApplications: highRiskApps.length
        },
        evidence: { highRiskApps },
        remediationGuidance: highRiskApps.length > 0 ? 
          `Review ${highRiskApps.length} applications with high-risk permissions` : null
      };

    } catch (error) {
      return {
        status: 'error',
        error: `Failed to check OAuth applications: ${error.message}`
      };
    }
  }

  // Placeholder implementations for other controls
  async checkAdminAccountsNaming(graphClient, control) {
    return { status: 'manual_review', remediationGuidance: 'Manual review required for admin account naming conventions' };
  }

  async checkGuestUserRestrictions(graphClient, control) {
    return { status: 'manual_review', remediationGuidance: 'Manual review required for guest user restrictions' };
  }

  async checkBlockLegacyAuth(graphClient, control) {
    return { status: 'manual_review', remediationGuidance: 'Manual review required for legacy authentication blocking' };
  }

  async checkSharePointSharingLinks(graphClient, control) {
    return { status: 'manual_review', remediationGuidance: 'Manual review required for SharePoint sharing link settings' };
  }

  async checkTeamsExternalAccess(graphClient, control) {
    return { status: 'manual_review', remediationGuidance: 'Manual review required for Teams external access settings' };
  }
}

module.exports = new AssessmentEngine();