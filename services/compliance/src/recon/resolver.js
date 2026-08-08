const { Resolver } = require('dns').promises;
const { logger } = require('../logger');

/**
 * DNS lookups for external exposure scans.
 *
 * Results are cached per scan because phases overlap heavily — several ask for
 * the same TXT and CNAME records — and every lookup is written to the same
 * audit trail as HTTP probes.
 *
 * Note: Node's resolver cannot query DS or DNSKEY records, so DNSSEC status is
 * not determined here.
 */
class ReconResolver {
  /**
   * @param {Object} [options]
   * @param {Object} [options.probeClient] - receives logDnsLookup for the audit trail
   * @param {number} [options.timeoutMs]
   * @param {string[]} [options.servers] - override system resolvers
   */
  constructor(options = {}) {
    this.probeClient = options.probeClient || null;
    this.resolver = new Resolver({ timeout: options.timeoutMs || 5000, tries: 2 });
    if (options.servers && options.servers.length > 0) {
      this.resolver.setServers(options.servers);
    }
    this.cache = new Map();
  }

  /** TXT records, with each record's chunks joined into one string. */
  async txt(name) {
    return this._lookup(name, 'TXT', async () => {
      const records = await this.resolver.resolveTxt(name);
      return records.map(chunks => chunks.join(''));
    });
  }

  async mx(name) {
    return this._lookup(name, 'MX', () => this.resolver.resolveMx(name));
  }

  async cname(name) {
    return this._lookup(name, 'CNAME', () => this.resolver.resolveCname(name));
  }

  async a(name) {
    return this._lookup(name, 'A', () => this.resolver.resolve4(name));
  }

  async ns(name) {
    return this._lookup(name, 'NS', () => this.resolver.resolveNs(name));
  }

  async caa(name) {
    return this._lookup(name, 'CAA', () => this.resolver.resolveCaa(name));
  }

  async srv(name) {
    return this._lookup(name, 'SRV', () => this.resolver.resolveSrv(name));
  }

  async soa(name) {
    return this._lookup(name, 'SOA', () => this.resolver.resolveSoa(name));
  }

  /**
   * Does the name exist at all?
   * Distinguishes NXDOMAIN (nothing there) from a name that exists with no
   * records of the type asked for — the distinction subdomain-takeover
   * detection depends on.
   */
  async exists(name) {
    try {
      await this.resolver.resolveAny(name);
      return true;
    } catch (error) {
      if (error.code === 'ENOTFOUND' || error.code === 'ENXDOMAIN') return false;
      // ENODATA means the name exists but has no records of that type.
      return error.code === 'ENODATA';
    }
  }

  /** Empty array on NXDOMAIN/ENODATA; other failures are logged and swallowed. */
  async _lookup(name, recordType, fn) {
    const key = `${recordType}:${name}`;
    if (this.cache.has(key)) return this.cache.get(key);

    const promise = (async () => {
      const started = Date.now();
      let error = null;
      let result = [];

      try {
        result = await fn();
      } catch (err) {
        error = err.code || err.message;
        if (err.code !== 'ENOTFOUND' && err.code !== 'ENODATA' && err.code !== 'ENXDOMAIN') {
          logger.debug(`DNS ${recordType} lookup for ${name} failed: ${error}`);
        }
        result = [];
      }

      if (this.probeClient) {
        await this.probeClient.logDnsLookup({
          name,
          recordType,
          elapsedMs: Date.now() - started,
          error
        });
      }

      return result;
    })();

    this.cache.set(key, promise);
    return promise;
  }
}

module.exports = { ReconResolver };
