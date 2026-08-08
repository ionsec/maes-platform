const { BasePhase } = require('./basePhase');

/**
 * Dangling DNS detection.
 *
 * Looks for hostnames whose CNAME points at a cloud service where the target
 * name no longer resolves — the signature of a decommissioned resource whose
 * name an attacker can re-register.
 *
 * Passive: DNS resolution only, no requests to the organisation's hosts.
 */

/**
 * Suffixes where the resource name is claimable by whoever registers it first.
 * Each entry names the service so the finding can say what to re-claim.
 */
const CLAIMABLE_SUFFIXES = [
  { suffix: '.cloudapp.azure.com', service: 'Azure Cloud Services' },
  { suffix: '.cloudapp.net', service: 'Azure Cloud Services (classic)' },
  { suffix: '.azurewebsites.net', service: 'Azure App Service' },
  { suffix: '.scm.azurewebsites.net', service: 'Azure App Service (SCM)' },
  { suffix: '.trafficmanager.net', service: 'Azure Traffic Manager' },
  { suffix: '.azurefd.net', service: 'Azure Front Door' },
  { suffix: '.azureedge.net', service: 'Azure CDN' },
  { suffix: '.azurestaticapps.net', service: 'Azure Static Web Apps' },
  { suffix: '.blob.core.windows.net', service: 'Azure Blob Storage' },
  { suffix: '.web.core.windows.net', service: 'Azure Storage static website' },
  { suffix: '.search.windows.net', service: 'Azure Cognitive Search' },
  { suffix: '.azure-api.net', service: 'Azure API Management' },
  { suffix: '.azurecontainer.io', service: 'Azure Container Instances' },
  { suffix: '.azurehdinsight.net', service: 'Azure HDInsight' },
  { suffix: '.redis.cache.windows.net', service: 'Azure Cache for Redis' },
  { suffix: '.database.windows.net', service: 'Azure SQL' },
  { suffix: '.servicebus.windows.net', service: 'Azure Service Bus' },
  { suffix: '.github.io', service: 'GitHub Pages' },
  { suffix: '.herokuapp.com', service: 'Heroku' },
  { suffix: '.netlify.app', service: 'Netlify' },
  { suffix: '.vercel.app', service: 'Vercel' },
  { suffix: '.pages.dev', service: 'Cloudflare Pages' }
];

class SubdomainTakeoverPhase extends BasePhase {
  static key = 'subdomain_takeover';
  static title = 'Dangling DNS and subdomain takeover';
  static profile = 'passive';

  async run() {
    const hosts = this.state.discoveredHosts || [];
    if (hosts.length === 0) return;

    const dangling = [];

    for (const host of hosts) {
      const cnames = await this.dns.cname(host);
      if (cnames.length === 0) continue;

      const target = String(cnames[0]).toLowerCase().replace(/\.$/, '');
      const match = CLAIMABLE_SUFFIXES.find(entry => target.endsWith(entry.suffix));
      if (!match) continue;

      // The record points at a claimable service. It is only dangling if the
      // target itself no longer resolves.
      const targetResolves = await this.dns.exists(target);
      if (targetResolves) continue;

      dangling.push({ host, target, service: match.service });

      this.emit('SUBDOMAIN-TAKEOVER-CANDIDATE', {
        target: host,
        titleSuffix: `${host} → ${target}`,
        evidence: {
          host,
          cnameTarget: target,
          service: match.service,
          targetResolves: false,
          verification: `Confirm by attempting to resolve ${target}; if it returns NXDOMAIN the resource name is free to claim.`
        }
      });
    }

    this.state.danglingRecords = dangling;
  }
}

module.exports = { SubdomainTakeoverPhase, CLAIMABLE_SUFFIXES };
