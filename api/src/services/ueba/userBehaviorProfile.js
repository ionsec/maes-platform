const { pool } = require('../database');
const { logger } = require('../../utils/logger');

/**
 * UEBA - User Entity Behavior Analytics
 * Creates behavioral baselines and detects anomalies for users
 */

class UserBehaviorProfile {
  /**
   * Get or create behavior baseline for a user
   */
  static async getBaseline(userId, organizationId) {
    try {
      const result = await pool.query(
        `SELECT * FROM maes.ueba_baselines 
         WHERE user_id = $1 AND organization_id = $2 AND is_active = true
         ORDER BY updated_at DESC LIMIT 1`,
        [userId, organizationId]
      );

      if (result.rows.length > 0) {
        return result.rows[0];
      }

      return await this.createBaseline(userId, organizationId);
    } catch (error) {
      logger.error('Error getting UEBA baseline:', error);
      throw error;
    }
  }

  /**
   * Create initial behavior baseline for a user
   */
  static async createBaseline(userId, organizationId) {
    try {
      const analysisResult = await pool.query(
        `SELECT 
          COUNT(*) as total_events,
          COUNT(DISTINCT DATE(created_at)) as active_days,
          COUNT(DISTINCT ip_address) as unique_ips,
          COUNT(DISTINCT user_agent) as unique_agents,
          COUNT(DISTINCT location_country) as unique_countries,
          MODE() WITHIN GROUP (ORDER BY EXTRACT(HOUR FROM created_at)) as peak_hour,
          MODE() WITHIN GROUP (ORDER BY location_country) as primary_country,
          MODE() WITHIN GROUP (ORDER BY device_id) as primary_device
         FROM maes.audit_logs
         WHERE user_id = $1 
           AND organization_id = $2
           AND created_at > NOW() - INTERVAL '30 days'
           AND is_success = true`,
        [userId, organizationId]
      );

      const stats = analysisResult.rows[0] || {};

      const baseline = {
        login_frequency: stats.active_days ? stats.total_events / stats.active_days : 0,
        unique_ips: parseInt(stats.unique_ips) || 0,
        unique_devices: parseInt(stats.unique_agents) || 0,
        primary_country: stats.primary_country || 'Unknown',
        unique_countries: parseInt(stats.unique_countries) || 0,
        peak_activity_hour: parseInt(stats.peak_hour) || 9,
        common_operations: await this.getCommonOperations(userId, organizationId),
        risk_score: 0,
        confidence_level: this.calculateConfidence(stats)
      };

      const insertResult = await pool.query(
        `INSERT INTO maes.ueba_baselines 
         (user_id, organization_id, baseline_data, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, true, NOW(), NOW())
         RETURNING *`,
        [userId, organizationId, JSON.stringify(baseline)]
      );

      logger.info(`Created UEBA baseline for user ${userId}`, { confidence: baseline.confidence_level });
      return insertResult.rows[0];
    } catch (error) {
      logger.error('Error creating UEBA baseline:', error);
      throw error;
    }
  }

  static async getCommonOperations(userId, organizationId) {
    const result = await pool.query(
      `SELECT operation, COUNT(*) as count
       FROM maes.audit_logs
       WHERE user_id = $1 AND organization_id = $2
         AND created_at > NOW() - INTERVAL '30 days'
       GROUP BY operation
       ORDER BY count DESC
       LIMIT 10`,
      [userId, organizationId]
    );
    return result.rows.map(r => r.operation);
  }

  static calculateConfidence(stats) {
    let score = 0;
    if (stats.total_events > 100) score += 30;
    else if (stats.total_events > 50) score += 20;
    else if (stats.total_events > 10) score += 10;

    if (stats.active_days > 20) score += 40;
    else if (stats.active_days > 10) score += 25;
    else if (stats.active_days > 5) score += 10;

    return Math.min(score, 100);
  }

  /**
   * Detect anomalies in user activity
   */
  static async detectAnomalies(userId, organizationId, newActivity) {
    const baseline = await this.getBaseline(userId, organizationId);
    const anomalies = [];
    const baselineData = baseline.baseline_data;

    // Geographic anomaly
    if (newActivity.country && newActivity.country !== baselineData.primary_country) {
      const knownCountries = await this.getUserCountries(userId, organizationId);
      if (!knownCountries.includes(newActivity.country)) {
        anomalies.push({
          type: 'geographic_anomaly',
          severity: 'high',
          description: `Login from new country: ${newActivity.country}`,
          baseline_value: baselineData.primary_country,
          observed_value: newActivity.country,
          risk_score: 30
        });
      }
    }

    // Time anomaly
    const activityHour = new Date(newActivity.timestamp).getHours();
    const peakHour = baselineData.peak_activity_hour || 9;
    const hourDiff = Math.abs(activityHour - peakHour);
    
    if (hourDiff > 8) {
      anomalies.push({
        type: 'temporal_anomaly',
        severity: 'medium',
        description: `Activity at unusual hour (${activityHour}:00)`,
        baseline_value: `${peakHour}:00 (peak hour)`,
        observed_value: `${activityHour}:00`,
        risk_score: 20
      });
    }

    // Operation anomaly - sensitive operations
    if (newActivity.operation && baselineData.common_operations) {
      if (!baselineData.common_operations.includes(newActivity.operation)) {
        const sensitiveOperations = [
          'Add member to role',
          'Reset user password',
          'Delete user',
          'Grant admin consent',
          'Modify conditional access policy'
        ];

        if (sensitiveOperations.some(op => newActivity.operation.includes(op))) {
          anomalies.push({
            type: 'operation_anomaly',
            severity: 'high',
            description: `Unusual sensitive operation: ${newActivity.operation}`,
            risk_score: 35
          });
        }
      }
    }

    const totalRiskScore = anomalies.reduce((sum, a) => sum + a.risk_score, 0);
    
    return {
      anomalies,
      total_risk_score: totalRiskScore,
      baseline_confidence: baselineData.confidence_level,
      recommendation: this.getRecommendation(totalRiskScore)
    };
  }

