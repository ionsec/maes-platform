const { Pool } = require('pg');
const { logger } = require('../utils/logger');

// Create connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test database connection
pool.on('connect', () => {
  logger.info('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Helper function to execute queries
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    logger.error('Database query error:', error);
    throw error;
  }
};

// Helper function to get a single row
const getRow = async (text, params) => {
  const result = await query(text, params);
  return result.rows[0] || null;
};

// Helper function to get multiple rows
const getRows = async (text, params) => {
  const result = await query(text, params);
  return result.rows;
};

// Helper function to insert and return the inserted row
const insert = async (text, params) => {
  const result = await query(text, params);
  return result.rows[0];
};

// Helper function to update and return the updated row
const update = async (text, params) => {
  const result = await query(text, params);
  return result.rows[0];
};

// Helper function to delete and return the deleted row
const remove = async (text, params) => {
  const result = await query(text, params);
  return result.rows[0];
};

// Helper function to count rows
const count = async (text, params) => {
  const result = await query(text, params);
  return parseInt(result.rows[0].count);
};

// Close the pool
const close = async () => {
  await pool.end();
};

module.exports = {
  query,
  getRow,
  getRows,
  insert,
  update,
  remove,
  count,
  close,
  pool
}; 