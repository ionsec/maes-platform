const axios = require('axios');
const { logger } = require('../logger');

/**
 * The single outbound HTTP path for external exposure scans.
 *
 * Every probe this issues leaves MAES and lands on infrastructure the assessed
 * organisation (or a third party) operates, so the client — not the individual
 * phases — owns the guarantees:
 *
 *   - a global concurrency cap and a per-host rate limit with jitter
 *   - a hard ceiling on total probes per scan
 *   - an honest, identifiable User-Agent
 *   - an audit record of every request, written before the result is returned
 *
 * Phases cannot bypass any of this because they never see axios directly.
 */

/** Identifies MAES to whatever receives the request. */
const DEFAULT_USER_AGENT = 'MAES-ExternalExposure/1.0 (+security-assessment; contact your MAES administrator)';

const DEFAULTS = {
  timeoutMs: 8000,
  maxConcurrency: 8,
  perHostMinIntervalMs: 750,
  jitterMs: 250,
  maxProbes: 2000
};

/** Raised when a scan hits its probe ceiling. Phases treat this as terminal. */
class ProbeBudgetExceededError extends Error {
  constructor(maxProbes) {
    super(`Probe budget of ${maxProbes} exhausted for this scan`);
    this.name = 'ProbeBudgetExceededError';
    this.maxProbes = maxProbes;
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

class ProbeClient {
  /**
   * @param {Object} options
   * @param {string} options.scanId - Scan the probes belong to; required for the audit log
   * @param {Object} [options.db] - Database helper exposing query(text, params)
   * @param {number} [options.maxProbes]
   * @param {number} [options.maxConcurrency]
   * @param {number} [options.perHostMinIntervalMs]
   * @param {number} [options.jitterMs]
   * @param {number} [options.timeoutMs]
   * @param {string} [options.userAgent]
   * @param {Function} [options.httpClient] - Injected request function, for tests
   */
  constructor(options = {}) {
    if (!options.scanId) {
      throw new Error('ProbeClient requires a scanId so probes can be attributed in the audit log');
    }

    this.scanId = options.scanId;
    this.db = options.db || null;
    this.maxProbes = options.maxProbes ?? DEFAULTS.maxProbes;
    this.maxConcurrency = options.maxConcurrency ?? DEFAULTS.maxConcurrency;
    this.perHostMinIntervalMs = options.perHostMinIntervalMs ?? DEFAULTS.perHostMinIntervalMs;
    this.jitterMs = options.jitterMs ?? DEFAULTS.jitterMs;
    this.timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
    this.userAgent = options.userAgent || DEFAULT_USER_AGENT;
    this.httpClient = options.httpClient || (config => axios.request(config));

    this.probeCount = 0;
    this.budgetExhausted = false;

    this._active = 0;
    this._queue = [];
    this._nextAllowedByHost = new Map();
  }

  /** Number of probes issued so far. */
  get count() {
    return this.probeCount;
  }

  /**
   * Issue one read-only probe.
   *
   * Never throws on a network failure — an unreachable host is a result, not an
   * error. Throws only when the scan's probe budget is exhausted.
   *
   * @param {string} url
   * @param {Object} [options]
   * @param {string} [options.method='GET']
   * @param {string} [options.phase] - phase key, recorded in the audit log
   * @param {Object} [options.headers]
   * @returns {Promise<{url, reachable, statusCode, headers, body, elapsedMs, error}>}
   */
  async probe(url, options = {}) {
    if (this.probeCount >= this.maxProbes) {
      this.budgetExhausted = true;
      throw new ProbeBudgetExceededError(this.maxProbes);
    }

    // Reserve the slot before awaiting anything, so concurrent callers cannot
    // collectively overshoot the ceiling.
    this.probeCount++;

    const host = safeHost(url);
    return this._schedule(host, () => this._execute(url, host, options));
  }

  /**
   * Probe many URLs, respecting the concurrency cap and per-host pacing.
   * Budget exhaustion stops the batch and returns what completed.
   * @param {string[]} urls
   * @param {Object} [options]
   */
  async probeAll(urls, options = {}) {
    const results = [];

    const settled = await Promise.allSettled(urls.map(url => this.probe(url, options)));
    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        results.push(outcome.value);
      } else if (outcome.reason instanceof ProbeBudgetExceededError) {
        logger.warn(`Scan ${this.scanId}: probe budget exhausted, ${urls.length - results.length} probe(s) skipped`);
      } else {
        logger.warn(`Scan ${this.scanId}: probe failed unexpectedly: ${outcome.reason.message}`);
      }
    }

    return results;
  }

