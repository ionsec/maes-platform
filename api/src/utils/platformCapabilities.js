const capabilities = require('../../../shared/platformCapabilities.json');

const extractionCapabilities = capabilities.extractions;
const analysisCapabilities = capabilities.analysisTypes;

const extractionTypes = Object.keys(extractionCapabilities);
const analysisTypes = Object.keys(analysisCapabilities);

function getExtractionCapability(type) {
  return extractionCapabilities[type] || null;
}

function getAnalysisCapability(type) {
  return analysisCapabilities[type] || null;
}

function getAutoAnalysisType(extractionType) {
  return getExtractionCapability(extractionType)?.analysisType || null;
}

function isAnalyzableExtraction(extractionType) {
  return Boolean(getExtractionCapability(extractionType)?.supportsAnalysis);
}

module.exports = {
  extractionCapabilities,
  analysisCapabilities,
  extractionTypes,
  analysisTypes,
  getExtractionCapability,
  getAnalysisCapability,
  getAutoAnalysisType,
  isAnalyzableExtraction
};
