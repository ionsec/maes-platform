const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { Client } = require('@elastic/elasticsearch');
const { logger } = require('./logger');

class EnhancedAnalyzer {
  constructor() {
    this.blacklists = {};
    this.config = {};
    this.elasticsearchClient = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      await this.loadBlacklists();
      await this.loadConfig();
      await this.initializeElasticsearch();
      this.initialized = true;
      logger.info('Enhanced analyzer initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize enhanced analyzer:', error);
      throw error;
    }
  }

  async initializeElasticsearch() {
    try {
      const elasticsearchUrl = process.env.ELASTICSEARCH_URL || 'http://localhost:9200';
      
      this.elasticsearchClient = new Client({
        node: elasticsearchUrl,
        maxRetries: 3,
        requestTimeout: 10000,
        sniffOnStart: false
      });

      // Test connection
      await this.elasticsearchClient.ping();
      logger.info('Elasticsearch connection established in analyzer');
    } catch (error) {
      logger.error('Failed to initialize Elasticsearch in analyzer:', error);
      // Don't throw error - Elasticsearch is optional for analyzer
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

  async indexAnalysisResults(extractionId, analysisResults) {
    if (!this.elasticsearchClient) return;

    try {
      const documents = [];
      
      // Index findings
      for (const finding of analysisResults.findings) {
        documents.push({
          index: { _index: 'maes-analysis-results' }
        });
        documents.push({
          '@timestamp': new Date(),
          extraction_id: extractionId,
          finding_id: finding.id,
          severity: finding.severity,
          type: finding.type,
          title: finding.title,
          description: finding.description,
          evidence: finding.evidence,
          mitre_techniques: finding.mitreTechniques,
          recommendations: finding.recommendations,
          metadata: finding.metadata
        });
      }

      if (documents.length > 0) {
        await this.elasticsearchClient.bulk({ body: documents });
        logger.info(`Indexed ${analysisResults.findings.length} analysis results to Elasticsearch`);
      }
    } catch (error) {
      logger.error('Failed to index analysis results to Elasticsearch:', error);
    }
  }

  normalizeAuditEvent(event) {
    // Handle different audit log formats (Graph API, PowerShell, etc.)
    return {
      id: event.id || event.Id || `event_${Date.now()}_${Math.random()}`,
      timestamp: new Date(event.activityDateTime || event.CreationTime || event.TimeGenerated || event.Timestamp),
      user: event.initiatedBy?.user?.userPrincipalName || 
            event.initiatedBy?.user?.displayName || 
            event.UserId || 
            event.UserPrincipalName || 
            event.UserDisplayName ||
            'Unknown',
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
      rawEvent: event
    };
  }

  updateStatistics(event, statistics) {
    statistics.uniqueUsers.add(event.user);
    statistics.uniqueOperations.add(event.operation);
    statistics.uniqueApplications.add(event.application);
    statistics.uniqueCountries.add(event.location);
    statistics.uniqueIPAddresses.add(event.ipAddress);

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
}

module.exports = EnhancedAnalyzer;