  /** Record a DNS lookup in the same audit trail as HTTP probes. */
  async logDnsLookup({ name, recordType, phase, elapsedMs, error }) {
    await this._writeLog({
      phase,
      kind: 'dns',
      method: recordType,
      url: name,
      host: name,
      statusCode: null,
      elapsedMs,
      error
    });
  }

  // --- internals ---------------------------------------------------------

  /** Run `task` under the global concurrency cap and the host's rate limit. */
  async _schedule(host, task) {
    await this._acquireSlot();
    try {
      await this._waitForHost(host);
      return await task();
    } finally {
      this._releaseSlot();
    }
  }

  _acquireSlot() {
    if (this._active < this.maxConcurrency) {
      this._active++;
      return Promise.resolve();
    }
    return new Promise(resolve => this._queue.push(resolve));
  }

  _releaseSlot() {
    const next = this._queue.shift();
    if (next) {
      // Hand the slot straight to the next waiter rather than decrementing.
      next();
    } else {
      this._active--;
    }
  }

  /**
   * Hold back until this host's next permitted request time, then claim the
   * following slot. Jitter keeps the pattern from looking like a metronome.
   */
  async _waitForHost(host) {
    const now = Date.now();
    const earliest = this._nextAllowedByHost.get(host) || 0;
    const jitter = Math.floor(Math.random() * this.jitterMs);
    const waitMs = Math.max(0, earliest - now);

    this._nextAllowedByHost.set(host, Math.max(now, earliest) + this.perHostMinIntervalMs + jitter);

    if (waitMs > 0) await sleep(waitMs);
  }

  async _execute(url, host, options) {
    const started = Date.now();
    const method = options.method || 'GET';

    let result;
    try {
      const response = await this.httpClient({
        url,
        method,
        data: options.data,
        timeout: options.timeout || this.timeoutMs,
        maxRedirects: 0,
        maxContentLength: 2 * 1024 * 1024,
        headers: { 'User-Agent': this.userAgent, ...(options.headers || {}) },
        // Any HTTP response is a result; only transport failures mean unreachable.
        validateStatus: () => true,
        // Never send credentials or cookies to a probed host.
        withCredentials: false
      });

      result = {
        url,
        host,
        method,
        reachable: true,
        statusCode: response.status,
        headers: response.headers || {},
        body: response.data,
        elapsedMs: Date.now() - started,
        error: null
      };
    } catch (error) {
      result = {
        url,
        host,
        method,
        reachable: false,
        statusCode: error.response ? error.response.status : null,
        headers: {},
        body: null,
        elapsedMs: Date.now() - started,
        error: error.code || error.message
      };
    }

    await this._writeLog({
      phase: options.phase,
      kind: 'http',
      method,
      url,
      host,
      statusCode: result.statusCode,
      elapsedMs: result.elapsedMs,
      error: result.error
    });

    return result;
  }

  /**
   * Append to the probe audit trail. A logging failure must not abort a scan,
   * but it is loud: an unaccounted probe is exactly what this table exists to
   * prevent.
   */
  async _writeLog(entry) {
    if (!this.db) return;

    try {
      await this.db.query(
        `INSERT INTO maes.recon_probe_log
           (scan_id, phase, kind, method, url, host, status_code, elapsed_ms, error, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          this.scanId,
          entry.phase || null,
          entry.kind,
          entry.method || null,
          entry.url,
          entry.host || null,
          entry.statusCode ?? null,
          entry.elapsedMs ?? null,
          entry.error || null,
          this.userAgent
        ]
      );
    } catch (error) {
      logger.error(`Scan ${this.scanId}: failed to write probe log entry for ${entry.url}: ${error.message}`);
    }
  }
}

/** Extract a hostname for rate-limiting purposes; falls back to the raw string. */
function safeHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return String(url);
  }
}

module.exports = {
  ProbeClient,
  ProbeBudgetExceededError,
  DEFAULT_USER_AGENT,
  DEFAULTS
};
