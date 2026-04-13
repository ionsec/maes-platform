const { pool } = require('../database');
const { logger } = require('../../utils/logger');
const { v4: uuidv4 } = require('uuid');

/**
 * Automated Playbooks - Incident Response Orchestration
 * Pre-built workflows for common security incidents
 */

class PlaybookEngine {
  constructor() {
    this.playbooks = new Map();
    this.registerBuiltInPlaybooks();
  }

  registerBuiltInPlaybooks() {
    // Compromised Account Playbook
    this.registerPlaybook({
      id: 'compromised-account',
      name: 'Compromised Account Response',
      description: 'Respond to suspected account compromise',
      version: '1.0.0',
      triggers: ['alert_type:brute_force', 'alert_type:impossible_travel', 'alert_type:suspicious_signin'],
      severity_threshold: 'high',
      steps: [
        {
          id: 'gather_intel',
          name: 'Gather Intelligence',
          type: 'enrichment',
          actions: ['get_user_details', 'get_recent_activities', 'get_signin_locations'],
          timeout: 300
        },
        {
          id: 'assess_impact',
          name: 'Assess Impact',
          type: 'analysis',
          actions: ['check_privileged_access', 'check_data_access', 'check_mailbox_rules'],
          timeout: 300
        },
        {
          id: 'contain',
          name: 'Containment',
          type: 'response',
          actions: ['force_password_reset', 'revoke_sessions', 'require_mfa'],
          timeout: 600,
          auto_execute: false,
          requires_approval: true
        },
        {
          id: 'investigate',
          name: 'Investigation',
          type: 'investigation',
          actions: ['create_incident', 'assign_investigator', 'collect_evidence'],
          timeout: 3600
        },
        {
          id: 'remediate',
          name: 'Remediation',
          type: 'response',
          actions: ['review_mailbox_rules', 'check_forwarding', 'review_app_consent'],
          timeout: 1800,
          auto_execute: false
        },
        {
          id: 'document',
          name: 'Documentation',
          type: 'documentation',
          actions: ['generate_report', 'update_incident_notes', 'close_incident'],
          timeout: 900
        }
      ]
    });

    // Phishing Response Playbook
    this.registerPlaybook({
      id: 'phishing-response',
      name: 'Phishing Email Response',
      description: 'Respond to reported phishing emails',
      version: '1.0.0',
      triggers: ['alert_type:phishing', 'alert_type:malicious_email'],
      severity_threshold: 'medium',
      steps: [
        {
          id: 'analyze_email',
          name: 'Analyze Email',
          type: 'analysis',
          actions: ['get_email_headers', 'extract_urls', 'extract_attachments'],
          timeout: 300
        },
        {
          id: 'enrich_iocs',
          name: 'Enrich IOCs',
          type: 'enrichment',
          actions: ['check_urls_virustotal', 'check_sender_reputation', 'check_attachments'],
          timeout: 600
        },
        {
          id: 'contain',
          name: 'Containment',
          type: 'response',
          actions: ['soft_delete_email', 'block_sender', 'block_urls'],
          timeout: 300,
          auto_execute: true
        },
        {
          id: 'search_similar',
          name: 'Search Similar Emails',
          type: 'investigation',
          actions: ['find_similar_emails', 'identify_affected_users'],
          timeout: 600
        },
        {
          id: 'notify',
          name: 'User Notification',
          type: 'communication',
          actions: ['notify_affected_users', 'send_security_alert'],
          timeout: 300,
          auto_execute: false
        }
      ]
    });

    // Privileged Access Abuse Playbook
    this.registerPlaybook({
      id: 'privileged-access-abuse',
      name: 'Privileged Access Abuse Response',
      description: 'Respond to suspicious admin activity',
      version: '1.0.0',
      triggers: ['alert_type:privilege_escalation', 'alert_type:unusual_admin_activity'],
      severity_threshold: 'high',
      steps: [
        {
          id: 'identify_scope',
          name: 'Identify Scope',
          type: 'analysis',
          actions: ['get_admin_actions', 'check_role_changes', 'check_permission_grants'],
          timeout: 300
        },
        {
          id: 'assess_damage',
          name: 'Assess Damage',
          type: 'analysis',
          actions: ['check_data_access', 'check_config_changes', 'check_new_accounts'],
          timeout: 600
        },
        {
          id: 'contain',
          name: 'Immediate Containment',
          type: 'response',
          actions: ['disable_admin_account', 'revoke_admin_roles', 'block_signin'],
          timeout: 300,
          auto_execute: false,
          requires_approval: true
        },
        {
          id: 'forensics',
          name: 'Forensic Collection',
          type: 'investigation',
          actions: ['collect_audit_logs', 'export_activity_timeline', 'preserve_evidence'],
          timeout: 1800
        }
      ]
    });
  }

  registerPlaybook(playbook) {
    this.playbooks.set(playbook.id, playbook);
    logger.info(`Registered playbook: ${playbook.name}`);
  }

