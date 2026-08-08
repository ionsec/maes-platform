const { BasePhase } = require('./basePhase');

/**
 * Third-party SaaS tenant inventory.
 *
 * Aggressive tier because it probes infrastructure belonging to organisations
 * other than the one being assessed.
 *
 * Existence is established by differential, not by status code alone. Several
 * of these platforms serve a soft 404 — an HTTP 200 carrying a "not found"
 * page — and others redirect every unauthenticated request to a sign-in page
 * whether or not the tenant exists. Comparing the target slug against a random
 * control slug on the same platform is what separates a real tenant from the
 * platform's default response, at the cost of one extra probe per platform.
 */

const PLATFORMS = [
  { name: 'Atlassian', url: slug => `https://${slug}.atlassian.net/` },
  { name: 'Slack', url: slug => `https://${slug}.slack.com/` },
  { name: 'GitHub', url: slug => `https://github.com/${slug}` },
  { name: 'GitLab', url: slug => `https://gitlab.com/${slug}` },
  { name: 'Bitbucket', url: slug => `https://bitbucket.org/${slug}/` },
  { name: 'Zoom', url: slug => `https://${slug}.zoom.us/` },
  { name: 'Notion', url: slug => `https://${slug}.notion.site/` },
  { name: 'Okta', url: slug => `https://${slug}.okta.com/` }
];

class CrossSaasPhase extends BasePhase {
  static key = 'cross_saas';
  static title = 'Third-party SaaS inventory';
  static profile = 'aggressive';

  async run() {
    const slug = this.seedDomain.split('.')[0].toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!slug) return;

    const controlSlug = `maes-absent-${Math.random().toString(36).slice(2, 10)}`;
    const found = [];
    const inconclusive = [];

    for (const platform of PLATFORMS) {
      const targetUrl = platform.url(slug);
      const controlUrl = platform.url(controlSlug);

      const [target, control] = await Promise.all([
        this.probe(targetUrl),
        this.probe(controlUrl)
      ]);

      // The platform itself must be reachable for the comparison to mean anything.
      if (!target.reachable && !control.reachable) continue;

      const verdict = compare(target, control);

      if (verdict === 'exists') {
        found.push({ platform: platform.name, url: targetUrl, statusCode: target.statusCode });

        this.emit('CROSS-SAAS-TENANT-FOUND', {
          target: targetUrl,
          titleSuffix: `${platform.name} (${slug})`,
          evidence: {
            platform: platform.name,
            url: targetUrl,
            statusCode: target.statusCode,
            slug,
            control: {
              slug: controlSlug,
              statusCode: control.statusCode,
              reachable: control.reachable
            },
            method: 'Response differs from a known-absent control slug on the same platform',
            note: 'Existence is inferred, not confirmed. Verify ownership before acting on it.'
          }
        });
      } else if (verdict === 'inconclusive') {
        inconclusive.push({ platform: platform.name, statusCode: target.statusCode });
      }
    }

    this.state.crossSaasTenants = found;
    // Recorded so a short result list is not mistaken for a clean sweep.
    this.state.crossSaasInconclusive = inconclusive;
  }
}

/**
 * @returns {'exists'|'absent'|'inconclusive'}
 */
function compare(target, control) {
  // The control resolving to nothing while the target answers is the clearest
  // signal available: the hostname only exists for real tenants.
  if (!control.reachable && target.reachable) return 'exists';
  if (!target.reachable) return 'absent';

  // Identical status codes mean the platform answers the same way for a tenant
  // that certainly does not exist, so the response carries no information.
  if (target.statusCode === control.statusCode) return 'inconclusive';

  // A definitive not-found for the target settles it regardless of the control.
  if (target.statusCode === 404 || target.statusCode === 410) return 'absent';

  // Target succeeds where the control does not.
  if (target.statusCode === 200) return 'exists';

  return 'inconclusive';
}

module.exports = { CrossSaasPhase, PLATFORMS, compare };
