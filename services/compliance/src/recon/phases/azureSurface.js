const { BasePhase } = require('./basePhase');

/**
 * Azure resource surface belonging to this organisation.
 *
 * Standard tier. Candidate resource names are derived from hostnames the
 * organisation has already published certificates for, rather than from a
 * generic wordlist — so this confirms exposure of assets we know are theirs
 * instead of guessing at names across Azure's shared namespaces.
 */

class AzureSurfacePhase extends BasePhase {
  static key = 'azure_surface';
  static title = 'Azure resource exposure';
  static profile = 'standard';

  static MAX_CANDIDATES = 40;

  async run() {
    const candidates = this._candidateNames();
    if (candidates.length === 0) return;

    const storagePublic = [];
    const kuduExposed = [];

    for (const name of candidates) {
      // Storage: an anonymous container listing is a direct data exposure.
      const listing = await this.probe(
        `https://${name}.blob.core.windows.net/?comp=list`
      );

      if (listing.reachable && listing.statusCode === 200) {
        const containers = extractContainerNames(listing.body);
        storagePublic.push({ account: name, containers });

        this.emit('AZURE-STORAGE-PUBLIC-CONTAINER', {
          target: `https://${name}.blob.core.windows.net/`,
          titleSuffix: `${name} (${containers.length} container(s) listed)`,
          evidence: {
            storageAccount: name,
            containers: containers.slice(0, 50),
            containerCount: containers.length,
            url: listing.url
          }
        });
      }

      // App Service management site.
      const kudu = await this.probe(`https://${name}.scm.azurewebsites.net/`);
      if (kudu.reachable && kudu.statusCode !== null && kudu.statusCode !== 404) {
        kuduExposed.push({ app: name, statusCode: kudu.statusCode });

        this.emit('APP-SERVICE-KUDU-EXPOSED', {
          target: kudu.url,
          titleSuffix: `${name} (HTTP ${kudu.statusCode})`,
          evidence: { appName: name, statusCode: kudu.statusCode, url: kudu.url }
        });
      }
    }

    this.state.publicStorageAccounts = storagePublic;
    this.state.exposedKuduSites = kuduExposed;
    this.state.azureCandidateNames = candidates;
  }

  /**
   * Resource-name candidates taken from the organisation's own hostnames:
   * either an Azure hostname seen directly, or the label of a hostname they
   * hold a certificate for.
   */
  _candidateNames() {
    const hosts = this.state.discoveredHosts || [];
    const names = new Set();

    for (const host of hosts) {
      const azureMatch = host.match(/^([a-z0-9-]+)\.(?:blob\.core\.windows\.net|azurewebsites\.net)$/i);
      if (azureMatch) {
        names.add(azureMatch[1].toLowerCase());
        continue;
      }

      const label = host.split('.')[0];
      // Azure storage account names: 3-24 chars, lowercase alphanumeric.
      const normalised = label.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normalised.length >= 3 && normalised.length <= 24) names.add(normalised);
    }

    const seedLabel = this.seedDomain.split('.')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seedLabel.length >= 3 && seedLabel.length <= 24) names.add(seedLabel);

    return [...names].slice(0, AzureSurfacePhase.MAX_CANDIDATES);
  }
}

/** Container names from the XML blob-service listing response. */
function extractContainerNames(body) {
  if (typeof body !== 'string') return [];
  const names = [];
  const pattern = /<Name>([^<]+)<\/Name>/g;
  let match;
  while ((match = pattern.exec(body)) !== null) {
    names.push(match[1]);
  }
  return names;
}

module.exports = { AzureSurfacePhase, extractContainerNames };
