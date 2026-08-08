const { logger } = require('../utils/logger');

/**
 * Real-time notification for newly created alerts.
 *
 * Alerts reach the database by three different routes — the analyzer POSTs to
 * /api/alerts, UEBA inserts directly, and the compliance service's external
 * exposure scans insert from another container — so the emit lives here rather
 * than in any one of them. Without it the frontend only learns about a new
 * alert on its next poll, which for a critical exposure is the wrong latency.
 *
 * Rooms follow the convention established in api/src/index.js: clients join
 * `org-<organizationId>` on connect.
 */

const EVENT = 'alert.created';

/**
 * @param {Object} io - socket.io server, or null when unavailable
 * @param {string} organizationId
 * @param {Object} alert - the created alert row
 */
function emitAlertCreated(io, organizationId, alert) {
  if (!io || !organizationId || !alert) return false;

  try {
    io.to(`org-${organizationId}`).emit(EVENT, {
      id: alert.id,
      severity: alert.severity,
      type: alert.type,
      category: alert.category,
      title: alert.title,
      status: alert.status,
      createdAt: alert.created_at || alert.createdAt || new Date().toISOString()
    });
    return true;
  } catch (error) {
    // A notification failure must never propagate into the write path that
    // already succeeded — the alert is stored either way.
    logger.error('Failed to emit alert.created:', error);
    return false;
  }
}

/** Emit for several alerts at once. Returns how many were delivered. */
function emitAlertsCreated(io, organizationId, alerts = []) {
  return alerts.reduce(
    (delivered, alert) => delivered + (emitAlertCreated(io, organizationId, alert) ? 1 : 0),
    0
  );
}

module.exports = { emitAlertCreated, emitAlertsCreated, ALERT_CREATED_EVENT: EVENT };
