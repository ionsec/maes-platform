import capabilities from '../../../shared/platformCapabilities.json';

export const extractionCapabilities = capabilities.extractions;
export const analysisCapabilities = capabilities.analysisTypes;

export const extractionTypes = Object.entries(extractionCapabilities).map(([value, capability]) => ({
  value,
  ...capability
}));

export const analysisTypes = Object.entries(analysisCapabilities).map(([value, capability]) => ({
  value,
  ...capability
}));

export const analyzableExtractionTypes = extractionTypes.filter((type) => type.supportsAnalysis);
export const uploadableExtractionTypes = extractionTypes.filter((type) => type.supportsUpload);

export const getExtractionCapability = (type) => extractionCapabilities[type] || null;
export const getAnalysisCapability = (type) => analysisCapabilities[type] || null;
