const { BasePhase } = require('./basePhase');

/**
 * Security response header review for discovered web hosts.
 *
 * Standard tier: one GET per host, against hostnames already established as
 * belonging to the organisation.
 */

const REQUIRED_HEADERS = [
  { header: 'strict-transport-security', label: 'HSTS' },
  { header: 'content-security-policy', label: 'Content-Security-Policy' },
  { header: 'x-frame-options', label: 'X-Frame-Options' }
];

class HttpHeadersPhase extends BasePhase {
  static key = 'http_headers';
  static title = 'HTTP security headers';
  static profile = 'standard';

  /** Bounded so a large CT result set cannot dominate the probe budget. */
  static MAX_HOSTS = 50;

  async run() {
    const hosts = (this.state.discoveredHosts || []).slice(0, HttpHeadersPhase.MAX_HOSTS);
    if (hosts.length === 0) return;

    if ((this.state.discoveredHosts || []).length > hosts.length) {
      this.state.headerCheckTruncated = {
        found: this.state.discoveredHosts.length,
        checked: hosts.length
      };
    }

    const live = [];

    for (const host of hosts) {
      const result = await this.probe(`https://${host}/`);
      if (!result.reachable || result.statusCode === null) continue;

      live.push(host);

      const headers = normaliseHeaders(result.headers);
      const missing = REQUIRED_HEADERS
        .filter(({ header }) => !headers[header])
        // CSP frame-ancestors supersedes X-Frame-Options.
        .filter(({ header }) => !(header === 'x-frame-options'
          && /frame-ancestors/i.test(headers['content-security-policy'] || '')))
        .map(({ label }) => label);

      if (missing.length > 0) {
        this.emit('HTTP-SECURITY-HEADERS-WEAK', {
          target: `https://${host}/`,
          titleSuffix: `${host} (missing ${missing.join(', ')})`,
          evidence: {
            host,
            statusCode: result.statusCode,
            missing,
            present: Object.keys(headers).filter(h =>
              REQUIRED_HEADERS.some(r => r.header === h))
          }
        });
      }

      // Responses sometimes carry a subscription GUID in a header or body.
      const subscriptionId = findSubscriptionId(result);
      if (subscriptionId) {
        this.emit('SUBSCRIPTION-ID-LEAKED', {
          target: `https://${host}/`,
          titleSuffix: host,
          evidence: { host, subscriptionId }
        });
      }
    }

    this.state.liveWebHosts = live;
  }
}

function normaliseHeaders(headers = {}) {
  const out = {};
  for (const [key, value] of Object.entries(headers)) {
    out[String(key).toLowerCase()] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return out;
}

/**
 * Azure subscription identifiers are GUIDs; look for one adjacent to a
 * subscription marker so ordinary GUIDs (request ids, correlation ids) do not
 * generate noise.
 */
function findSubscriptionId(result) {
  const haystack = [
    JSON.stringify(result.headers || {}),
    typeof result.body === 'string' ? result.body.slice(0, 50000) : ''
  ].join('\n');

  const match = haystack.match(
    /subscriptions?["'\s:/=]{1,4}([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  );
  return match ? match[1] : null;
}

module.exports = { HttpHeadersPhase, REQUIRED_HEADERS, findSubscriptionId };
