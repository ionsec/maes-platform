const UserBehaviorProfile = require('./userBehaviorProfile');
const { logger } = require('../../utils/logger');

class UebaService {
  /**
   * Process activity and check for anomalies
   */
  static async processActivity(activity) {
    try {
      const { user_id, organization_id, ...activityData } = activity;
      
      if (!user_id || !organization_id) {
        throw new Error('user_id and organization_id are required');
      }

      // Detect anomalies
      const anomalyResult = await UserBehaviorProfile.detectAnomalies(
        user_id,
        organization_id,
        activityData
      );

      // Update baseline if activity is successful
      if (activityData.is_success !== false) {
        await this.updateBaseline(user_id, organization_id, activityData);
      }

      return anomalyResult;
    } catch (error) {
      logger.error('UEBA processing error:', error);
      throw error;
    }
  }

  /**
   * Update user baseline with new activity
   */
  static async updateBaseline(userId, organizationId, activity) {
    try {
      const baseline = await UserBehaviorProfile.getBaseline(userId, organizationId);
      if (baseline) {
        await UserBehaviorProfile.updateBaseline(baseline.id, activity);
      }
    } catch (error) {
      logger.warn('Failed to update baseline:', error);
    }
  }

  /**
   * Get risk assessment for user
   */
  static async getUserRiskScore(userId, organizationId) {
    try {
      const baseline = await UserBehaviorProfile.getBaseline(userId, organizationId);
      if (!baseline) {
        return { risk_score: 0, confidence: 0, message: 'No baseline available' };
      }

      const baselineData = baseline.baseline_data;
      return {
        risk_score: baselineData.risk_score || 0,
        confidence: baselineData.confidence_level,
        primary_country: baselineData.primary_country,
        unique_ips: baselineData.unique_ips,
        unique_countries: baselineData.unique_countries
      };
    } catch (error) {
      logger.error('Error getting user risk score:', error);
      throw error;
    }
  }

  /**
   * Batch process activities for baseline creation
   */
  static async batchProcessActivities(activities) {
    const results = {
      processed: 0,
      anomalies_detected: 0,
      baselines_created: 0,
      errors: []
    };

    for (const activity of activities) {
      try {
        const result = await this.processActivity(activity);
        results.processed++;
        
        if (result.anomalies && result.anomalies.length > 0) {
          results.anomalies_detected += result.anomalies.length;
        }
        
        if (result.baseline_created) {
          results.baselines_created++;
        }
      } catch (error) {
        results.errors.push({ activity, error: error.message });
      }
    }

    return results;
  }
}

module.exports = UebaService;
