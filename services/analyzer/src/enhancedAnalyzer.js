const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { logger } = require('./logger');

class EnhancedAnalyzer {
  constructor() {
    this.blacklists = {};
    this.config = {};
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      await this.loadBlacklists();
      await this.loadConfig();
      this.initialized = true;
      logger.info('Enhanced analyzer initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize enhanced analyzer:', error);
      throw error;
    }
  }


  async loadBlacklists() {
    const blacklistDir = path.join(__dirname, '../config/Blacklists');
    
    const blacklistFiles = [
      'ASN-Blacklist.csv',
      'Application-Blacklist.csv',
      'ApplicationPermission-Blacklist.csv',
      'Country-Blacklist.csv',
      'DelegatedPermission-Blacklist.csv',
      'MoveToFolder-Blacklist.csv',
      'UserAgent-Blacklist.csv'
    ];

    for (const file of blacklistFiles) {
      const filePath = path.join(blacklistDir, file);
      if (fs.existsSync(filePath)) {
        const listName = file.replace('-Blacklist.csv', '').toLowerCase();
        this.blacklists[listName] = await this.loadCsvFile(filePath);
        logger.info(`Loaded ${listName} blacklist: ${this.blacklists[listName].length} entries`);
      }
    }
  }

  async loadConfig() {
    const configDir = path.join(__dirname, '../config/Config');
    
    const configFiles = [
      'LogonType.csv',
      'MicrosoftApps.csv',
      'RecordType.csv',
      'Status.csv',
      'TrustType.csv',
      'UserType.csv'
    ];

    for (const file of configFiles) {
      const filePath = path.join(configDir, file);
      if (fs.existsSync(filePath)) {
        const configName = file.replace('.csv', '').toLowerCase();
        this.config[configName] = await this.loadCsvFile(filePath);
        logger.info(`Loaded ${configName} config: ${this.config[configName].length} entries`);
      }
    }
  }

  async loadCsvFile(filePath) {
    return new Promise((resolve, reject) => {
      const results = [];
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', () => resolve(results))
        .on('error', reject);
    });
  }

  async analyzeEntraAuditLogs(auditData, parameters) {
    if (!this.initialized) {
      await this.initialize();
    }

    const findings = [];
    const statistics = {
      totalEvents: auditData.length,
      uniqueUsers: new Set(),
      uniqueOperations: new Set(),
      uniqueApplications: new Set(),
      uniqueCountries: new Set(),
      uniqueIPAddresses: new Set(),
      failedOperations: 0,
      successOperations: 0,
      suspiciousActivities: 0,
      highSeverityEvents: 0,
      criticalSeverityEvents: 0,
      blacklistedEntities: {
        applications: new Set(),
        countries: new Set(),
        ipAddresses: new Set(),
        userAgents: new Set()
      },
      dataQuality: {
        unknownUsers: 0,
        missingUserData: 0,
        totalUnknownEvents: 0,
        unknownUserTypes: new Set()
      }
    };

    logger.info(`Starting enhanced analysis of ${auditData.length} audit log entries`);

    for (let i = 0; i < auditData.length; i++) {
      const event = auditData[i];
      
      // Handle different log formats
      const normalizedEvent = this.normalizeAuditEvent(event);
      
      // Update statistics
      this.updateStatistics(normalizedEvent, statistics);
      
      // Perform various security checks
      await this.checkBlacklistedEntities(normalizedEvent, findings, statistics);
      await this.checkSuspiciousPatterns(normalizedEvent, findings, statistics);
      await this.checkTimeAnomalies(normalizedEvent, findings, statistics);
      await this.checkPermissionChanges(normalizedEvent, findings, statistics);
      await this.checkAccountActivities(normalizedEvent, findings, statistics);
      await this.checkApplicationActivities(normalizedEvent, findings, statistics);
      
      // Check for brute force attempts
      if (i > 0) {
        await this.checkBruteForcePatterns(normalizedEvent, auditData.slice(Math.max(0, i - 100), i), findings, statistics);
      }
    }

    // Post-processing analysis
    await this.performPostProcessingAnalysis(auditData, findings, statistics);

    // Convert sets to counts
    statistics.uniqueUsers = statistics.uniqueUsers.size;
    statistics.uniqueOperations = statistics.uniqueOperations.size;
    statistics.uniqueApplications = statistics.uniqueApplications.size;
    statistics.uniqueCountries = statistics.uniqueCountries.size;
    statistics.uniqueIPAddresses = statistics.uniqueIPAddresses.size;
    statistics.blacklistedEntities.applications = statistics.blacklistedEntities.applications.size;
    statistics.blacklistedEntities.countries = statistics.blacklistedEntities.countries.size;
    statistics.blacklistedEntities.ipAddresses = statistics.blacklistedEntities.ipAddresses.size;
    statistics.blacklistedEntities.userAgents = statistics.blacklistedEntities.userAgents.size;

    const summary = {
      totalFindings: findings.length,
      criticalFindings: findings.filter(f => f.severity === 'critical').length,
      highSeverityFindings: findings.filter(f => f.severity === 'high').length,
      mediumSeverityFindings: findings.filter(f => f.severity === 'medium').length,
      lowSeverityFindings: findings.filter(f => f.severity === 'low').length,
      topThreats: this.identifyTopThreats(findings),
      riskScore: this.calculateRiskScore(findings, statistics)
    };

    logger.info(`Enhanced analysis completed: ${findings.length} findings, Risk Score: ${summary.riskScore}`);

    return {
      findings: findings,
      statistics: statistics,
      summary: summary
    };
  }


  normalizeAuditEvent(event) {
    // Handle different audit log formats (Graph API, PowerShell, etc.)
    
    // Extract user with better fallback handling
    let user = event.initiatedBy?.user?.userPrincipalName || 
               event.initiatedBy?.user?.displayName || 
               event.UserId || 
               event.UserPrincipalName || 
               event.UserDisplayName ||
               event.Actor?.ID ||
               event.Actor?.Name ||
               event.User ||
               null;
    
    // If user is still not found, create a unique identifier based on other properties
    if (!user || user === '' || user.toLowerCase() === 'unknown') {
      // Try to create a unique identifier from available data
      const sessionId = event.SessionId || event.CorrelationId || '';
      const ip = event.initiatedBy?.user?.ipAddress || event.ClientIP || event.IPAddress || '';
      const app = event.initiatedBy?.app?.displayName || event.initiatedBy?.app?.appId || event.ApplicationId || '';
      
      if (sessionId) {
        user = `Unknown_Session_${sessionId.substring(0, 8)}`;
      } else if (ip && ip !== 'Unknown') {
        user = `Unknown_IP_${ip.replace(/\./g, '_')}`;
      } else if (app && app !== 'Unknown') {
        user = `Unknown_App_${app.substring(0, 20)}`;
      } else {
        // Last resort: use timestamp and random ID to ensure uniqueness
        const timestamp = new Date(event.activityDateTime || event.CreationTime || event.TimeGenerated || Date.now());
        user = `Unknown_${timestamp.getTime()}_${Math.random().toString(36).substring(2, 7)}`;
      }
    }
    
    return {
      id: event.id || event.Id || `event_${Date.now()}_${Math.random()}`,
      timestamp: new Date(event.activityDateTime || event.CreationTime || event.TimeGenerated || event.Timestamp),
      user: user,
      operation: event.activityDisplayName || event.Operation || event.ActivityDisplayName || 'Unknown',
      result: event.result || event.ResultStatus || event.Status || 'Unknown',
      ipAddress: event.initiatedBy?.user?.ipAddress || 
                event.ClientIP || 
                event.IPAddress || 
                event.location?.countryOrRegion || 
                'Unknown',
      userAgent: event.initiatedBy?.user?.userAgent || 
                event.UserAgent || 
                event.ClientAppUsed || 
                'Unknown',
      application: event.initiatedBy?.app?.displayName || 
                  event.initiatedBy?.app?.appId || 
                  event.AppDisplayName || 
                  event.ApplicationId || 
                  event.ClientAppUsed ||
                  'Unknown',
      location: event.location?.countryOrRegion || 
               event.location?.city || 
               event.Country || 
               event.Location ||
               'Unknown',
      category: event.category || event.LogName || event.RecordType || 'Unknown',
      targetResources: event.targetResources || [],
      additionalDetails: event.additionalDetails || [],
      rawEvent: event,
      isUnknownUser: user.startsWith('Unknown_')  // Flag to track unknown users
    };
  }

  updateStatistics(event, statistics) {
    statistics.uniqueUsers.add(event.user);
    statistics.uniqueOperations.add(event.operation);
    statistics.uniqueApplications.add(event.application);
    statistics.uniqueCountries.add(event.location);
    statistics.uniqueIPAddresses.add(event.ipAddress);

    // Track data quality issues
    if (event.isUnknownUser) {
      statistics.dataQuality.unknownUsers++;
      
      // Track the type of unknown user
      if (event.user.startsWith('Unknown_Session_')) {
        statistics.dataQuality.unknownUserTypes.add('session-based');
      } else if (event.user.startsWith('Unknown_IP_')) {
        statistics.dataQuality.unknownUserTypes.add('ip-based');
      } else if (event.user.startsWith('Unknown_App_')) {
        statistics.dataQuality.unknownUserTypes.add('app-based');
      } else if (event.user.startsWith('Unknown_')) {
        statistics.dataQuality.unknownUserTypes.add('timestamp-based');
      }
    }
    
    // Count events with any unknown data
    if (event.user.includes('Unknown') || event.operation === 'Unknown' || 
        event.application === 'Unknown' || event.location === 'Unknown') {
      statistics.dataQuality.totalUnknownEvents++;
    }

    if (event.result === 'success' || event.result === 'Success') {
      statistics.successOperations++;
    } else if (event.result === 'failure' || event.result === 'Failure' || event.result === 'failed') {
      statistics.failedOperations++;
    }
  }

  async checkBlacklistedEntities(event, findings, statistics) {
    // Check against application blacklist
    if (this.blacklists.application && event.application !== 'Unknown') {
      const blacklistedApp = this.blacklists.application.find(app => 
        app.AppDisplayName && event.application.toLowerCase().includes(app.AppDisplayName.toLowerCase())
      );
      
      if (blacklistedApp) {
        statistics.blacklistedEntities.applications.add(event.application);
        findings.push({
          id: `finding_${findings.length + 1}`,
          title: 'Blacklisted Application Detected',
          severity: 'high',
          description: `Blacklisted application "${event.application}" was used by ${event.user}`,
          timestamp: event.timestamp,
          source: 'entra_audit_logs',
          type: 'blacklisted_application',
          category: 'security',
          affectedEntities: {
            users: [event.user],
            applications: [event.application],
            ipAddresses: event.ipAddress !== 'Unknown' ? [event.ipAddress] : []
          },
          evidence: {
            application: event.application,
            operation: event.operation,
            result: event.result,
            blacklistReason: blacklistedApp.Reason || 'Application is on blacklist'
          },
          mitreAttack: {
            tactics: ['Initial Access', 'Persistence'],
            techniques: ['T1078', 'T1199'],
            subTechniques: ['T1078.004']
          },
          recommendations: [
            'Investigate the use of this blacklisted application',
            'Review user access permissions',
            'Consider blocking this application organization-wide'
          ]
        });
      }
    }

    // Check against country blacklist
    if (this.blacklists.country && event.location !== 'Unknown') {
      const blacklistedCountry = this.blacklists.country.find(country => 
        country.Country && event.location.toLowerCase().includes(country.Country.toLowerCase())
      );
      
      if (blacklistedCountry) {
        statistics.blacklistedEntities.countries.add(event.location);
        findings.push({
          id: `finding_${findings.length + 1}`,
          title: 'Access from Blacklisted Country',
          severity: 'high',
          description: `User ${event.user} accessed from blacklisted country: ${event.location}`,
          timestamp: event.timestamp,
          source: 'entra_audit_logs',
          type: 'blacklisted_country',
          category: 'security',
          affectedEntities: {
            users: [event.user],
            locations: [event.location],
            ipAddresses: event.ipAddress !== 'Unknown' ? [event.ipAddress] : []
          },
          evidence: {
            country: event.location,
            ipAddress: event.ipAddress,
            operation: event.operation,
            blacklistReason: blacklistedCountry.Reason || 'Country is on blacklist'
          },
          mitreAttack: {
            tactics: ['Initial Access', 'Defense Evasion'],
            techniques: ['T1078', 'T1090'],
            subTechniques: ['T1078.004', 'T1090.003']
          },
          recommendations: [
            'Investigate the legitimacy of access from this location',
            'Verify user identity and authorization',
            'Consider implementing geo-blocking'
          ]
        });
      }
    }

    // Check against user agent blacklist
    if (this.blacklists.useragent && event.userAgent !== 'Unknown') {
      const blacklistedUA = this.blacklists.useragent.find(ua => 
        ua.UserAgent && event.userAgent.toLowerCase().includes(ua.UserAgent.toLowerCase())
      );
      
      if (blacklistedUA) {
        statistics.blacklistedEntities.userAgents.add(event.userAgent);
        findings.push({
          id: `finding_${findings.length + 1}`,
          title: 'Blacklisted User Agent Detected',
          severity: 'medium',
          description: `Blacklisted user agent "${event.userAgent}" used by ${event.user}`,
          timestamp: event.timestamp,
          source: 'entra_audit_logs',
          type: 'blacklisted_user_agent',
          category: 'security',
          affectedEntities: {
            users: [event.user],
            userAgents: [event.userAgent],
            ipAddresses: event.ipAddress !== 'Unknown' ? [event.ipAddress] : []
          },
          evidence: {
            userAgent: event.userAgent,
            operation: event.operation,
            blacklistReason: blacklistedUA.Reason || 'User agent is on blacklist'
          },
          mitreAttack: {
            tactics: ['Defense Evasion', 'Command and Control'],
            techniques: ['T1071', 'T1090'],
            subTechniques: ['T1071.001']
          },
          recommendations: [
            'Investigate the use of this user agent',
            'Check for potential automated tools or bots',
            'Monitor for additional suspicious activity'
          ]
        });
      }
    }
  }

  async checkSuspiciousPatterns(event, findings, statistics) {
    const suspiciousPatterns = [
      {
        pattern: /password.*reset/i,
        severity: 'medium',
        type: 'password_reset',
        description: 'Password reset activity detected'
      },
      {
        pattern: /role.*add|add.*role/i,
        severity: 'high',
        type: 'role_assignment',
        description: 'Role assignment activity detected'
      },
      {
        pattern: /permission.*grant|grant.*permission/i,
        severity: 'high',
        type: 'permission_grant',
        description: 'Permission grant activity detected'
      },
      {
        pattern: /delete.*user|remove.*user/i,
        severity: 'high',
        type: 'user_deletion',
        description: 'User deletion activity detected'
      },
      {
        pattern: /admin.*consent|consent.*admin/i,
        severity: 'critical',
        type: 'admin_consent',
        description: 'Admin consent activity detected'
      },
      {
        pattern: /conditional.*access/i,
        severity: 'medium',
        type: 'conditional_access',
        description: 'Conditional access policy change detected'
      },
      {
        pattern: /mfa.*disable|disable.*mfa/i,
        severity: 'critical',
        type: 'mfa_disable',
        description: 'MFA disable activity detected'
      }
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.pattern.test(event.operation)) {
        statistics.suspiciousActivities++;
        
        if (pattern.severity === 'high') {
          statistics.highSeverityEvents++;
        } else if (pattern.severity === 'critical') {
          statistics.criticalSeverityEvents++;
        }

        findings.push({
          id: `finding_${findings.length + 1}`,
          title: pattern.description,
          severity: pattern.severity,
          description: `${pattern.description}: ${event.operation} by ${event.user}`,
          timestamp: event.timestamp,
          source: 'entra_audit_logs',
          type: pattern.type,
          category: 'security',
          affectedEntities: {
            users: [event.user],
            operations: [event.operation],
            ipAddresses: event.ipAddress !== 'Unknown' ? [event.ipAddress] : []
          },
          evidence: {
            operation: event.operation,
            result: event.result,
            ipAddress: event.ipAddress,
            userAgent: event.userAgent,
            targetResources: event.targetResources
          },
          mitreAttack: this.getMitreMapping(pattern.type),
          recommendations: this.getRecommendations(pattern.type),
          details: {
            user: event.user,
            operation: event.operation,
            result: event.result,
            pattern: pattern.type
          }
        });
      }
    }
  }

  async checkTimeAnomalies(event, findings, statistics) {
    const hour = event.timestamp.getHours();
    const dayOfWeek = event.timestamp.getDay();
    
    // Check for after-hours activity (outside 6 AM - 10 PM)
    if (hour < 6 || hour > 22) {
      findings.push({
        id: `finding_${findings.length + 1}`,
        title: 'After-hours Activity',
        severity: 'medium',
        description: `User ${event.user} performed ${event.operation} outside business hours (${hour}:00)`,
        timestamp: event.timestamp,
        source: 'entra_audit_logs',
        type: 'after_hours_activity',
        category: 'behavioral',
        affectedEntities: {
          users: [event.user],
          operations: [event.operation]
        },
        evidence: {
          hour: hour,
          dayOfWeek: dayOfWeek,
          operation: event.operation
        },
        mitreAttack: {
          tactics: ['Defense Evasion', 'Persistence'],
          techniques: ['T1070', 'T1562'],
          subTechniques: ['T1070.004']
        },
        recommendations: [
          'Verify if this activity was authorized',
          'Consider implementing time-based access controls',
          'Monitor for additional suspicious activity'
        ]
      });
    }

    // Check for weekend activity
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      findings.push({
        id: `finding_${findings.length + 1}`,
        title: 'Weekend Activity',
        severity: 'low',
        description: `User ${event.user} performed ${event.operation} during weekend`,
        timestamp: event.timestamp,
        source: 'entra_audit_logs',
        type: 'weekend_activity',
        category: 'behavioral',
        affectedEntities: {
          users: [event.user],
          operations: [event.operation]
        },
        evidence: {
          dayOfWeek: dayOfWeek,
          operation: event.operation
        },
        mitreAttack: {
          tactics: ['Defense Evasion'],
          techniques: ['T1070'],
          subTechniques: ['T1070.004']
        },
        recommendations: [
          'Verify if weekend access was necessary',
          'Review business justification for weekend activity'
        ]
      });
    }
  }

  async checkPermissionChanges(event, findings, statistics) {
    const permissionPatterns = [
      /permission.*add|add.*permission/i,
      /permission.*remove|remove.*permission/i,
      /permission.*modify|modify.*permission/i,
      /role.*assign|assign.*role/i,
      /role.*remove|remove.*role/i,
      /privilege.*escalat/i,
      /admin.*add|add.*admin/i
    ];

    for (const pattern of permissionPatterns) {
      if (pattern.test(event.operation)) {
        findings.push({
          id: `finding_${findings.length + 1}`,
          title: 'Permission Change Detected',
          severity: 'high',
          description: `Permission change detected: ${event.operation} by ${event.user}`,
          timestamp: event.timestamp,
          source: 'entra_audit_logs',
          type: 'permission_change',
          category: 'security',
          affectedEntities: {
            users: [event.user],
            operations: [event.operation],
            targetResources: event.targetResources.map(r => r.displayName || r.id).filter(Boolean)
          },
          evidence: {
            operation: event.operation,
            result: event.result,
            targetResources: event.targetResources
          },
          mitreAttack: {
            tactics: ['Privilege Escalation', 'Persistence'],
            techniques: ['T1134', 'T1078'],
            subTechniques: ['T1134.001', 'T1078.004']
          },
          recommendations: [
            'Review the necessity of this permission change',
            'Verify authorization for this change',
            'Monitor for abuse of new permissions'
          ]
        });
      }
    }
  }

  async checkAccountActivities(event, findings, statistics) {
    const accountPatterns = [
      {
        pattern: /user.*create|create.*user/i,
        type: 'user_creation',
        severity: 'medium',
        description: 'User account creation detected'
      },
      {
        pattern: /user.*delete|delete.*user/i,
        type: 'user_deletion',
        severity: 'high',
        description: 'User account deletion detected'
      },
      {
        pattern: /user.*disable|disable.*user/i,
        type: 'user_disable',
        severity: 'medium',
        description: 'User account disable detected'
      },
      {
        pattern: /user.*enable|enable.*user/i,
        type: 'user_enable',
        severity: 'medium',
        description: 'User account enable detected'
      },
      {
        pattern: /password.*change|change.*password/i,
        type: 'password_change',
        severity: 'low',
        description: 'Password change detected'
      }
    ];

    for (const pattern of accountPatterns) {
      if (pattern.pattern.test(event.operation)) {
        findings.push({
          id: `finding_${findings.length + 1}`,
          title: pattern.description,
          severity: pattern.severity,
          description: `${pattern.description}: ${event.operation} by ${event.user}`,
          timestamp: event.timestamp,
          source: 'entra_audit_logs',
          type: pattern.type,
          category: 'account_management',
          affectedEntities: {
            users: [event.user],
            operations: [event.operation],
            targetResources: event.targetResources.map(r => r.userPrincipalName || r.displayName || r.id).filter(Boolean)
          },
          evidence: {
            operation: event.operation,
            result: event.result,
            targetResources: event.targetResources
          },
          mitreAttack: this.getMitreMapping(pattern.type),
          recommendations: this.getRecommendations(pattern.type)
        });
      }
    }
  }

  async checkApplicationActivities(event, findings, statistics) {
    const appPatterns = [
      {
        pattern: /application.*create|create.*application/i,
        type: 'app_creation',
        severity: 'medium',
        description: 'Application creation detected'
      },
      {
        pattern: /application.*delete|delete.*application/i,
        type: 'app_deletion',
        severity: 'high',
        description: 'Application deletion detected'
      },
      {
        pattern: /service.*principal/i,
        type: 'service_principal',
        severity: 'medium',
        description: 'Service principal activity detected'
      },
      {
        pattern: /oauth.*consent|consent.*oauth/i,
        type: 'oauth_consent',
        severity: 'high',
        description: 'OAuth consent activity detected'
      }
    ];

    for (const pattern of appPatterns) {
      if (pattern.pattern.test(event.operation)) {
        findings.push({
          id: `finding_${findings.length + 1}`,
          title: pattern.description,
          severity: pattern.severity,
          description: `${pattern.description}: ${event.operation} by ${event.user}`,
          timestamp: event.timestamp,
          source: 'entra_audit_logs',
          type: pattern.type,
          category: 'application_management',
          affectedEntities: {
            users: [event.user],
            applications: [event.application],
            operations: [event.operation]
          },
          evidence: {
            operation: event.operation,
            result: event.result,
            application: event.application,
            targetResources: event.targetResources
          },
          mitreAttack: this.getMitreMapping(pattern.type),
          recommendations: this.getRecommendations(pattern.type)
        });
      }
    }
  }

  async checkBruteForcePatterns(event, recentEvents, findings, statistics) {
    if (event.result === 'failure' || event.result === 'Failure' || event.result === 'failed') {
      const failureCount = recentEvents.filter(e => {
        const normalizedE = this.normalizeAuditEvent(e);
        return normalizedE.user === event.user && 
               (normalizedE.result === 'failure' || normalizedE.result === 'Failure' || normalizedE.result === 'failed') &&
               Math.abs(normalizedE.timestamp - event.timestamp) < 3600000; // 1 hour
      }).length;

      if (failureCount > 3) {
        findings.push({
          id: `finding_${findings.length + 1}`,
          title: 'Potential Brute Force Attack',
          severity: 'high',
          description: `User ${event.user} has ${failureCount} failed attempts in the last hour`,
          timestamp: event.timestamp,
          source: 'entra_audit_logs',
          type: 'brute_force',
          category: 'security',
          affectedEntities: {
            users: [event.user],
            ipAddresses: event.ipAddress !== 'Unknown' ? [event.ipAddress] : []
          },
          evidence: {
            failureCount: failureCount,
            timeWindow: '1 hour',
            ipAddress: event.ipAddress,
            userAgent: event.userAgent
          },
          mitreAttack: {
            tactics: ['Credential Access', 'Initial Access'],
            techniques: ['T1110', 'T1078'],
            subTechniques: ['T1110.001', 'T1110.003']
          },
          recommendations: [
            'Implement account lockout policies',
            'Monitor for additional suspicious activity',
            'Consider blocking IP address if pattern continues',
            'Review MFA implementation'
          ]
        });
      }
    }
  }

  async performPostProcessingAnalysis(auditData, findings, statistics) {
    // Analyze patterns across all events
    const userActivityMap = new Map();
    const ipActivityMap = new Map();
    const appActivityMap = new Map();

    for (const event of auditData) {
      const normalized = this.normalizeAuditEvent(event);
      
      // Track user activities
      if (!userActivityMap.has(normalized.user)) {
        userActivityMap.set(normalized.user, []);
      }
      userActivityMap.get(normalized.user).push(normalized);

      // Track IP activities
      if (!ipActivityMap.has(normalized.ipAddress)) {
        ipActivityMap.set(normalized.ipAddress, []);
      }
      ipActivityMap.get(normalized.ipAddress).push(normalized);

      // Track application activities
      if (!appActivityMap.has(normalized.application)) {
        appActivityMap.set(normalized.application, []);
      }
      appActivityMap.get(normalized.application).push(normalized);
    }

    // Detect anomalous user behavior
    for (const [user, activities] of userActivityMap) {
      if (activities.length > 1000) { // High activity threshold
        findings.push({
          id: `finding_${findings.length + 1}`,
          title: 'Unusually High User Activity',
          severity: 'medium',
          description: `User ${user} performed ${activities.length} activities - unusually high volume`,
          timestamp: new Date(),
          source: 'entra_audit_logs',
          type: 'high_activity_user',
          category: 'behavioral',
          affectedEntities: {
            users: [user]
          },
          evidence: {
            activityCount: activities.length,
            timespan: 'Analysis period'
          },
          mitreAttack: {
            tactics: ['Collection', 'Exfiltration'],
            techniques: ['T1005', 'T1041'],
            subTechniques: ['T1005.001']
          },
          recommendations: [
            'Investigate the nature of high activity',
            'Verify if user behavior is legitimate',
            'Monitor for data exfiltration attempts'
          ]
        });
      }
    }

    // Detect suspicious IP behavior
    for (const [ip, activities] of ipActivityMap) {
      if (ip !== 'Unknown' && activities.length > 500) { // High activity threshold per IP
        const uniqueUsers = new Set(activities.map(a => a.user));
        if (uniqueUsers.size > 10) { // Multiple users from same IP
          findings.push({
            id: `finding_${findings.length + 1}`,
            title: 'Multiple Users from Same IP',
            severity: 'high',
            description: `IP ${ip} used by ${uniqueUsers.size} different users - potential shared/compromised connection`,
            timestamp: new Date(),
            source: 'entra_audit_logs',
            type: 'shared_ip_access',
            category: 'security',
            affectedEntities: {
              ipAddresses: [ip],
              users: Array.from(uniqueUsers)
            },
            evidence: {
              ipAddress: ip,
              userCount: uniqueUsers.size,
              activityCount: activities.length
            },
            mitreAttack: {
              tactics: ['Initial Access', 'Lateral Movement'],
              techniques: ['T1078', 'T1021'],
              subTechniques: ['T1078.004']
            },
            recommendations: [
              'Investigate the legitimacy of shared IP usage',
              'Verify if this is a corporate network or VPN',
              'Monitor for potential account compromise'
            ]
          });
        }
      }
    }
  }

  getMitreMapping(type) {
    const mapping = {
      'password_reset': {
        tactics: ['Credential Access', 'Defense Evasion'],
        techniques: ['T1110', 'T1556'],
        subTechniques: ['T1110.001', 'T1556.001']
      },
      'role_assignment': {
        tactics: ['Privilege Escalation', 'Persistence'],
        techniques: ['T1134', 'T1078'],
        subTechniques: ['T1134.001', 'T1078.004']
      },
      'permission_grant': {
        tactics: ['Privilege Escalation', 'Persistence'],
        techniques: ['T1134', 'T1078'],
        subTechniques: ['T1134.001', 'T1078.004']
      },
      'user_deletion': {
        tactics: ['Impact', 'Defense Evasion'],
        techniques: ['T1531', 'T1070'],
        subTechniques: ['T1531.001', 'T1070.004']
      },
      'admin_consent': {
        tactics: ['Privilege Escalation', 'Persistence'],
        techniques: ['T1134', 'T1098'],
        subTechniques: ['T1134.001', 'T1098.001']
      },
      'mfa_disable': {
        tactics: ['Defense Evasion', 'Credential Access'],
        techniques: ['T1556', 'T1110'],
        subTechniques: ['T1556.006', 'T1110.001']
      }
    };
    
    return mapping[type] || {
      tactics: ['Defense Evasion'],
      techniques: ['T1562'],
      subTechniques: ['T1562.001']
    };
  }

  getRecommendations(type) {
    const recommendations = {
      'password_reset': [
        'Verify the legitimacy of password reset requests',
        'Implement strong password policies',
        'Monitor for subsequent suspicious activity'
      ],
      'role_assignment': [
        'Review the necessity of role assignments',
        'Implement approval workflows for role changes',
        'Monitor for abuse of assigned roles'
      ],
      'permission_grant': [
        'Verify authorization for permission grants',
        'Implement least privilege principles',
        'Regular review of granted permissions'
      ],
      'user_deletion': [
        'Verify authorization for user deletion',
        'Ensure proper data retention policies',
        'Monitor for unauthorized deletions'
      ],
      'admin_consent': [
        'Review admin consent grants carefully',
        'Implement approval workflows',
        'Monitor application permissions'
      ],
      'mfa_disable': [
        'Immediate investigation required',
        'Re-enable MFA if unauthorized',
        'Review MFA bypass policies'
      ]
    };
    
    return recommendations[type] || [
      'Investigate the activity',
      'Verify authorization',
      'Monitor for additional suspicious behavior'
    ];
  }

  identifyTopThreats(findings) {
    const threatCounts = {};
    
    findings.forEach(finding => {
      if (!threatCounts[finding.type]) {
        threatCounts[finding.type] = 0;
      }
      threatCounts[finding.type]++;
    });

    return Object.entries(threatCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }));
  }

  calculateRiskScore(findings, statistics) {
    let score = 0;
    
    // Base score from findings
    findings.forEach(finding => {
      switch (finding.severity) {
        case 'critical':
          score += 10;
          break;
        case 'high':
          score += 5;
          break;
        case 'medium':
          score += 2;
          break;
        case 'low':
          score += 1;
          break;
      }
    });

    // Additional score from statistics
    score += statistics.failedOperations * 0.1;
    score += statistics.blacklistedEntities.applications * 2;
    score += statistics.blacklistedEntities.countries * 3;
    score += statistics.blacklistedEntities.userAgents * 1;

    return Math.min(100, Math.round(score));
  }

  // Analyze MFA data from Microsoft Graph
  async analyzeMfaData(mfaData, parameters) {
    if (!this.initialized) {
      await this.initialize();
    }

    const findings = [];
    const statistics = {
      totalUsers: mfaData.length,
      mfaEnabled: 0,
      mfaDisabled: 0,
      strongAuthMethods: 0,
      weakAuthMethods: 0,
      suspiciousActivities: 0
    };

    for (const user of mfaData) {
      const userPrincipalName = user.userPrincipalName || user.UserPrincipalName || 'Unknown';
      const mfaStatus = user.mfaStatus || user.MfaStatus || 'Unknown';
      const authMethods = user.authMethods || user.AuthMethods || [];

      if (mfaStatus === 'Enabled') {
        statistics.mfaEnabled++;
      } else {
        statistics.mfaDisabled++;
        
        // Create finding for disabled MFA
        findings.push({
          id: `finding_${findings.length + 1}`,
          title: 'MFA Disabled for User',
          severity: 'high',
          description: `User ${userPrincipalName} has MFA disabled`,
          timestamp: new Date(),
          source: 'mfa_graph_data',
          type: 'mfa_disabled',
          category: 'security',
          affectedEntities: {
            users: [userPrincipalName],
            resources: [],
            applications: []
          },
          evidence: {
            userPrincipalName,
            mfaStatus,
            authMethods
          },
          mitreAttack: {
            tactics: ['Defense Evasion', 'Credential Access'],
            techniques: ['T1556', 'T1110'],
            subTechniques: ['T1556.001', 'T1110.001']
          },
          recommendations: [
            'Enable MFA for this user immediately',
            'Review MFA policy compliance',
            'Investigate why MFA was disabled'
          ]
        });
      }

      // Check for weak authentication methods
      if (authMethods.length > 0) {
        const weakMethods = authMethods.filter(method => 
          method.toLowerCase().includes('sms') || 
          method.toLowerCase().includes('voice') ||
          method.toLowerCase().includes('email')
        );
        
        if (weakMethods.length > 0) {
          statistics.weakAuthMethods++;
          findings.push({
            id: `finding_${findings.length + 1}`,
            title: 'Weak MFA Method Detected',
            severity: 'medium',
            description: `User ${userPrincipalName} is using weak MFA methods: ${weakMethods.join(', ')}`,
            timestamp: new Date(),
            source: 'mfa_graph_data',
            type: 'weak_mfa_method',
            category: 'security',
            affectedEntities: {
              users: [userPrincipalName],
              resources: [],
              applications: []
            },
            evidence: {
              userPrincipalName,
              weakMethods,
              allMethods: authMethods
            },
            mitreAttack: {
              tactics: ['Defense Evasion'],
              techniques: ['T1556'],
              subTechniques: ['T1556.001']
            },
            recommendations: [
              'Upgrade to stronger MFA methods (authenticator app, hardware token)',
              'Disable SMS/voice-based MFA',
              'Review organizational MFA policy'
            ]
          });
        } else {
          statistics.strongAuthMethods++;
        }
      }
    }

    return {
      findings,
      statistics,
      summary: {
        totalFindings: findings.length,
        highSeverityFindings: findings.filter(f => f.severity === 'high').length,
        mediumSeverityFindings: findings.filter(f => f.severity === 'medium').length,
        lowSeverityFindings: findings.filter(f => f.severity === 'low').length
      }
    };
  }

  // Analyze Device data from Microsoft Graph
  async analyzeDeviceData(deviceData, parameters) {
    if (!this.initialized) {
      await this.initialize();
    }

    const findings = [];
    const statistics = {
      totalDevices: deviceData.length,
      compliantDevices: 0,
      nonCompliantDevices: 0,
      managedDevices: 0,
      unmanagedDevices: 0,
      suspiciousDevices: 0
    };

    for (const device of deviceData) {
      const deviceName = device.displayName || device.DeviceName || 'Unknown';
      const isCompliant = device.isCompliant || device.IsCompliant || false;
      const isManaged = device.isManaged || device.IsManaged || false;
      const operatingSystem = device.operatingSystem || device.OperatingSystem || 'Unknown';
      const lastSeenDateTime = device.lastSeenDateTime || device.LastSeenDateTime;

      if (isCompliant) {
        statistics.compliantDevices++;
      } else {
        statistics.nonCompliantDevices++;
        
        // Create finding for non-compliant device
        findings.push({
          id: `finding_${findings.length + 1}`,
          title: 'Non-Compliant Device Detected',
          severity: 'medium',
          description: `Device ${deviceName} is not compliant with organizational policies`,
          timestamp: new Date(),
          source: 'device_graph_data',
          type: 'non_compliant_device',
          category: 'security',
          affectedEntities: {
            devices: [deviceName],
            resources: [],
            applications: []
          },
          evidence: {
            deviceName,
            isCompliant,
            isManaged,
            operatingSystem,
            lastSeenDateTime
          },
          mitreAttack: {
            tactics: ['Initial Access', 'Persistence'],
            techniques: ['T1078', 'T1566'],
            subTechniques: ['T1078.004', 'T1566.001']
          },
          recommendations: [
            'Review device compliance policies',
            'Remediate compliance issues',
            'Consider blocking non-compliant devices'
          ]
        });
      }

      if (isManaged) {
        statistics.managedDevices++;
      } else {
        statistics.unmanagedDevices++;
        
        // Create finding for unmanaged device
        findings.push({
          id: `finding_${findings.length + 1}`,
          title: 'Unmanaged Device Detected',
          severity: 'high',
          description: `Device ${deviceName} is not managed by the organization`,
          timestamp: new Date(),
          source: 'device_graph_data',
          type: 'unmanaged_device',
          category: 'security',
          affectedEntities: {
            devices: [deviceName],
            resources: [],
            applications: []
          },
          evidence: {
            deviceName,
            isCompliant,
            isManaged,
            operatingSystem,
            lastSeenDateTime
          },
          mitreAttack: {
            tactics: ['Initial Access', 'Persistence'],
            techniques: ['T1078', 'T1566'],
            subTechniques: ['T1078.004', 'T1566.001']
          },
          recommendations: [
            'Enroll device in management system',
            'Apply security policies to device',
            'Monitor unmanaged device access'
          ]
        });
      }

      // Check for old operating systems
      if (operatingSystem.toLowerCase().includes('windows 7') || 
          operatingSystem.toLowerCase().includes('windows 8') ||
          operatingSystem.toLowerCase().includes('windows xp')) {
        statistics.suspiciousDevices++;
        findings.push({
          id: `finding_${findings.length + 1}`,
          title: 'Legacy Operating System Detected',
          severity: 'high',
          description: `Device ${deviceName} is running legacy OS: ${operatingSystem}`,
          timestamp: new Date(),
          source: 'device_graph_data',
          type: 'legacy_os',
          category: 'security',
          affectedEntities: {
            devices: [deviceName],
            resources: [],
            applications: []
          },
          evidence: {
            deviceName,
            operatingSystem,
            lastSeenDateTime
          },
          mitreAttack: {
            tactics: ['Initial Access', 'Privilege Escalation'],
            techniques: ['T1068', 'T1078'],
            subTechniques: ['T1068.001', 'T1078.004']
          },
          recommendations: [
            'Upgrade to supported operating system',
            'Apply security patches',
            'Consider blocking legacy devices'
          ]
        });
      }
    }

    return {
      findings,
      statistics,
      summary: {
        totalFindings: findings.length,
        highSeverityFindings: findings.filter(f => f.severity === 'high').length,
        mediumSeverityFindings: findings.filter(f => f.severity === 'medium').length,
        lowSeverityFindings: findings.filter(f => f.severity === 'low').length
      }
    };
  }

  // Analyze User data from Microsoft Graph
  async analyzeUserData(userData, parameters) {
    if (!this.initialized) {
      await this.initialize();
    }

    const findings = [];
    const statistics = {
      totalUsers: userData.length,
      enabledUsers: 0,
      disabledUsers: 0,
      adminUsers: 0,
      guestUsers: 0,
      suspiciousUsers: 0
    };

    for (const user of userData) {
      const userPrincipalName = user.userPrincipalName || user.UserPrincipalName || 'Unknown';
      const accountEnabled = user.accountEnabled || user.AccountEnabled || false;
      const userType = user.userType || user.UserType || 'Member';
      const createdDateTime = user.createdDateTime || user.CreatedDateTime;
      const lastSignInDateTime = user.lastSignInDateTime || user.LastSignInDateTime;

      if (accountEnabled) {
        statistics.enabledUsers++;
      } else {
        statistics.disabledUsers++;
      }

      if (userType === 'Guest') {
        statistics.guestUsers++;
        
        // Create finding for guest users
        findings.push({
          id: `finding_${findings.length + 1}`,
          title: 'Guest User Detected',
          severity: 'low',
          description: `Guest user detected: ${userPrincipalName}`,
          timestamp: new Date(),
          source: 'user_graph_data',
          type: 'guest_user',
          category: 'security',
          affectedEntities: {
            users: [userPrincipalName],
            resources: [],
            applications: []
          },
          evidence: {
            userPrincipalName,
            userType,
            accountEnabled,
            createdDateTime,
            lastSignInDateTime
          },
          mitreAttack: {
            tactics: ['Initial Access', 'Persistence'],
            techniques: ['T1078', 'T1136'],
            subTechniques: ['T1078.004', 'T1136.003']
          },
          recommendations: [
            'Review guest user access permissions',
            'Verify business justification for guest access',
            'Monitor guest user activities'
          ]
        });
      }

      // Check for inactive users
      if (lastSignInDateTime) {
        const lastSignIn = new Date(lastSignInDateTime);
        const daysSinceLastSignIn = (Date.now() - lastSignIn.getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysSinceLastSignIn > 90 && accountEnabled) {
          statistics.suspiciousUsers++;
          findings.push({
            id: `finding_${findings.length + 1}`,
            title: 'Inactive User Account',
            severity: 'medium',
            description: `User ${userPrincipalName} has not signed in for ${Math.round(daysSinceLastSignIn)} days`,
            timestamp: new Date(),
            source: 'user_graph_data',
            type: 'inactive_user',
            category: 'security',
            affectedEntities: {
              users: [userPrincipalName],
              resources: [],
              applications: []
            },
            evidence: {
              userPrincipalName,
              lastSignInDateTime,
              daysSinceLastSignIn: Math.round(daysSinceLastSignIn),
              accountEnabled
            },
            mitreAttack: {
              tactics: ['Defense Evasion', 'Persistence'],
              techniques: ['T1078', 'T1136'],
              subTechniques: ['T1078.004', 'T1136.001']
            },
            recommendations: [
              'Disable inactive user accounts',
              'Review account necessity',
              'Implement automated account lifecycle management'
            ]
          });
        }
      }
    }

    return {
      findings,
      statistics,
      summary: {
        totalFindings: findings.length,
        highSeverityFindings: findings.filter(f => f.severity === 'high').length,
        mediumSeverityFindings: findings.filter(f => f.severity === 'medium').length,
        lowSeverityFindings: findings.filter(f => f.severity === 'low').length
      }
    };
  }

  // Analyze License data from Microsoft Graph
  async analyzeLicenseData(licenseData, parameters) {
    if (!this.initialized) {
      await this.initialize();
    }

    const findings = [];
    const statistics = {
      totalLicenses: licenseData.length,
      activeLicenses: 0,
      expiredLicenses: 0,
      underutilizedLicenses: 0,
      suspiciousLicenses: 0
    };

    for (const license of licenseData) {
      const skuName = license.skuPartNumber || license.SkuPartNumber || 'Unknown';
      const consumedUnits = license.consumedUnits || license.ConsumedUnits || 0;
      const prepaidUnits = license.prepaidUnits || license.PrepaidUnits || {};
      const enabled = prepaidUnits.enabled || prepaidUnits.Enabled || 0;
      const expired = prepaidUnits.expired || prepaidUnits.Expired || 0;
      const suspended = prepaidUnits.suspended || prepaidUnits.Suspended || 0;

      if (enabled > 0) {
        statistics.activeLicenses++;
      }

      if (expired > 0) {
        statistics.expiredLicenses++;
        
        // Create finding for expired licenses
        findings.push({
          id: `finding_${findings.length + 1}`,
          title: 'Expired Licenses Detected',
          severity: 'medium',
          description: `License ${skuName} has ${expired} expired units`,
          timestamp: new Date(),
          source: 'license_graph_data',
          type: 'expired_license',
          category: 'compliance',
          affectedEntities: {
            licenses: [skuName],
            resources: [],
            applications: []
          },
          evidence: {
            skuName,
            consumedUnits,
            enabledUnits: enabled,
            expiredUnits: expired,
            suspendedUnits: suspended
          },
          mitreAttack: {
            tactics: ['Resource Development'],
            techniques: ['T1583'],
            subTechniques: ['T1583.001']
          },
          recommendations: [
            'Renew expired licenses',
            'Review license usage patterns',
            'Implement license monitoring'
          ]
        });
      }

      // Check for underutilized licenses
      if (enabled > 0 && consumedUnits < enabled * 0.5) {
        statistics.underutilizedLicenses++;
        findings.push({
          id: `finding_${findings.length + 1}`,
          title: 'Underutilized License Detected',
          severity: 'low',
          description: `License ${skuName} is underutilized: ${consumedUnits}/${enabled} units used`,
          timestamp: new Date(),
          source: 'license_graph_data',
          type: 'underutilized_license',
          category: 'optimization',
          affectedEntities: {
            licenses: [skuName],
            resources: [],
            applications: []
          },
          evidence: {
            skuName,
            consumedUnits,
            enabledUnits: enabled,
            utilizationRate: (consumedUnits / enabled) * 100
          },
          mitreAttack: {
            tactics: ['Resource Development'],
            techniques: ['T1583'],
            subTechniques: ['T1583.001']
          },
          recommendations: [
            'Optimize license allocation',
            'Consider reducing license count',
            'Review user license assignments'
          ]
        });
      }
    }

    return {
      findings,
      statistics,
      summary: {
        totalFindings: findings.length,
        highSeverityFindings: findings.filter(f => f.severity === 'high').length,
        mediumSeverityFindings: findings.filter(f => f.severity === 'medium').length,
        lowSeverityFindings: findings.filter(f => f.severity === 'low').length
      }
    };
  }
}

module.exports = EnhancedAnalyzer;