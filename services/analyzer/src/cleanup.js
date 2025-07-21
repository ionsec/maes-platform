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
    
    let cleanupStats = {
      directoriesRemoved: 0,
      filesRemoved: 0,
      bytesFreed: 0,
      analysisResultsRemoved: 0,
      errors: []
    };
    
    // Clean up any organization-specific analysis results in various directories
    const searchPaths = [
      '/app/analysis_results',
      '/app/output',
      '/tmp/analysis',
      '/var/analyzer'
    ];
    
    for (const searchPath of searchPaths) {
      try {
        await cleanupOrganizationFiles(searchPath, organizationId, cleanupStats);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          logger.error(`Error cleaning up path ${searchPath}:`, error);
          cleanupStats.errors.push(`Failed to clean path ${searchPath}: ${error.message}`);
        }
      }
    }
    
    // Clean up any temporary files that might contain organization data
    try {
      await cleanupTempFiles(organizationId, cleanupStats);
    } catch (error) {
      logger.error('Error cleaning up temporary files:', error);
      cleanupStats.errors.push(`Failed to clean temp files: ${error.message}`);
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

// Helper function to clean organization files from a directory
async function cleanupOrganizationFiles(dirPath, organizationId, stats) {
  try {
    const exists = await fs.access(dirPath).then(() => true).catch(() => false);
    if (!exists) return;
    
    const items = await fs.readdir(dirPath);
    
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      
      // Check if item contains organization ID
      if (item.includes(organizationId)) {
        try {
          const itemStats = await fs.stat(itemPath);
          
          if (itemStats.isDirectory()) {
            // Calculate directory size before removal
            const size = await getDirectorySize(itemPath);
            stats.bytesFreed += size;
            
            await fs.rm(itemPath, { recursive: true, force: true });
            stats.directoriesRemoved++;
            logger.info(`Removed organization directory: ${itemPath}`);
          } else if (itemStats.isFile()) {
            stats.bytesFreed += itemStats.size;
            await fs.unlink(itemPath);
            stats.filesRemoved++;
            logger.info(`Removed organization file: ${itemPath}`);
          }
        } catch (error) {
          logger.error(`Error removing item ${itemPath}:`, error);
          stats.errors.push(`Failed to remove ${item}: ${error.message}`);
        }
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}

// Helper function to clean temporary files
async function cleanupTempFiles(organizationId, stats) {
  const tempPaths = ['/tmp', '/var/tmp'];
  
  for (const tempPath of tempPaths) {
    try {
      const items = await fs.readdir(tempPath);
      
      for (const item of items) {
        if (item.includes(organizationId) || item.includes('analyzer') || item.includes('analysis')) {
          const itemPath = path.join(tempPath, item);
          
          try {
            const itemStats = await fs.stat(itemPath);
            
            // Only remove if it's older than 1 hour to avoid interfering with active analysis
            const ageMs = Date.now() - itemStats.mtime.getTime();
            const hourMs = 60 * 60 * 1000;
            
            if (ageMs > hourMs) {
              if (itemStats.isDirectory()) {
                const size = await getDirectorySize(itemPath);
                stats.bytesFreed += size;
                await fs.rm(itemPath, { recursive: true, force: true });
                stats.directoriesRemoved++;
              } else {
                stats.bytesFreed += itemStats.size;
                await fs.unlink(itemPath);
                stats.filesRemoved++;
              }
              logger.info(`Removed temp item: ${itemPath}`);
            }
          } catch (error) {
            // Ignore permission errors for system temp files
            if (error.code !== 'EACCES' && error.code !== 'EPERM') {
              logger.error(`Error removing temp item ${itemPath}:`, error);
            }
          }
        }
      }
    } catch (error) {
      // Ignore if temp directory doesn't exist or no permission
      if (error.code !== 'ENOENT' && error.code !== 'EACCES') {
        logger.error(`Error scanning temp directory ${tempPath}:`, error);
      }
    }
  }
}

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
    service: 'analyzer-cleanup',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;