const { Queue } = require('bullmq');
const schedule = require('node-schedule');
const { ComplianceSchedule, Organization } = require('../models');
const { logger } = require('../logger');
const assessmentEngine = require('./assessmentEngine');
const { authorizeScan, AuthorizationError } = require('../recon/authorization');

class ComplianceScheduler {
  constructor() {
    this.scheduledJobs = new Map();
    this.complianceQueue = null;
    this.reconQueue = null;
    this.redisConnection = {
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD
    };
  }

  /**
   * Initialize the scheduler
   */
  async initialize() {
    try {
      // Initialize BullMQ queue
      this.complianceQueue = new Queue('compliance-assessments', {
        connection: this.redisConnection
      });

      this.reconQueue = new Queue('maes-recon', {
        connection: this.redisConnection
      });

      // Load existing schedules from database
      await this.loadSchedules();

      // Set up periodic schedule checking
      this.setupPeriodicCheck();

      logger.info('Compliance scheduler initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize compliance scheduler:', error);
      throw error;
    }
  }

  /**
   * Load all active schedules from database and activate them
   */
  async loadSchedules() {
    try {
      const schedules = await ComplianceSchedule.findAll({
        where: { is_active: true },
        include: [{
          model: Organization,
          as: 'organization',
          where: { is_active: true }
        }]
      });

      logger.info(`Loading ${schedules.length} active compliance schedules`);

      for (const schedule of schedules) {
        await this.activateSchedule(schedule);
      }

      logger.info(`Successfully activated ${schedules.length} compliance schedules`);
    } catch (error) {
      logger.error('Error loading compliance schedules:', error);
      throw error;
    }
  }

  /**
   * Create a new compliance schedule
   */
  async createSchedule(scheduleData) {
    try {
      const {
        organizationId,
        name,
        description,
        assessmentType = 'cis_v400',
        scheduleKind = 'compliance',
        seedDomain,
        reconProfile,
        frequency,
        createdBy,
        parameters = {}
      } = scheduleData;

      if (scheduleKind === 'external_exposure') {
        if (!seedDomain || !reconProfile) {
          throw new Error('An external exposure schedule requires seedDomain and reconProfile');
        }

        // Validate the scan is permitted now rather than discovering at 2am
        // that the schedule can never run. Authorization is re-checked at every
        // execution too, since it can expire or be revoked in the meantime.
        await authorizeScan({ organizationId, seedDomain, profile: reconProfile });
      }

      // Calculate next run time based on frequency
      const nextRunAt = this.calculateNextRun(frequency);

      // Create schedule in database
      const schedule = await ComplianceSchedule.create({
        organization_id: organizationId,
        name,
        description,
        assessment_type: assessmentType,
        schedule_kind: scheduleKind,
        seed_domain: scheduleKind === 'external_exposure' ? seedDomain : null,
        recon_profile: scheduleKind === 'external_exposure' ? reconProfile : null,
        frequency,
        is_active: true,
        next_run_at: nextRunAt,
        parameters,
        created_by: createdBy
      });

      // Activate the schedule
      await this.activateSchedule(schedule);

      logger.info(`Created compliance schedule ${schedule.id} for organization ${organizationId}`);
      return schedule;

    } catch (error) {
      logger.error('Error creating compliance schedule:', error);
      throw error;
    }
  }

  /**
   * Update an existing compliance schedule
   */
  async updateSchedule(scheduleId, updateData) {
    try {
      const schedule = await ComplianceSchedule.findByPk(scheduleId);
      if (!schedule) {
        throw new Error('Schedule not found');
      }

      // Deactivate current schedule
      await this.deactivateSchedule(scheduleId);

      // Update schedule
      await schedule.update(updateData);

      // Recalculate next run time if frequency changed
      if (updateData.frequency) {
        const nextRunAt = this.calculateNextRun(updateData.frequency);
        await schedule.update({ next_run_at: nextRunAt });
      }

      // Reactivate if still active
      if (schedule.is_active) {
        await this.activateSchedule(schedule);
      }

      logger.info(`Updated compliance schedule ${scheduleId}`);
      return schedule;

    } catch (error) {
      logger.error(`Error updating compliance schedule ${scheduleId}:`, error);
      throw error;
    }
  }

  /**
   * Delete a compliance schedule
   */
  async deleteSchedule(scheduleId) {
    try {
      // Deactivate the schedule
      await this.deactivateSchedule(scheduleId);

      // Delete from database
      const deletedCount = await ComplianceSchedule.destroy({
        where: { id: scheduleId }
      });

      if (deletedCount === 0) {
        throw new Error('Schedule not found');
      }

      logger.info(`Deleted compliance schedule ${scheduleId}`);
      return true;

    } catch (error) {
      logger.error(`Error deleting compliance schedule ${scheduleId}:`, error);
      throw error;
    }
  }

