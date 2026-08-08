const { BasePhase } = require('./basePhase');

/**
 * Microsoft 365 anonymous-access surface.
 *
 * Standard tier. Probes the organisation's own SharePoint tenant and any Power
 * Pages portals found among their hostnames, checking whether data is readable
 * without authenticating.
 */

/** Dataverse tables most commonly left readable on Power Pages portals. */
const DATAVERSE_ENTITY_SETS = ['contacts', 'accounts', 'incidents', 'leads', 'systemusers'];

class M365SurfacePhase extends BasePhase {
  static key = 'm365_surface';
  static title = 'Microsoft 365 anonymous access';
  static profile = 'standard';

  static MAX_PORTALS = 10;

  async run() {
    await this._checkSharePoint();
    await this._checkPowerPages();
  }

  async _checkSharePoint() {
    const tenantName = this._tenantName();
    if (!tenantName) return;

    const roots = [
      `https://${tenantName}.sharepoint.com/_api/web`,
      `https://${tenantName}.sharepoint.com/_api/web/lists`
    ];

    for (const url of roots) {
      const result = await this.probe(url, { headers: { Accept: 'application/json;odata=verbose' } });

      // A 401/403 is the healthy answer: the endpoint exists and demands auth.
      if (!result.reachable || result.statusCode !== 200) continue;

      this.emit('SHAREPOINT-ANON-ACCESS', {
        target: url,
        titleSuffix: `${tenantName}.sharepoint.com`,
        evidence: {
          url,
          statusCode: result.statusCode,
          contentType: result.headers?.['content-type'] || null,
          bodyPreview: previewBody(result.body)
        }
      });
    }
  }

  async _checkPowerPages() {
    const portals = (this.state.discoveredHosts || [])
      .filter(host => /\.powerappsportals\.com$/i.test(host) || /\.microsoftcrmportals\.com$/i.test(host))
      .slice(0, M365SurfacePhase.MAX_PORTALS);

    // Power Pages portals are frequently served on a custom domain, so also try
    // any live web host the header phase confirmed.
    const candidates = [...new Set([...portals, ...(this.state.liveWebHosts || []).slice(0, 10)])];

    const anonymousEntities = [];

    for (const host of candidates) {
      const metadata = await this.probe(`https://${host}/_odata/$metadata`);
      const isPortal = metadata.reachable
        && metadata.statusCode === 200
        && /edmx|EntityType/i.test(String(metadata.body || ''));

      if (!isPortal) continue;

      for (const entitySet of DATAVERSE_ENTITY_SETS) {
        const url = `https://${host}/_odata/${entitySet}`;
        const result = await this.probe(url, { headers: { Accept: 'application/json' } });

        if (!result.reachable || result.statusCode !== 200) continue;

        const records = countOdataRecords(result.body);
        // A reachable feed that returns no rows is configured but empty; still
        // worth reporting, but the record count tells the analyst how urgent it is.
        anonymousEntities.push({ host, entitySet, records });

        this.emit('DATAVERSE-ANON-ODATA', {
          target: url,
          titleSuffix: `${host}/_odata/${entitySet}${records !== null ? ` (${records} record(s))` : ''}`,
          evidence: {
            host,
            entitySet,
            url,
            statusCode: result.statusCode,
            recordCount: records,
            bodyPreview: previewBody(result.body)
          }
        });
      }
    }

    this.state.anonymousDataverseEntities = anonymousEntities;
  }

  /** SharePoint tenant name, derived from the tenant's onmicrosoft.com prefix. */
  _tenantName() {
    if (this.state.tenantName) return this.state.tenantName;

    const fromHosts = (this.state.discoveredHosts || [])
      .map(h => (h.match(/^([a-z0-9-]+)\.sharepoint\.com$/i) || [])[1])
      .find(Boolean);

    if (fromHosts) {
      this.state.tenantName = fromHosts.toLowerCase();
      return this.state.tenantName;
    }

    const label = this.seedDomain.split('.')[0].toLowerCase().replace(/[^a-z0-9-]/g, '');
    this.state.tenantName = label || null;
    return this.state.tenantName;
  }
}

function previewBody(body) {
  if (body === null || body === undefined) return null;
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return text.slice(0, 500);
}

function countOdataRecords(body) {
  try {
    const parsed = typeof body === 'string' ? JSON.parse(body) : body;
    if (parsed && Array.isArray(parsed.value)) return parsed.value.length;
  } catch {
    return null;
  }
  return null;
}

module.exports = { M365SurfacePhase, DATAVERSE_ENTITY_SETS, countOdataRecords };
