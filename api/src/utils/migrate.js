const fs = require('fs').promises;
const path = require('path');
const { query, getRow, getRows } = require('../services/database');
const { logger } = require('./logger');

class MigrationManager {
  constructor() {
    this.migrationsPath = path.join(__dirname, '../../..', 'migrations');
  }

  async initialize() {
    // Ensure migrations table exists
    await this.createMigrationsTable();
  }

  async createMigrationsTable() {
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS maes.migrations (
          id SERIAL PRIMARY KEY,
          filename VARCHAR(255) UNIQUE NOT NULL,
          applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);
      logger.info('Migrations table ensured');
    } catch (error) {
      logger.error('Failed to create migrations table:', error);
      throw error;
    }
  }

  async getAppliedMigrations() {
    try {
      const result = await getRows('SELECT filename FROM maes.migrations ORDER BY filename');
      return result.map(row => row.filename);
    } catch (error) {
      logger.error('Failed to get applied migrations:', error);
      return [];
    }
  }

  async getMigrationFiles() {
    try {
      const files = await fs.readdir(this.migrationsPath);
      return files
        .filter(file => file.endsWith('.sql'))
        .sort(); // Ensure consistent ordering
    } catch (error) {
      logger.error('Failed to read migrations directory:', error);
      return [];
    }
  }

  async runMigration(filename) {
    const filePath = path.join(this.migrationsPath, filename);
    
    try {
      logger.info(`Running migration: ${filename}`);
      
      // Read the migration file
      const migrationSQL = await fs.readFile(filePath, 'utf8');
      
      // Execute the migration in a transaction
      await query('BEGIN');
      
      try {
        // Split by semicolon and execute each statement
        const statements = migrationSQL
          .split(';')
          .map(stmt => stmt.trim())
          .filter(stmt => stmt.length > 0);
        
        for (const statement of statements) {
          if (statement.trim()) {
            await query(statement);
          }
        }
        
        // Record the migration as applied
        await query(
          'INSERT INTO maes.migrations (filename) VALUES ($1)',
          [filename]
        );
        
        await query('COMMIT');
        logger.info(`Migration completed successfully: ${filename}`);
        
      } catch (error) {
        await query('ROLLBACK');
        throw error;
      }
      
    } catch (error) {
      logger.error(`Migration failed: ${filename}`, error);
      throw error;
    }
  }

  async runPendingMigrations() {
    try {
      await this.initialize();
      
      const appliedMigrations = await this.getAppliedMigrations();
      const migrationFiles = await this.getMigrationFiles();
      
      const pendingMigrations = migrationFiles.filter(
        file => !appliedMigrations.includes(file)
      );
      
      if (pendingMigrations.length === 0) {
        logger.info('No pending migrations');
        return;
      }
      
      logger.info(`Found ${pendingMigrations.length} pending migrations:`, pendingMigrations);
      
      for (const migration of pendingMigrations) {
        await this.runMigration(migration);
      }
      
      logger.info('All pending migrations completed successfully');
      
    } catch (error) {
      logger.error('Migration process failed:', error);
      throw error;
    }
  }

  // Check if a specific migration has been applied
  async isMigrationApplied(filename) {
    try {
      const result = await getRow(
        'SELECT 1 FROM maes.migrations WHERE filename = $1',
        [filename]
      );
      return !!result;
    } catch (error) {
      logger.error(`Failed to check migration status for ${filename}:`, error);
      return false;
    }
  }

  // Get migration status
  async getStatus() {
    try {
      const appliedMigrations = await this.getAppliedMigrations();
      const migrationFiles = await this.getMigrationFiles();
      
      const pendingMigrations = migrationFiles.filter(
        file => !appliedMigrations.includes(file)
      );
      
      return {
        total: migrationFiles.length,
        applied: appliedMigrations.length,
        pending: pendingMigrations.length,
        appliedMigrations,
        pendingMigrations
      };
    } catch (error) {
      logger.error('Failed to get migration status:', error);
      throw error;
    }
  }
}

// CLI interface
async function main() {
  const command = process.argv[2] || 'run';
  const migrationManager = new MigrationManager();
  
  try {
    switch (command) {
      case 'run':
        await migrationManager.runPendingMigrations();
        break;
        
      case 'status':
        const status = await migrationManager.getStatus();
        console.log('Migration Status:');
        console.log(`  Total migrations: ${status.total}`);
        console.log(`  Applied: ${status.applied}`);
        console.log(`  Pending: ${status.pending}`);
        if (status.pendingMigrations.length > 0) {
          console.log('  Pending migrations:', status.pendingMigrations.join(', '));
        }
        break;
        
      default:
        console.log('Usage: node migrate.js [run|status]');
        console.log('  run    - Run all pending migrations (default)');
        console.log('  status - Show migration status');
        process.exit(1);
    }
    
    process.exit(0);
  } catch (error) {
    logger.error('Migration command failed:', error);
    process.exit(1);
  }
}

// Export for use in other modules
module.exports = MigrationManager;

// Run if called directly
if (require.main === module) {
  main();
}