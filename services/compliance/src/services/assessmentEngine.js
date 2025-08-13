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

      // Test connection and collect tenant information
      const connectionTest = await graphClientService.testConnection(graphClient);
      if (!connectionTest.success) {
        logger.warn(`Graph API connection test failed, continuing with limited functionality:`, connectionTest);
      }

      // Collect tenant information
      logger.info('Collecting tenant information...');
      const tenantInfo = await this.collectTenantInformation(graphClient);
      
      // Check API permissions
      logger.info('Validating API permissions...');
      const permissionCheck = await this.validateAPIPermissions(graphClient);
      
      logger.info(`Tenant: ${tenantInfo.displayName} (${tenantInfo.id})`);
      logger.info(`Users: ${tenantInfo.userCount}, Groups: ${tenantInfo.groupCount}, Applications: ${tenantInfo.applicationCount}`);
      logger.info(`API Permissions: ${permissionCheck.availablePermissions.length} available, ${permissionCheck.missingPermissions.length} missing`);

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
          connectionTest: connectionTest,
          tenantInfo: tenantInfo,
          permissionCheck: permissionCheck
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

  /**
   * Collect comprehensive tenant information
   * @param {Object} graphClient - Microsoft Graph client
   * @returns {Object} Tenant information
   */
  async collectTenantInformation(graphClient) {
    try {
      logger.info('Collecting comprehensive tenant information...');
      
      // Get organization info
      const organization = await graphClient.api('/organization').get();
      const orgInfo = organization.value[0] || {};
      
      // Get verified domains with detailed info
      const domains = orgInfo.verifiedDomains || [];
      const primaryDomain = domains.find(d => d.isDefault)?.name || 'Unknown';
      const dnsDomainsInfo = domains.map(domain => ({
        name: domain.name,
        isDefault: domain.isDefault || false,
        isInitial: domain.isInitial || false,
        capabilities: domain.capabilities || [],
        type: domain.type || 'Managed'
      }));
      
      // Detailed user analysis
      logger.info('Analyzing user accounts...');
      const usersResponse = await graphClient.api('/users')
        .select('id,displayName,userPrincipalName,userType,accountEnabled,createdDateTime,lastSignInDateTime,onPremisesSyncEnabled,passwordPolicies')
        .top(999)
        .get();
      
      const users = usersResponse.value || [];
      const userAnalysis = {
        totalUsers: users.length,
        guestUsers: users.filter(u => u.userType === 'Guest').length,
        memberUsers: users.filter(u => u.userType === 'Member').length,
        enabledUsers: users.filter(u => u.accountEnabled).length,
        disabledUsers: users.filter(u => !u.accountEnabled).length,
        syncedUsers: users.filter(u => u.onPremisesSyncEnabled).length,
        pureAzureUsers: users.filter(u => !u.onPremisesSyncEnabled).length,
        passwordNeverExpires: users.filter(u => u.passwordPolicies?.includes('DisablePasswordExpiration')).length,
        externalUsers: users.filter(u => u.userType === 'Guest' || u.userPrincipalName?.includes('#EXT#')).length,
        internalMembers: users.filter(u => u.userType === 'Member' && !u.userPrincipalName?.includes('#EXT#')).length
      };
      
      // Get critical groups information
      logger.info('Analyzing groups...');
      const groupsResponse = await graphClient.api('/groups')
        .select('id,displayName,groupTypes,securityEnabled,mailEnabled,createdDateTime,membershipRule')
        .top(999)
        .get();
      
      const groups = groupsResponse.value || [];
      const groupAnalysis = {
        totalGroups: groups.length,
        securityGroups: groups.filter(g => g.securityEnabled && !g.mailEnabled).length,
        distributionGroups: groups.filter(g => !g.securityEnabled && g.mailEnabled).length,
        unifiedGroups: groups.filter(g => g.groupTypes?.includes('Unified')).length,
        dynamicGroups: groups.filter(g => g.membershipRule).length,
        staticGroups: groups.filter(g => !g.membershipRule).length
      };
      
      // Get privileged roles and their members
      logger.info('Analyzing privileged roles...');
      const directoryRoles = await graphClient.api('/directoryRoles').get();
      const privilegedRoles = [];
      
      for (const role of directoryRoles.value || []) {
        try {
          const members = await graphClient.api(`/directoryRoles/${role.id}/members`).get();
          privilegedRoles.push({
            id: role.id,
            displayName: role.displayName,
            description: role.description,
            memberCount: members.value?.length || 0,
            members: members.value?.map(m => ({
              id: m.id,
              displayName: m.displayName,
              userPrincipalName: m.userPrincipalName,
              userType: m.userType
            })) || []
          });
        } catch (error) {
          logger.debug(`Could not get members for role ${role.displayName}: ${error.message}`);
          privilegedRoles.push({
            id: role.id,
            displayName: role.displayName,
            description: role.description,
            memberCount: 0,
            members: []
          });
        }
      }
      
      // Get applications with detailed info
      logger.info('Analyzing applications...');
      const appsResponse = await graphClient.api('/applications')
        .select('id,displayName,appId,createdDateTime,publisherDomain,signInAudience,requiredResourceAccess')
        .top(999)
        .get();
      
      const applications = appsResponse.value || [];
      const applicationAnalysis = {
        totalApplications: applications.length,
        singleTenantApps: applications.filter(a => a.signInAudience === 'AzureADMyOrg').length,
        multiTenantApps: applications.filter(a => a.signInAudience === 'AzureADMultipleOrgs').length,
        publicApps: applications.filter(a => a.signInAudience?.includes('PersonalMicrosoftAccount')).length,
        thirdPartyApps: applications.filter(a => a.publisherDomain && a.publisherDomain !== primaryDomain).length,
        applicationsWithHighPrivileges: applications.filter(a => 
          a.requiredResourceAccess?.some(r => 
            r.resourceAccess?.some(p => p.type === 'Role')
          )
        ).length
      };
      
      // Get external tenant information (if available)
      let externalTenants = [];
      try {
        const crossTenantAccessResponse = await graphClient.api('/policies/crossTenantAccessPolicy/partners').get();
        externalTenants = crossTenantAccessResponse.value?.map(partner => ({
          tenantId: partner.tenantId,
          name: partner.name || 'Unknown',
          isInbound: partner.inboundTrust?.isMfaAccepted || false,
          isOutbound: partner.outboundTrust?.isMfaAccepted || false
        })) || [];
      } catch (error) {
        logger.debug('Could not get external tenant information:', error.message);
      }
      
      // Get synchronization information
      let syncInfo = {
        isHybrid: false,
        syncEnabled: false,
        lastSyncTime: null,
        syncErrors: 0
      };
      
      try {
        // Check if any users are synced from on-premises
        const syncedUserCount = userAnalysis.syncedUsers;
        syncInfo.isHybrid = syncedUserCount > 0;
        syncInfo.syncEnabled = syncedUserCount > 0;
      } catch (error) {
        logger.debug('Could not get synchronization information:', error.message);
      }
      
      // Get license info
      logger.info('Analyzing licenses...');
      const subscribedSkus = await graphClient.api('/subscribedSkus').get();
      const licenses = subscribedSkus.value?.map(sku => ({
        productName: sku.skuPartNumber,
        friendlyName: sku.skuId, // Could be mapped to friendly names
        totalLicenses: sku.prepaidUnits?.enabled || 0,
        assignedLicenses: sku.consumedUnits || 0,
        availableLicenses: (sku.prepaidUnits?.enabled || 0) - (sku.consumedUnits || 0),
        capabilityStatus: sku.capabilityStatus,
        appliesTo: sku.appliesTo
      })) || [];
      
      // Try to get email forwarding information (Exchange Online)
      let emailForwardingInfo = {
        available: false,
        forwardingMailboxes: 0,
        externalForwarding: 0,
        internalForwarding: 0
      };
      
      try {
        // This would require Exchange Online PowerShell or specific Graph permissions
        // For now, we'll mark it as not available
        logger.debug('Email forwarding analysis requires Exchange Online permissions');
      } catch (error) {
        logger.debug('Could not get email forwarding information:', error.message);
      }
      
      const tenantInfo = {
        // Basic tenant information
        id: orgInfo.id,
        displayName: orgInfo.displayName || 'Unknown Organization',
        primaryDomain: primaryDomain,
        country: orgInfo.countryLetterCode,
        region: orgInfo.countryLetterCode, // Map to region if needed
        createdDateTime: orgInfo.createdDateTime,
        
        // DNS and domain information
        verifiedDomains: dnsDomainsInfo,
        dnsDomainsCount: dnsDomainsInfo.length,
        customDomains: dnsDomainsInfo.filter(d => !d.isInitial).length,
        
        // Synchronization information
        synchronization: syncInfo,
        
        // External tenants
        externalTenants: externalTenants,
        externalTenantsCount: externalTenants.length,
        
        // Detailed user analysis
        userAnalysis: userAnalysis,
        userCount: userAnalysis.totalUsers,
        
        // Group information
        groupAnalysis: groupAnalysis,
        groupCount: groupAnalysis.totalGroups,
        
        // Application information
        applicationAnalysis: applicationAnalysis,
        applicationCount: applicationAnalysis.totalApplications,
        
        // Privileged roles
        privilegedRoles: privilegedRoles,
        roleCount: privilegedRoles.length,
        
        // License information
        licenses: licenses,
        totalLicenses: licenses.reduce((sum, lic) => sum + lic.totalLicenses, 0),
        assignedLicenses: licenses.reduce((sum, lic) => sum + lic.assignedLicenses, 0),
        availableLicenses: licenses.reduce((sum, lic) => sum + lic.availableLicenses, 0),
        
        // Email forwarding (placeholder)
        emailForwarding: emailForwardingInfo,
        
        // Summary statistics
        summary: {
          isHybridEnvironment: syncInfo.isHybrid,
          hasExternalTenants: externalTenants.length > 0,
          hasCustomDomains: dnsDomainsInfo.filter(d => !d.isInitial).length > 0,
          hasGuestUsers: userAnalysis.guestUsers > 0,
          hasPrivilegedUsers: privilegedRoles.some(r => r.memberCount > 0),
          licenseUtilization: licenses.length > 0 ? 
            (licenses.reduce((sum, lic) => sum + lic.assignedLicenses, 0) / 
             licenses.reduce((sum, lic) => sum + lic.totalLicenses, 0)) * 100 : 0
        }
      };
      
      logger.info(`Collected comprehensive tenant info for: ${tenantInfo.displayName} (${tenantInfo.primaryDomain})`);
      logger.info(`Users: ${tenantInfo.userCount} (${tenantInfo.userAnalysis.guestUsers} guests, ${tenantInfo.userAnalysis.memberUsers} members)`);
      logger.info(`Groups: ${tenantInfo.groupCount}, Applications: ${tenantInfo.applicationCount}, Domains: ${tenantInfo.dnsDomainsCount}`);
      
      return tenantInfo;
      
    } catch (error) {
      logger.error('Error collecting comprehensive tenant information:', error);
      return {
        id: 'unknown',
        displayName: 'Unknown Organization',
        primaryDomain: 'unknown',
        country: 'unknown',
        region: 'unknown',
        createdDateTime: null,
        verifiedDomains: [],
        dnsDomainsCount: 0,
        customDomains: 0,
        synchronization: { isHybrid: false, syncEnabled: false },
        externalTenants: [],
        externalTenantsCount: 0,
        userAnalysis: {
          totalUsers: 0,
          guestUsers: 0,
          memberUsers: 0,
          enabledUsers: 0,
          disabledUsers: 0,
          syncedUsers: 0,
          pureAzureUsers: 0,
          passwordNeverExpires: 0,
          externalUsers: 0,
          internalMembers: 0
        },
        userCount: 0,
        groupAnalysis: {
          totalGroups: 0,
          securityGroups: 0,
          distributionGroups: 0,
          unifiedGroups: 0,
          dynamicGroups: 0,
          staticGroups: 0
        },
        groupCount: 0,
        applicationAnalysis: {
          totalApplications: 0,
          singleTenantApps: 0,
          multiTenantApps: 0,
          publicApps: 0,
          thirdPartyApps: 0,
          applicationsWithHighPrivileges: 0
        },
        applicationCount: 0,
        privilegedRoles: [],
        roleCount: 0,
        licenses: [],
        totalLicenses: 0,
        assignedLicenses: 0,
        availableLicenses: 0,
        emailForwarding: { available: false, forwardingMailboxes: 0 },
        summary: {
          isHybridEnvironment: false,
          hasExternalTenants: false,
          hasCustomDomains: false,
          hasGuestUsers: false,
          hasPrivilegedUsers: false,
          licenseUtilization: 0
        },
        error: error.message
      };
    }
  }

  /**
   * Validate API permissions for comprehensive assessment
   * @param {Object} graphClient - Microsoft Graph client
   * @returns {Object} Permission validation results
   */
  async validateAPIPermissions(graphClient) {
    const requiredPermissions = [
      { endpoint: '/organization', permission: 'Organization.Read.All', critical: true },
      { endpoint: '/users', permission: 'User.Read.All', critical: true },
      { endpoint: '/groups', permission: 'Group.Read.All', critical: true },
      { endpoint: '/directoryRoles', permission: 'RoleManagement.Read.Directory', critical: true },
      { endpoint: '/identity/conditionalAccess/policies', permission: 'Policy.Read.All', critical: true },
      { endpoint: '/applications', permission: 'Application.Read.All', critical: false },
      { endpoint: '/subscribedSkus', permission: 'Organization.Read.All', critical: false },
      { endpoint: '/reports/authenticationMethods/userRegistrationDetails', permission: 'Reports.Read.All', critical: false },
      { endpoint: '/policies/authenticationMethodsPolicy', permission: 'Policy.Read.AuthenticationMethod', critical: false },
    ];

    const availablePermissions = [];
    const missingPermissions = [];

    for (const perm of requiredPermissions) {
      try {
        // Test access to endpoint with appropriate query parameters
        // Some endpoints don't support pagination
        const noPaginationEndpoints = [
          '/directoryRoles',
          '/subscribedSkus',
          '/policies/authenticationMethodsPolicy',
          '/reports/authenticationMethods/userRegistrationDetails'
        ];
        
        let query = graphClient.api(perm.endpoint);
        
        // Only add .top() for endpoints that support it
        if (!noPaginationEndpoints.some(ep => perm.endpoint.includes(ep))) {
          query = query.top(1);
        }
        
        await query.get();
        availablePermissions.push(perm);
        logger.debug(`✓ Access granted to ${perm.endpoint} (${perm.permission})`);
      } catch (error) {
        missingPermissions.push({
          ...perm,
          error: error.message
        });
        logger.warn(`✗ Access denied to ${perm.endpoint} (${perm.permission}): ${error.message}`);
      }
    }

    return {
      availablePermissions,
      missingPermissions,
      criticalMissing: missingPermissions.filter(p => p.critical),
      permissionScore: Math.round((availablePermissions.length / requiredPermissions.length) * 100)
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

      // Check MFA status for each global admin with detailed information
      let mfaEnabled = 0;
      let totalAdmins = members.value.length;
      const adminDetails = [];
      const failingEntities = [];

      for (const member of members.value) {
        try {
          // Get user details
          const userDetails = await graphClient.api(`/users/${member.id}`)
            .select('id,displayName,userPrincipalName,accountEnabled,lastSignInDateTime,createdDateTime,userType')
            .get();

          const authMethods = await graphClient
            .api(`/users/${member.id}/authentication/methods`)
            .get();

          const mfaMethods = authMethods.value.filter(method => 
            method['@odata.type'].includes('microsoftAuthenticator') ||
            method['@odata.type'].includes('phoneAuthentication') ||
            method['@odata.type'].includes('fido2AuthenticationMethod')
          );

          const hasMFA = mfaMethods.length > 0;
          
          if (hasMFA) {
            mfaEnabled++;
          } else {
            // This user is failing the compliance check
            failingEntities.push({
              type: 'User',
              id: userDetails.id,
              displayName: userDetails.displayName,
              userPrincipalName: userDetails.userPrincipalName,
              reason: 'No MFA methods configured',
              lastSignIn: userDetails.lastSignInDateTime,
              accountEnabled: userDetails.accountEnabled,
              userType: userDetails.userType,
              createdDateTime: userDetails.createdDateTime
            });
          }

          adminDetails.push({
            id: userDetails.id,
            displayName: userDetails.displayName,
            userPrincipalName: userDetails.userPrincipalName,
            mfaEnabled: hasMFA,
            mfaMethodCount: mfaMethods.length,
            mfaMethods: mfaMethods.map(method => method['@odata.type'].split('.').pop()),
            accountEnabled: userDetails.accountEnabled,
            lastSignIn: userDetails.lastSignInDateTime,
            userType: userDetails.userType
          });

        } catch (error) {
          logger.warn(`Could not check MFA for user ${member.id}:`, error.message);
          failingEntities.push({
            type: 'User',
            id: member.id,
            displayName: member.displayName || 'Unknown',
            reason: `Error checking MFA status: ${error.message}`,
            error: true
          });
        }
      }

      const isCompliant = mfaEnabled === totalAdmins;
      
      return {
        status: isCompliant ? 'compliant' : 'non_compliant',
        score: isCompliant ? 100 : (mfaEnabled / totalAdmins) * 100,
        actualResult: {
          totalGlobalAdmins: totalAdmins,
          globalAdminsWithMFA: mfaEnabled,
          complianceRate: (mfaEnabled / totalAdmins) * 100,
          failingCount: failingEntities.length
        },
        evidence: { 
          adminDetails,
          failingEntities: failingEntities,
          summary: {
            compliant: adminDetails.filter(a => a.mfaEnabled).length,
            nonCompliant: adminDetails.filter(a => !a.mfaEnabled).length,
            enabledAdmins: adminDetails.filter(a => a.accountEnabled).length,
            disabledAdmins: adminDetails.filter(a => !a.accountEnabled).length
          }
        },
        remediationGuidance: isCompliant ? null : 
          `${failingEntities.length} Global Administrator(s) do not have MFA enabled: ${failingEntities.map(e => e.userPrincipalName || e.displayName).join(', ')}. Enable MFA for these accounts immediately.`,
        failingEntities: failingEntities // Make failing entities easily accessible
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

      const allPolicies = policies.value || [];
      const enabledPolicies = allPolicies.filter(p => p.state === 'enabled');
      
      const mfaPolicies = allPolicies.filter(policy => 
        policy.state === 'enabled' &&
        policy.grantControls &&
        policy.grantControls.builtInControls &&
        policy.grantControls.builtInControls.includes('mfa')
      );

      const userMFAPolicies = mfaPolicies.filter(policy =>
        policy.conditions &&
        policy.conditions.users &&
        (policy.conditions.users.includeUsers?.includes('All') ||
         policy.conditions.users.includeGroups?.length > 0 ||
         policy.conditions.users.includeRoles?.length > 0)
      );

      const hasUserMFAPolicy = userMFAPolicies.length > 0;
      const hasComprehensiveMFA = userMFAPolicies.some(policy =>
        policy.conditions.users.includeUsers?.includes('All')
      );

      // Identify gaps in MFA coverage
      const failingEntities = [];
      if (!hasUserMFAPolicy) {
        failingEntities.push({
          type: 'Policy Gap',
          id: 'missing-mfa-policy',
          displayName: 'No MFA Conditional Access Policy',
          reason: 'No Conditional Access policy requires MFA for users',
          severity: 'Critical'
        });
      } else if (!hasComprehensiveMFA) {
        failingEntities.push({
          type: 'Policy Gap',
          id: 'partial-mfa-coverage',
          displayName: 'Incomplete MFA Coverage',
          reason: 'MFA policy does not cover all users',
          severity: 'High',
          policies: userMFAPolicies.map(p => p.displayName)
        });
      }

      const policyDetails = mfaPolicies.map(policy => ({
        id: policy.id,
        displayName: policy.displayName,
        state: policy.state,
        userScope: {
          includeUsers: policy.conditions?.users?.includeUsers || [],
          excludeUsers: policy.conditions?.users?.excludeUsers || [],
          includeGroups: policy.conditions?.users?.includeGroups || [],
          excludeGroups: policy.conditions?.users?.excludeGroups || [],
          includeRoles: policy.conditions?.users?.includeRoles || []
        },
        applications: {
          includeApplications: policy.conditions?.applications?.includeApplications || [],
          excludeApplications: policy.conditions?.applications?.excludeApplications || []
        },
        grantControls: policy.grantControls?.builtInControls || [],
        sessionControls: policy.sessionControls || null,
        createdDateTime: policy.createdDateTime,
        modifiedDateTime: policy.modifiedDateTime
      }));

      return {
        status: hasComprehensiveMFA ? 'compliant' : (hasUserMFAPolicy ? 'partial_compliant' : 'non_compliant'),
        score: hasComprehensiveMFA ? 100 : (hasUserMFAPolicy ? 70 : 0),
        actualResult: {
          totalPolicies: allPolicies.length,
          enabledPolicies: enabledPolicies.length,
          mfaPolicies: mfaPolicies.length,
          userMFAPolicies: userMFAPolicies.length,
          hasUserMFAPolicy: hasUserMFAPolicy,
          hasComprehensiveMFA: hasComprehensiveMFA,
          failingCount: failingEntities.length
        },
        evidence: { 
          policyDetails,
          failingEntities,
          summary: {
            enabledPolicies: enabledPolicies.length,
            disabledPolicies: allPolicies.length - enabledPolicies.length,
            mfaRequiredPolicies: mfaPolicies.length,
            allUsersCovered: hasComprehensiveMFA
          }
        },
        remediationGuidance: hasComprehensiveMFA ? null :
          failingEntities.length > 0 
            ? `${failingEntities[0].reason}. ${hasUserMFAPolicy 
                ? 'Expand existing MFA policies to cover all users.' 
                : 'Create a Conditional Access policy that requires MFA for all users.'}`
            : 'Review and enhance MFA policy coverage.',
        failingEntities: failingEntities
      };

    } catch (error) {
      return {
        status: 'error',
        error: `Failed to check Conditional Access MFA policies: ${error.message}`,
        failingEntities: [{
          type: 'API Error',
          reason: `Cannot access Conditional Access policies: ${error.message}`,
          severity: 'Critical'
        }]
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