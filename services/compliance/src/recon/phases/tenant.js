const { BasePhase } = require('./basePhase');

/**
 * Tenant fingerprinting.
 *
 * Reads only endpoints Microsoft publishes for unauthenticated discovery —
 * the OpenID configuration document and the user-realm endpoint — both of
 * which any sign-in flow queries as a matter of course.
 */
class TenantPhase extends BasePhase {
  static key = 'tenant';
  static title = 'Tenant fingerprint';
  static profile = 'passive';

  async run() {
    const domain = this.seedDomain;

    const openid = await this.probe(
      `https://login.microsoftonline.com/${encodeURIComponent(domain)}/v2.0/.well-known/openid-configuration`
    );

    if (!openid.reachable || openid.statusCode !== 200) {
      this.state.isMicrosoftTenant = false;
      return;
    }

    const config = parseBody(openid.body);
    const tenantId = extractTenantId(config);

    this.state.isMicrosoftTenant = true;
    this.state.tenantId = tenantId;
    this.state.cloud = classifyCloud(config?.token_endpoint);

    const realm = await this.probe(
      `https://login.microsoftonline.com/getuserrealm.srf?login=${encodeURIComponent(`probe@${domain}`)}&json=1`
    );

    const realmData = parseBody(realm.body) || {};
    const nameSpaceType = realmData.NameSpaceType || null;
    const authUrl = realmData.AuthURL || realmData.STSAuthURL || null;

    this.state.namespaceType = nameSpaceType;
    this.state.federationBrand = realmData.FederationBrandName || null;

    this.emit('TENANT-IDENTIFIED', {
      target: domain,
      titleSuffix: domain,
      evidence: {
        tenantId,
        cloud: this.state.cloud,
        namespaceType: nameSpaceType,
        federationBrandName: this.state.federationBrand,
        issuer: config?.issuer,
        tenantRegionScope: config?.tenant_region_scope
      }
    });

    if (nameSpaceType === 'Federated' && authUrl) {
      let federationHost = null;
      try {
        federationHost = new URL(authUrl).hostname;
      } catch {
        federationHost = null;
      }

      if (federationHost) {
        this.state.federationHosts = [...(this.state.federationHosts || []), federationHost];
        this.state.discoveredHosts = [...(this.state.discoveredHosts || []), federationHost];
      }

      this.emit('FED-ADFS-DETECTED', {
        target: federationHost || domain,
        titleSuffix: domain,
        evidence: { namespaceType: nameSpaceType, authUrl, federationHost }
      });
    } else if (nameSpaceType === 'Managed') {
      this.emit('TENANT-MANAGED-AUTH', {
        target: domain,
        titleSuffix: domain,
        evidence: { namespaceType: nameSpaceType }
      });
    }
  }
}

/** Response bodies arrive parsed or as text depending on content type. */
function parseBody(body) {
  if (!body) return null;
  if (typeof body === 'object') return body;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

/** The issuer carries the tenant GUID. */
function extractTenantId(config) {
  if (!config) return null;
  const source = config.issuer || config.token_endpoint || '';
  const match = String(source).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return match ? match[0] : null;
}

/** Sovereign clouds use distinct login hosts. */
function classifyCloud(tokenEndpoint) {
  const endpoint = String(tokenEndpoint || '');
  if (endpoint.includes('login.microsoftonline.us')) return 'AzureUSGovernment';
  if (endpoint.includes('login.partner.microsoftonline.cn')) return 'AzureChinaCloud';
  if (endpoint.includes('login.microsoftonline.de')) return 'AzureGermanCloud';
  if (endpoint.includes('login.microsoftonline.com')) return 'AzurePublicCloud';
  return 'unknown';
}

module.exports = { TenantPhase, extractTenantId, classifyCloud };
