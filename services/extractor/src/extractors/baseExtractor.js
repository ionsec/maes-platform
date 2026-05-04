const OutputWriter = require('../utils/outputWriter');
const { logger } = require('../logger');

/**
 * Abstract base class for all native Graph API extractors.
 * Subclasses must implement the `extract()` method.
 */
class BaseExtractor {
  /**
   * @param {GraphClientWrapper} graphClient - Authenticated Graph client wrapper
   * @param {ProgressTracker} progressTracker - Progress tracker instance
   * @param {OutputWriter} outputWriter - Output writer instance
   */
  constructor(graphClient, progressTracker, outputWriter) {
    if (new.target === BaseExtractor) {
      throw new Error('Cannot instantiate BaseExtractor directly');
    }
    this.graphClient = graphClient;
    this.progressTracker = progressTracker;
    this.outputWriter = outputWriter;
  }

  /**
   * Run the extraction. Subclasses must implement this.
   *
   * @param {Object} parameters - Extraction parameters (dateRange, etc.)
   * @returns {Object[]} Array of output file descriptors
   */
  async extract(parameters) {
    throw new Error('extract() must be implemented by subclass');
  }

  /**
   * Convenience method to write JSON output with standard metadata.
   *
   * @param {string} filename - Output filename
   * @param {Object[]} data - Records from Graph API
   * @param {Object} [extraMeta] - Additional metadata
   * @returns {{ filename, path, size, recordCount }}
   */
  async writeJson(filename, data, extraMeta = {}) {
    return this.outputWriter.writeJson(filename, data, extraMeta);
  }

  /**
   * Convenience method to write CSV output.
   *
   * @param {string} filename - Output filename
   * @param {Object[]} data - Records
   * @param {string[]} [columns] - Column names
   * @returns {{ filename, path, size, recordCount }}
   */
  async writeCsv(filename, data, columns) {
    return this.outputWriter.writeCsv(filename, data, columns);
  }
}

module.exports = BaseExtractor;