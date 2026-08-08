const { buildFinding } = require('../findings/catalog');

/**
 * Base class for external exposure phases.
 *
 * A phase receives a context object carrying the probe client, the resolver,
 * the seed domain and whatever earlier phases discovered, and returns findings.
 * It never talks to the network except through ctx.probe / ctx.dns, which is
 * what makes rate limiting, the probe budget and the audit trail unavoidable.
 *
 * Subclasses set:
 *   static key      stable identifier, stored on every finding
 *   static title    human-readable name
 *   static profile  minimum profile at which the phase runs
 */
class BasePhase {
  static key = 'base';
  static title = 'Base phase';
  static profile = 'passive';

  /**
   * @param {Object} ctx
   * @param {string} ctx.seedDomain
   * @param {string} ctx.profile
   * @param {ProbeClient} ctx.probeClient
   * @param {ReconResolver} ctx.dns
   * @param {Object} ctx.state - shared discoveries, written by earlier phases
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.findings = [];
  }

  get key() {
    return this.constructor.key;
  }

  /** Implemented by subclasses. Returns nothing; emit findings via this.emit. */
  async run() {
    throw new Error(`Phase ${this.key} does not implement run()`);
  }

  /** Emit a finding from the catalog. */
  emit(findingId, details = {}) {
    this.findings.push(buildFinding(findingId, { ...details, phase: this.key }));
  }

  /** Emit an analyst lead — an action to take, not a confirmed exposure. */
  emitLead(findingId, details = {}) {
    this.findings.push(buildFinding(findingId, { ...details, phase: this.key, isLead: true }));
  }

  /** Probe a URL through the shared client, tagged with this phase. */
  probe(url, options = {}) {
    return this.ctx.probeClient.probe(url, { ...options, phase: this.key });
  }

  /** Probe several URLs, respecting concurrency and the probe budget. */
  probeAll(urls, options = {}) {
    return this.ctx.probeClient.probeAll(urls, { ...options, phase: this.key });
  }

  get dns() {
    return this.ctx.dns;
  }

  get seedDomain() {
    return this.ctx.seedDomain;
  }

  /** Shared discoveries: hosts, domains, tenant details found by earlier phases. */
  get state() {
    return this.ctx.state;
  }
}

module.exports = { BasePhase };