  /**
   * Execute playbook for an alert or incident
   */
  async executePlaybook(playbookId, context) {
    const playbook = this.playbooks.get(playbookId);
    
    if (!playbook) {
      throw new Error(`Playbook ${playbookId} not found`);
    }

    const execution = {
      id: uuidv4(),
      playbook_id: playbookId,
      playbook_name: playbook.name,
      status: 'running',
      current_step: null,
      steps: [],
      started_at: new Date(),
      completed_at: null,
      context,
      results: {}
    };

    logger.info(`Starting playbook execution: ${playbook.name}`, { 
      execution_id: execution.id,
      alert_id: context.alertId,
      incident_id: context.incidentId 
    });

    // Save execution start
    await this.saveExecution(execution);

    try {
      for (const step of playbook.steps) {
        execution.current_step = step.id;
        
        const stepResult = await this.executeStep(step, context, execution);
        execution.steps.push(stepResult);
        execution.results[step.id] = stepResult;

        // Check if we should continue
        if (stepResult.status === 'failed' && step.required !== false) {
          execution.status = 'failed';
          break;
        }

        // Check for manual approval requirement
        if (step.requires_approval && !stepResult.approved) {
          execution.status = 'pending_approval';
          await this.updateExecution(execution);
          return execution;
        }

        await this.updateExecution(execution);
      }

      execution.status = 'completed';
      execution.completed_at = new Date();
      
      logger.info(`Playbook execution completed: ${playbook.name}`, { 
        execution_id: execution.id,
        status: execution.status 
      });
    } catch (error) {
      execution.status = 'error';
      execution.error = error.message;
      logger.error(`Playbook execution error: ${playbook.name}`, error);
    }

    await this.updateExecution(execution);
    return execution;
  }

  /**
   * Execute a single playbook step
   */
  async executeStep(step, context, execution) {
    const stepExecution = {
      step_id: step.id,
      step_name: step.name,
      status: 'running',
      started_at: new Date(),
      actions: [],
      results: {}
    };

    logger.info(`Executing step: ${step.name}`, { step_id: step.id });

    try {
      for (const action of step.actions) {
        const actionResult = await this.executeAction(action, context, execution);
        stepExecution.actions.push(actionResult);
        stepExecution.results[action] = actionResult;
      }

      stepExecution.status = 'completed';
      stepExecution.completed_at = new Date();
    } catch (error) {
      stepExecution.status = 'failed';
      stepExecution.error = error.message;
    }

    return stepExecution;
  }

  /**
   * Execute a single action
   */
  async executeAction(action, context, execution) {
    logger.debug(`Executing action: ${action}`);

    // Map actions to service methods
    const actionHandlers = {
      // Enrichment actions
      'get_user_details': async () => await this.getUserDetails(context.userId),
      'get_recent_activities': async () => await this.getRecentActivities(context.userId),
      'get_signin_locations': async () => await this.getSigninLocations(context.userId),
      
      // Analysis actions
      'check_privileged_access': async () => await this.checkPrivilegedAccess(context.userId),
      'check_data_access': async () => await this.checkDataAccess(context.userId),
      'check_mailbox_rules': async () => await this.checkMailboxRules(context.userId),
      
      // Response actions
      'force_password_reset': async () => await this.forcePasswordReset(context.userId),
      'revoke_sessions': async () => await this.revokeSessions(context.userId),
      'require_mfa': async () => await this.requireMFA(context.userId),
      
      // Investigation actions
      'create_incident': async () => await this.createIncident(context),
      'assign_investigator': async () => await this.assignInvestigator(context),
      'collect_evidence': async () => await this.collectEvidence(context),
      
      // Email analysis
      'get_email_headers': async () => await this.getEmailHeaders(context.emailId),
      'extract_urls': async () => await this.extractUrls(context.emailId),
      'extract_attachments': async () => await this.extractAttachments(context.emailId),
      
      // IOC enrichment
      'check_urls_virustotal': async () => await this.checkURLsVirusTotal(context.urls),
      'check_sender_reputation': async () => await this.checkSenderReputation(context.sender),
      'check_attachments': async () => await this.checkAttachments(context.attachments),
      
      // Containment
      'soft_delete_email': async () => await this.softDeleteEmail(context.emailId),
      'block_sender': async () => await this.blockSender(context.sender),
      'block_urls': async () => await this.blockURLs(context.urls),
      
      // Search
      'find_similar_emails': async () => await this.findSimilarEmails(context),
      'identify_affected_users': async () => await this.identifyAffectedUsers(context),
      
      // Communication
      'notify_affected_users': async () => await this.notifyAffectedUsers(context),
      'send_security_alert': async () => await this.sendSecurityAlert(context),
      
      // Admin abuse
      'get_admin_actions': async () => await this.getAdminActions(context.userId),
      'check_role_changes': async () => await this.checkRoleChanges(context.userId),
      'check_permission_grants': async () => await this.checkPermissionGrants(context.userId),
      'check_config_changes': async () => await this.checkConfigChanges(context),
      'check_new_accounts': async () => await this.checkNewAccounts(context),
      
      // Containment for admin
      'disable_admin_account': async () => await this.disableAdminAccount(context.userId),
      'revoke_admin_roles': async () => await this.revokeAdminRoles(context.userId),
      'block_signin': async () => await this.blockSignin(context.userId),
      
      // Forensics
      'collect_audit_logs': async () => await this.collectAuditLogs(context),
      'export_activity_timeline': async () => await this.exportActivityTimeline(context),
      'preserve_evidence': async () => await this.preserveEvidence(context),
      
      // Documentation
      'generate_report': async () => await this.generateReport(execution),
      'update_incident_notes': async () => await this.updateIncidentNotes(execution),
      'close_incident': async () => await this.closeIncident(execution)
    };

    const handler = actionHandlers[action];
    
    if (!handler) {
      return {
        action,
        status: 'not_implemented',
        message: `Action ${action} not implemented`
      };
    }

    try {
      const result = await handler();
      return {
        action,
        status: 'completed',
        result
      };
    } catch (error) {
      return {
        action,
        status: 'failed',
        error: error.message
      };
    }
  }