  static async getUserCountries(userId, organizationId, days = 90) {
    const result = await pool.query(
      `SELECT DISTINCT location_country
       FROM maes.audit_logs
       WHERE user_id = $1 AND organization_id = $2
         AND created_at > NOW() - INTERVAL '1 day' * $3
         AND location_country IS NOT NULL`,
      [userId, organizationId, days]
    );
    return result.rows.map(r => r.location_country);
  }

  /**
   * Update baseline with new activity data
   * @param {string} baselineId - baseline row id
   * @param {object} activity - observed activity
   * @param {object} [anomalyResult] - result from detectAnomalies, used to persist risk
   */
  static async updateBaseline(baselineId, activity, anomalyResult) {
    try {
      const currentResult = await pool.query(
        `SELECT user_id, organization_id, baseline_data FROM maes.ueba_baselines WHERE id = $1`,
        [baselineId]
      );

      if (currentResult.rows.length === 0) {
        return null;
      }

      const row = currentResult.rows[0];
      const baselineData = row.baseline_data;
      const updated = { ...baselineData };

      // Update IP tracking
      if (activity.ip_address) {
        const currentIps = updated.unique_ips || 0;
        updated.unique_ips = currentIps + 1;
      }

      // Update device tracking
      if (activity.user_agent) {
        const currentAgents = updated.unique_devices || 0;
        updated.unique_devices = currentAgents + 1;
      }

      // Apply the anomaly risk detected for this activity. When anomalies are
      // present the score reflects them (capped at 100); otherwise risk decays
      // back toward zero as behavior returns to baseline.
      if (anomalyResult && anomalyResult.total_risk_score > 0) {
        updated.risk_score = Math.min(100, anomalyResult.total_risk_score);
      } else if (updated.risk_score > 0) {
        updated.risk_score = Math.max(0, updated.risk_score - 1);
      }

      await pool.query(
        `UPDATE maes.ueba_baselines SET baseline_data = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(updated), baselineId]
      );

      // Snapshot the resulting risk into history so the UI can chart trends.
      if (anomalyResult) {
        await this.recordRiskHistory(
          row.user_id,
          row.organization_id,
          updated.risk_score || 0,
          updated.confidence_level || 0,
          anomalyResult.anomalies || []
        );
      }

      return updated;
    } catch (error) {
      logger.error('Error updating baseline:', error);
      throw error;
    }
  }

  /**
   * Record a risk score snapshot for trend charting
   */
  static async recordRiskHistory(userId, organizationId, riskScore, confidenceLevel, anomalies) {
    try {
      await pool.query(
        `INSERT INTO maes.ueba_risk_history
           (user_id, organization_id, risk_score, confidence_level, anomaly_count, recorded_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [userId, organizationId, riskScore, confidenceLevel, anomalies.length]
      );
    } catch (error) {
      logger.error('Error recording UEBA risk history:', error);
      throw error;
    }
  }

  /**
   * Get risk score history for a user (for trend charts)
   */
  static async getRiskHistory(userId, organizationId, limit = 30) {
    try {
      const result = await pool.query(
        `SELECT risk_score, confidence_level, anomaly_count, recorded_at
         FROM maes.ueba_risk_history
         WHERE user_id = $1 AND organization_id = $2
         ORDER BY recorded_at ASC
         LIMIT $3`,
        [userId, organizationId, limit]
      );
      return result.rows;
    } catch (error) {
      logger.error('Error getting UEBA risk history:', error);
      throw error;
    }
  }

  static getRecommendation(riskScore) {
    if (riskScore >= 70) {
      return { action: 'block_and_investigate', message: 'High risk activity detected.' };
    } else if (riskScore >= 40) {
      return { action: 'require_mfa', message: 'Elevated risk. Require additional authentication.' };
    } else if (riskScore >= 20) {
      return { action: 'monitor', message: 'Minor anomalies detected.' };
    }
    return { action: 'allow', message: 'Activity within normal parameters.' };
  }
}

module.exports = UserBehaviorProfile;
