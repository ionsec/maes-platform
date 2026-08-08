const jwt = require('jsonwebtoken');
const { pool } = require('./database');
const { logger } = require('../utils/logger');

/**
 * Authentication and room authorization for Socket.IO.
 *
 * The socket server previously accepted any connection and let the client name
 * the organization room it wished to join. Because the rooms carry alerts and
 * job events, that allowed an unauthenticated client to receive another
 * tenant's security data by guessing an organization id — a cross-tenant leak
 * in a platform whose whole premise is per-organization isolation.
 *
 * Connections now present the same JWT the REST API requires, and room
 * membership is decided from the database rather than from the client.
 */

/**
 * Handshake middleware. Rejects the connection when no valid token is present.
 *
 * The token is read from `socket.handshake.auth.token` (the socket.io client's
 * `auth` option) and falls back to the Authorization header for clients that
 * set it on the underlying request.
 */
async function authenticateSocket(socket, next) {
  try {
    const authToken = socket.handshake.auth?.token
      || (socket.handshake.headers?.authorization || '').split(' ')[1];

    if (!authToken) {
      return next(new Error('Authentication required'));
    }

    let decoded;
    try {
      decoded = jwt.verify(authToken, process.env.JWT_SECRET);
    } catch (err) {
      return next(new Error('Invalid or expired token'));
    }

    const userResult = await pool.query(
      `SELECT u.id, u.role, u.organization_id, o.is_active AS org_active
         FROM maes.users u
         LEFT JOIN maes.organizations o ON u.organization_id = o.id
        WHERE u.id = $1 AND u.is_active = true`,
      [decoded.userId]
    );

    const user = userResult.rows[0];
    if (!user) {
      return next(new Error('User not found or inactive'));
    }
    if (user.organization_id && user.org_active === false) {
      return next(new Error('Organization is inactive'));
    }

    socket.data.user = { id: user.id, role: user.role, organizationId: user.organization_id };
    return next();

  } catch (error) {
    logger.error('Socket authentication error:', error);
    return next(new Error('Authentication failed'));
  }
}

/**
 * May this user receive events for this organization?
 *
 * Mirrors the REST rule: administrators may cross organizations, everyone else
 * needs their home organization or an explicit membership row.
 */
async function canAccessOrganization(user, organizationId) {
  if (!user || !organizationId) return false;
  if (user.role === 'admin' || user.role === 'super_admin') return true;
  if (user.organizationId === organizationId) return true;

  const result = await pool.query(
    'SELECT 1 FROM maes.user_organizations WHERE user_id = $1 AND organization_id = $2',
    [user.id, organizationId]
  );
  return result.rows.length > 0;
}

/**
 * Wire authenticated connection handling onto a Socket.IO server.
 * @param {Server} io
 */
function registerSocketHandlers(io) {
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    const user = socket.data.user;
    logger.info(`Client connected: ${socket.id} (user ${user.id})`);

    socket.on('disconnect', () => {
      logger.info(`Client disconnected: ${socket.id}`);
    });

    socket.on('join-organization', async (organizationId, ack) => {
      try {
        if (!(await canAccessOrganization(user, organizationId))) {
          logger.warn(
            `User ${user.id} denied socket access to organization ${organizationId}`
          );
          if (typeof ack === 'function') ack({ success: false, error: 'Access denied' });
          return;
        }

        socket.join(`org-${organizationId}`);
        logger.info(`Client ${socket.id} joined organization ${organizationId}`);
        if (typeof ack === 'function') ack({ success: true });

      } catch (error) {
        logger.error('join-organization error:', error);
        if (typeof ack === 'function') ack({ success: false, error: 'Internal error' });
      }
    });

    socket.on('leave-organization', (organizationId, ack) => {
      socket.leave(`org-${organizationId}`);
      logger.info(`Client ${socket.id} left organization ${organizationId}`);
      if (typeof ack === 'function') ack({ success: true });
    });
  });
}

module.exports = { authenticateSocket, canAccessOrganization, registerSocketHandlers };
