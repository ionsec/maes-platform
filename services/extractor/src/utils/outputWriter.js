const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../logger');

/**
 * Writes extraction output files in Graph API native format.
 * Each file includes a metadata envelope with extraction type, timestamp, and format version
 * so downstream consumers (analyzer) can detect the format.
 */
class OutputWriter {
  /**
   * @param {string} orgOutputPath - Organization-scoped output directory
   * @param {string} extractionType - Type of extraction (e.g., 'azure_signin_logs')
   * @param {string} extractionId - Extraction job ID
   */
  constructor(orgOutputPath, extractionType, extractionId) {
    this.orgOutputPath = orgOutputPath;
    this.extractionType = extractionType;
    this.extractionId = extractionId;
    this.formatVersion = '2.0'; // native-graph format
  }

  /**
   * Write extraction results as JSON with metadata envelope.
   *
   * @param {string} filename - Output filename (e.g., 'AzureAD_SignInLogs.json')
   * @param {Object[]} data - Array of records from Graph API
   * @param {Object} [metadata] - Additional metadata (recordCounts, dateRange, etc.)
   * @returns {{ filename: string, path: string, size: number, recordCount: number }}
   */
  async writeJson(filename, data, metadata = {}) {
    const outputPath = path.join(this.orgOutputPath, filename);
    const payload = {
      metadata: {
        extractionType: this.extractionType,
        extractionId: this.extractionId,
        formatVersion: this.formatVersion,
        format: 'native-graph',
        generatedAt: new Date().toISOString(),
        recordCount: Array.isArray(data) ? data.length : 0,
        ...metadata
      },
      data: data
    };

    const content = JSON.stringify(payload, null, 2);
    await fs.writeFile(outputPath, content, 'utf8');
    const size = Buffer.byteLength(content);

    logger.info(`Written ${filename}: ${payload.metadata.recordCount} records, ${(size / 1024).toFixed(1)} KB`);
    return {
      filename,
      path: outputPath,
      size,
      recordCount: payload.metadata.recordCount
    };
  }

  /**
   * Write extraction results as CSV.
   *
   * @param {string} filename - Output filename (e.g., 'AzureAD_SignInLogs.csv')
   * @param {Object[]} data - Array of records
   * @param {string[]} [columns] - Column names to include (defaults to all keys from first record)
   * @returns {{ filename: string, path: string, size: number, recordCount: number }}
   */
  async writeCsv(filename, data, columns) {
    if (!Array.isArray(data) || data.length === 0) {
      return this.writeJson(filename, data);
    }

    const cols = columns || Object.keys(data[0]);
    const header = cols.join(',');
    const rows = data.map(row =>
      cols.map(col => {
        const val = row[col];
        if (val === null || val === undefined) return '';
        const str = String(val).replace(/"/g, '""');
        return str.includes(',') || str.includes('\n') || str.includes('"') ? `"${str}"` : str;
      }).join(',')
    );

    const content = [header, ...rows].join('\n');
    const outputPath = path.join(this.orgOutputPath, filename);
    await fs.writeFile(outputPath, content, 'utf8');
    const size = Buffer.byteLength(content);

    return { filename, path: outputPath, size, recordCount: data.length };
  }

  /**
   * Ensure the output directory exists.
   */
  async ensureDir() {
    await fs.mkdir(this.orgOutputPath, { recursive: true });
  }
}

module.exports = OutputWriter;