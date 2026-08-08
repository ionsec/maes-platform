const { BasePhase } = require('./basePhase');
const { logger } = require('../../logger');

/**
 * Certificate transparency sweep.
 *
 * CT logs are a public, append-only record of every certificate issued. Reading
 * them touches no infrastructure belonging to the assessed organisation, which
 * is why this is the passive tier's main source of hostnames — everything
 * downstream works from the set this phase builds.
 */
class CertTransparencyPhase extends BasePhase {
  static key = 'cert_transparency';
  static title = 'Certificate transparency hostnames';
  static profile = 'passive';

  /** Cap on hostnames carried forward, so a large estate cannot blow the probe budget. */
  static MAX_HOSTS = 300;

  async run() {
    const domain = this.seedDomain;

    const response = await this.probe(
      `https://crt.sh/?q=${encodeURIComponent(`%.${domain}`)}&output=json`,
      { timeout: 30000 }
    );

    if (!response.reachable || response.statusCode !== 200) {
      logger.warn(`CT log query for ${domain} returned ${response.statusCode || response.error}`);
      this.state.ctQueryFailed = true;
      return;
    }

    const entries = parseEntries(response.body);
    const hostnames = new Set();

    for (const entry of entries) {
      for (const name of String(entry.name_value || '').split('\n')) {
        const cleaned = name.trim().toLowerCase().replace(/^\*\./, '');
        // Wildcards reduce to their parent; anything outside the seed domain is
        // someone else's asset and is not ours to probe.
        if (cleaned && cleaned.endsWith(`.${domain}`)) hostnames.add(cleaned);
        if (cleaned === domain) hostnames.add(cleaned);
      }
    }

    const all = [...hostnames].sort();
    const kept = all.slice(0, CertTransparencyPhase.MAX_HOSTS);

    if (all.length > kept.length) {
      // Silent truncation would read as "we covered everything".
      logger.warn(`CT sweep for ${domain}: ${all.length} hostnames found, carrying forward the first ${kept.length}`);
      this.state.ctTruncated = { found: all.length, kept: kept.length };
    }

    this.state.ctHostnames = kept;
    this.state.discoveredHosts = [...new Set([...(this.state.discoveredHosts || []), ...kept])];
  }
}

function parseEntries(body) {
  if (Array.isArray(body)) return body;
  if (typeof body !== 'string') return [];
  try {
    const parsed = JSON.parse(body);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

module.exports = { CertTransparencyPhase };
