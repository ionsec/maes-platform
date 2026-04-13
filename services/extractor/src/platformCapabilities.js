const capabilities = require('../../../shared/platformCapabilities.json');

const extractionCapabilities = capabilities.extractions;

function getExtractionCapability(type) {
  return extractionCapabilities[type] || null;
}

function getAutoAnalysisType(type) {
  return getExtractionCapability(type)?.analysisType || null;
}

module.exports = {
  extractionCapabilities,
  getExtractionCapability,
  getAutoAnalysisType
};
