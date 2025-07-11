const { Pool } = require('pg');
const { logger } = require('../logger');

// Create connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Helper function to execute a query
async function execute(query, params = []) {
  try {
    const result = await pool.query(query, params);
    return result;
  } catch (error) {
    logger.error('Database execute error:', { query, params, error: error.message });
    throw error;
  }
}

// Helper function to get a single row
async function getRow(query, params = []) {
  try {
    const result = await pool.query(query, params);
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Database getRow error:', { query, params, error: error.message });
    throw error;
  }
}

// Helper function to get multiple rows
async function getRows(query, params = []) {
  try {
    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    logger.error('Database getRows error:', { query, params, error: error.message });
    throw error;
  }
}

// Helper function to get count
async function count(query, params = []) {
  try {
    const result = await pool.query(query, params);
    return parseInt(result.rows[0]?.count || 0);
  } catch (error) {
    logger.error('Database count error:', { query, params, error: error.message });
    throw error;
  }
}

// Health check function
async function healthCheck() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (error) {
    logger.error('Database health check failed:', error);
    return false;
  }
}

// Graceful shutdown
async function close() {
  try {
    await pool.end();
    logger.info('Database connection pool closed');
  } catch (error) {
    logger.error('Error closing database pool:', error);
  }
}

module.exports = {
  pool,
  execute,
  getRow,
  getRows,
  count,
  healthCheck,
  close
};