  /**
   * Activate a schedule by creating a cron job
   */
  async activateSchedule(schedule) {
    try {
      const scheduleId = schedule.id;
      const cronExpression = this.frequencyToCron(schedule.frequency);

      if (!cronExpression) {
        throw new Error(`Invalid frequency: ${schedule.frequency}`);
      }

      // Create cron job
      const job = schedule.schedule(cronExpression, async () => {
        await this.executeScheduledAssessment(schedule);
      });

      // Store the job reference
      this.scheduledJobs.set(scheduleId, job);

      logger.info(`Activated schedule ${scheduleId} with frequency: ${schedule.frequency}`);

    } catch (error) {
      logger.error(`Error activating schedule ${schedule.id}:`, error);
      throw error;
    }
  }

  /**
   * Deactivate a schedule by cancelling the cron job
   */
  async deactivateSchedule(scheduleId) {
    try {
      const job = this.scheduledJobs.get(scheduleId);
      if (job) {
        job.cancel();
        this.scheduledJobs.delete(scheduleId);
        logger.info(`Deactivated schedule ${scheduleId}`);
      }
    } catch (error) {
      logger.error(`Error deactivating schedule ${scheduleId}:`, error);
      throw error;
    }
  }

  /**
   * Execute a scheduled assessment
   */
  async executeScheduledAssessment(schedule) {
    try {
      logger.info(`Executing scheduled ${schedule.schedule_kind || 'compliance'} job for schedule ${schedule.id}`);

      // Get organization credentials
      const organization = await Organization.findByPk(schedule.organization_id);
      if (!organization || !organization.is_active) {
        logger.warn(`Organization ${schedule.organization_id} not found or inactive, skipping assessment`);
        return;
      }

      if (schedule.schedule_kind === 'external_exposure') {
        return await this.executeScheduledReconScan(schedule);
      }

      const credentials = organization.credentials;
      if (!credentials || !credentials.clientId || !credentials.clientSecret) {
        logger.warn(`Organization ${schedule.organization_id} missing credentials, skipping assessment`);
        return;
      }

      // Create assessment name with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const assessmentName = `${schedule.name} - ${timestamp}`;

      // Queue the assessment
      const job = await this.complianceQueue.add('run-assessment', {
        organizationId: schedule.organization_id,
        credentials: {
          tenantId: credentials.tenantId || organization.tenant_id,
          clientId: credentials.clientId,
          clientSecret: credentials.clientSecret
        },
        assessmentType: schedule.assessment_type,
        options: {
          name: assessmentName,
          description: `Scheduled assessment from: ${schedule.name}`,
          isScheduled: true,
          parentScheduleId: schedule.id,
          priority: 5 // Higher priority for scheduled assessments
        }
      }, {
        priority: 5,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 10000
        }
      });

      // Update schedule last run time and next run time
      const nextRunAt = this.calculateNextRun(schedule.frequency);
      await schedule.update({
        last_run_at: new Date(),
        next_run_at: nextRunAt
      });

      logger.info(`Queued scheduled assessment ${job.id} for organization ${schedule.organization_id}`);

    } catch (error) {
      logger.error(`Error executing scheduled assessment for schedule ${schedule.id}:`, error);
      
      // Update schedule with error information (optional)
      try {
        await schedule.update({
          last_run_at: new Date(),
          next_run_at: this.calculateNextRun(schedule.frequency)
        });
      } catch (updateError) {
        logger.error('Error updating schedule after failed execution:', updateError);
      }
    }
  }

  /**
   * Execute a scheduled external exposure scan.
   *
   * Authorization is re-checked here, not just when the schedule was created:
   * an authorization expires or is revoked on its own timetable, and a schedule
   * must never keep sending traffic on the strength of permission that has
   * since lapsed. A refused scan deactivates the schedule rather than retrying
   * it nightly against a scope we no longer have.
   */
  async executeScheduledReconScan(schedule) {
    const { organization_id: organizationId, seed_domain: seedDomain, recon_profile: profile } = schedule;

    try {
      await authorizeScan({ organizationId, seedDomain, profile });
    } catch (error) {
      if (error instanceof AuthorizationError) {
        logger.warn(
          `Schedule ${schedule.id} refused: ${seedDomain} is no longer authorized at the '${profile}' `
          + `profile. Deactivating the schedule. ${error.message}`
        );
        await schedule.update({
          is_active: false,
          last_run_at: new Date(),
          parameters: {
            ...(schedule.parameters || {}),
            deactivatedReason: error.message,
            deactivatedAt: new Date().toISOString()
          }
        });
        await this.deactivateSchedule(schedule.id);
        return;
      }
      throw error;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    const job = await this.reconQueue.add('run-recon-scan', {
      organizationId,
      seedDomain,
      profile,
      options: {
        name: `${schedule.name} - ${timestamp}`,
        description: `Scheduled external exposure scan from: ${schedule.name}`,
        isScheduled: true,
        parentScheduleId: schedule.id,
        seedUser: schedule.parameters?.seedUser || undefined
      }
    }, {
      priority: 5,
      // Matches the manual path: a scan sends real traffic to third parties, so
      // a failure surfaces rather than silently doubling that traffic.
      attempts: 1
    });

    await schedule.update({
      last_run_at: new Date(),
      next_run_at: this.calculateNextRun(schedule.frequency)
    });

    logger.info(`Queued scheduled recon scan ${job.id} for ${seedDomain} (${profile})`);
  }

  /**
   * Convert frequency to cron expression
   */
  frequencyToCron(frequency) {
    switch (frequency) {
      case 'daily':
        return '0 2 * * *'; // 2 AM daily
      case 'weekly':
        return '0 2 * * 0'; // 2 AM on Sundays
      case 'monthly':
        return '0 2 1 * *'; // 2 AM on 1st of each month
      case 'quarterly':
        return '0 2 1 */3 *'; // 2 AM on 1st of every 3rd month
      default:
        return null;
    }
  }

  /**
   * Calculate next run time based on frequency
   */
  calculateNextRun(frequency) {
    const now = new Date();
    
    switch (frequency) {
      case 'daily':
        const daily = new Date(now);
        daily.setDate(daily.getDate() + 1);
        daily.setHours(2, 0, 0, 0); // 2 AM
        return daily;
        
      case 'weekly':
        const weekly = new Date(now);
        const daysUntilSunday = 7 - weekly.getDay();
        weekly.setDate(weekly.getDate() + daysUntilSunday);
        weekly.setHours(2, 0, 0, 0); // 2 AM on Sunday
        return weekly;
        
      case 'monthly':
        const monthly = new Date(now);
        monthly.setMonth(monthly.getMonth() + 1);
        monthly.setDate(1);
        monthly.setHours(2, 0, 0, 0); // 2 AM on 1st of month
        return monthly;
        
      case 'quarterly':
        const quarterly = new Date(now);
        quarterly.setMonth(quarterly.getMonth() + 3);
        quarterly.setDate(1);
        quarterly.setHours(2, 0, 0, 0); // 2 AM on 1st of quarter
        return quarterly;
        
      default:
        // Default to daily if unknown frequency
        const defaultDaily = new Date(now);
        defaultDaily.setDate(defaultDaily.getDate() + 1);
        defaultDaily.setHours(2, 0, 0, 0);
        return defaultDaily;
    }
  }

  /**
   * Set up periodic check for missed schedules (backup mechanism)
   */
  setupPeriodicCheck() {
    // Check every hour for any schedules that should have run
    schedule.scheduleJob('0 * * * *', async () => {
      try {
        const overdueSchedules = await ComplianceSchedule.findAll({
          where: {
            is_active: true,
            next_run_at: {
              [require('sequelize').Op.lt]: new Date()
            }
          },
          include: [{
            model: Organization,
            as: 'organization',
            where: { is_active: true }
          }]
        });

        if (overdueSchedules.length > 0) {
          logger.info(`Found ${overdueSchedules.length} overdue schedules, executing now`);
          
          for (const overdueSchedule of overdueSchedules) {
            await this.executeScheduledAssessment(overdueSchedule);
          }
        }
      } catch (error) {
        logger.error('Error in periodic schedule check:', error);
      }
    });

    logger.info('Periodic schedule check activated (runs hourly)');
  }

  /**
   * Get schedule statistics
   */
  async getScheduleStats() {
    try {
      const totalSchedules = await ComplianceSchedule.count();
      const activeSchedules = await ComplianceSchedule.count({ where: { is_active: true } });
      const schedulesWithUpcomingRuns = await ComplianceSchedule.count({
        where: {
          is_active: true,
          next_run_at: {
            [require('sequelize').Op.gt]: new Date()
          }
        }
      });

      const reconSchedules = await ComplianceSchedule.count({
        where: { schedule_kind: 'external_exposure', is_active: true }
      });

      return {
        total: totalSchedules,
        active: activeSchedules,
        upcoming: schedulesWithUpcomingRuns,
        activeByKind: {
          compliance: activeSchedules - reconSchedules,
          externalExposure: reconSchedules
        },
        jobsInMemory: this.scheduledJobs.size
      };
    } catch (error) {
      logger.error('Error getting schedule statistics:', error);
      return {
        total: 0,
        active: 0,
        upcoming: 0,
        jobsInMemory: this.scheduledJobs.size
      };
    }
  }

  /**
   * Shutdown the scheduler
   */
  async shutdown() {
    try {
      // Cancel all scheduled jobs
      for (const [scheduleId, job] of this.scheduledJobs) {
        job.cancel();
      }
      this.scheduledJobs.clear();

      // Gracefully close the queues
      if (this.complianceQueue) {
        await this.complianceQueue.close();
      }
      if (this.reconQueue) {
        await this.reconQueue.close();
      }

      logger.info('Compliance scheduler shutdown complete');
    } catch (error) {
      logger.error('Error during scheduler shutdown:', error);
      throw error;
    }
  }
}

module.exports = new ComplianceScheduler();