const { logger } = require('../logger');

/**
 * Event-driven progress tracker that replaces stdout regex parsing.
 * Updates BullMQ job progress directly.
 */
class ProgressTracker {
  /**
   * @param {string} extractionId - Extraction job ID
   * {Object} job - BullMQ job instance for progress updates
   */
  constructor(extractionId, job) {
    this.extractionId = extractionId;
    this.job = job;
    this.currentPhase = 'initializing';
    this.recordsFetched = 0;
    this.totalPhases = {
      initializing: 5,
      authenticating: 10,
      fetching: 20,
      paginating: 50,
      writing: 85,
      complete: 100
    };
  }

  async updatePhase(phase) {
    this.currentPhase = phase;
    const progress = this._calculateProgress();
    logger.debug(`Extraction ${this.extractionId} phase: ${phase}, progress: ${progress}%`);
    if (this.job) {
      await this.job.updateProgress(progress);
    }
  }

  async incrementRecords(count) {
    this.recordsFetched += count;
    // Adjust progress between fetching and writing phases based on records
    if (this.currentPhase === 'fetching' || this.currentPhase === 'paginating') {
      const baseProgress = this.totalPhases.fetching;
      const range = this.totalPhases.writing - baseProgress;
      // Assume progress scales with records up to a reasonable ceiling
      const scale = Math.min(this.recordsFetched / 10000, 1);
      const progress = Math.floor(baseProgress + range * scale);
      if (this.job) {
        await this.job.updateProgress(progress);
      }
    }
  }

  async complete() {
    this.currentPhase = 'complete';
    if (this.job) {
      await this.job.updateProgress(100);
    }
  }

  _calculateProgress() {
    return this.totalPhases[this.currentPhase] || 10;
  }
}

module.exports = ProgressTracker;