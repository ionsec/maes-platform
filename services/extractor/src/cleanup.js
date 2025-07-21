const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { logger } = require('./logger');

const router = express.Router();

// Middleware to validate service token
const validateServiceToken = (req, res, next) => {
  const serviceToken = req.headers['x-service-token'];
  const expectedToken = process.env.SERVICE_AUTH_TOKEN;
  
  if (!serviceToken || serviceToken !== expectedToken) {
    return res.status(401).json({ error: 'Invalid service token' });
  }
  
  next();
};

// Organization cleanup endpoint
router.delete('/organization/:organizationId', validateServiceToken, async (req, res) => {
  try {
    const { organizationId } = req.params;
    
    logger.info(`Starting organization data cleanup for: ${organizationId}`);
    
    // Sanitize organization ID to match directory structure
    const safeOrgId = organizationId.replace(/[^a-zA-Z0-9-]/g, '');
    
    // Define organization output directory
    const OUTPUT_PATH = '/output';
    const orgOutputPath = path.join(OUTPUT_PATH, 'orgs', safeOrgId);
    
    let cleanupStats = {
      directoriesRemoved: 0,
      filesRemoved: 0,
      bytesFreed: 0,
      errors: []
    };
    
    // Check if organization directory exists
    try {
      const stats = await fs.stat(orgOutputPath);
      if (stats.isDirectory()) {
        // Get directory size before deletion
        const size = await getDirectorySize(orgOutputPath);
        cleanupStats.bytesFreed = size;
        
        // Recursively remove all files and subdirectories
        await fs.rm(orgOutputPath, { recursive: true, force: true });
        cleanupStats.directoriesRemoved = 1;
        
        logger.info(`Removed organization directory: ${orgOutputPath}`);
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.info(`Organization directory does not exist: ${orgOutputPath}`);
      } else {
        logger.error(`Error removing organization directory ${orgOutputPath}:`, error);
        cleanupStats.errors.push(`Failed to remove directory: ${error.message}`);
      }
    }
    
    // Also clean up any extraction files that might be in the root output directory
    try {
      const rootFiles = await fs.readdir(OUTPUT_PATH);
      for (const file of rootFiles) {
        if (file.includes(organizationId) || file.includes(safeOrgId)) {
          const filePath = path.join(OUTPUT_PATH, file);
          try {
            const stats = await fs.stat(filePath);
            if (stats.isFile()) {
              await fs.unlink(filePath);
              cleanupStats.filesRemoved++;
              cleanupStats.bytesFreed += stats.size;
              logger.info(`Removed organization file: ${filePath}`);
            }
          } catch (fileError) {
            logger.error(`Error removing file ${filePath}:`, fileError);
            cleanupStats.errors.push(`Failed to remove file ${file}: ${fileError.message}`);
          }
        }
      }
    } catch (error) {
      logger.error('Error scanning root output directory:', error);
      cleanupStats.errors.push(`Failed to scan root directory: ${error.message}`);
    }
    
    logger.info(`Organization cleanup completed for ${organizationId}:`, cleanupStats);
    
    res.json({
      success: true,
      message: 'Organization data cleanup completed',
      organizationId,
      stats: cleanupStats
    });
    
  } catch (error) {
    logger.error('Organization cleanup failed:', error);
    res.status(500).json({
      success: false,
      error: 'Cleanup failed',
      message: error.message
    });
  }
});

// Helper function to calculate directory size
async function getDirectorySize(dirPath) {
  let totalSize = 0;
  
  try {
    const items = await fs.readdir(dirPath);
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      const stats = await fs.stat(itemPath);
      
      if (stats.isFile()) {
        totalSize += stats.size;
      } else if (stats.isDirectory()) {
        totalSize += await getDirectorySize(itemPath);
      }
    }
  } catch (error) {
    logger.error(`Error calculating directory size for ${dirPath}:`, error);
  }
  
  return totalSize;
}

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    service: 'extractor-cleanup',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;