  // Placeholder implementations - would integrate with actual services
  async getUserDetails(userId) { return { userId, status: 'fetched' }; }
  async getRecentActivities(userId) { return { activities: [] }; }
  async getSigninLocations(userId) { return { locations: [] }; }
  async checkPrivilegedAccess(userId) { return { isPrivileged: false }; }
  async checkDataAccess(userId) { return { accessedResources: [] }; }
  async checkMailboxRules(userId) { return { rules: [] }; }
  async forcePasswordReset(userId) { return { success: true }; }
  async revokeSessions(userId) { return { revokedCount: 0 }; }
  async requireMFA(userId) { return { success: true }; }
  async createIncident(context) { return { incidentId: uuidv4() }; }
  async assignInvestigator(context) { return { assigned: true }; }
  async collectEvidence(context) { return { evidence: [] }; }
  async getEmailHeaders(emailId) { return { headers: {} }; }
  async extractUrls(emailId) { return { urls: [] }; }
  async extractAttachments(emailId) { return { attachments: [] }; }
  async checkURLsVirusTotal(urls) { return { results: [] }; }
  async checkSenderReputation(sender) { return { reputation: 'unknown' }; }
  async checkAttachments(attachments) { return { results: [] }; }
  async softDeleteEmail(emailId) { return { success: true }; }
  async blockSender(sender) { return { success: true }; }
  async blockURLs(urls) { return { blocked: [] }; }
  async findSimilarEmails(context) { return { emails: [] }; }
  async identifyAffectedUsers(context) { return { users: [] }; }
  async notifyAffectedUsers(context) { return { notified: [] }; }
  async sendSecurityAlert(context) { return { sent: true }; }
  async getAdminActions(userId) { return { actions: [] }; }
  async checkRoleChanges(userId) { return { changes: [] }; }
  async checkPermissionGrants(userId) { return { grants: [] }; }
  async checkConfigChanges(context) { return { changes: [] }; }
  async checkNewAccounts(context) { return { accounts: [] }; }
  async disableAdminAccount(userId) { return { success: true }; }
  async revokeAdminRoles(userId) { return { revoked: [] }; }
  async blockSignin(userId) { return { success: true }; }
  async collectAuditLogs(context) { return { logs: [] }; }
  async exportActivityTimeline(context) { return { timeline: [] }; }
  async preserveEvidence(context) { return { preserved: [] }; }
  async generateReport(execution) { return { reportId: uuidv4() }; }
  async updateIncidentNotes(execution) { return { updated: true }; }
  async closeIncident(execution) { return { closed: true }; }

  // Database persistence
  async saveExecution(execution) {
    try {
      await pool.query(
        `INSERT INTO maes.playbook_executions 
         (id, playbook_id, playbook_name, status, context, started_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [execution.id, execution.playbook_id, execution.playbook_name, 
         execution.status, JSON.stringify(execution.context), execution.started_at]
      );
    } catch (error) {
      logger.error('Error saving playbook execution:', error);
    }
  }

  async updateExecution(execution) {
    try {
      await pool.query(
        `UPDATE maes.playbook_executions 
         SET status = $1, current_step = $2, steps = $3, completed_at = $4, error = $5
         WHERE id = $6`,
        [execution.status, execution.current_step, JSON.stringify(execution.steps),
         execution.completed_at, execution.error, execution.id]
      );
    } catch (error) {
      logger.error('Error updating playbook execution:', error);
    }
  }

  async getExecution(executionId) {
    const result = await pool.query(
      `SELECT * FROM maes.playbook_executions WHERE id = $1`,
      [executionId]
    );
    return result.rows[0];
  }

  async listExecutions(filters = {}) {
    const conditions = [];
    const values = [];
    
    if (filters.playbook_id) {
      conditions.push(`playbook_id = $${values.length + 1}`);
      values.push(filters.playbook_id);
    }
    
    if (filters.status) {
      conditions.push(`status = $${values.length + 1}`);
      values.push(filters.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT * FROM maes.playbook_executions 
       ${whereClause}
       ORDER BY started_at DESC
       LIMIT 50`,
      values
    );

    return result.rows;
  }
}

module.exports = new PlaybookEngine();
