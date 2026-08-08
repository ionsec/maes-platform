const { BasePhase } = require('./basePhase');

/**
 * AD FS endpoint reachability.
 *
 * Standard tier: a fixed set of GETs against federation hosts the tenant phase
 * already identified as belonging to this organisation. No credentials are ever
 * sent — reachability alone is the signal.
 */

const ENDPOINTS = [
  { path: '/adfs/services/trust/mex', finding: 'FED-ADFS-MEX-EXPOSED', label: 'MEX' },
  { path: '/adfs/services/trust/2005/usernamemixed', finding: 'FED-WSTRUST-EXPOSED', label: 'usernamemixed' },
  { path: '/adfs/services/trust/2005/windowstransport', finding: 'FED-WSTRUST-EXPOSED', label: 'windowstransport' },
  { path: '/adfs/services/trust/13/usernamemixed', finding: 'FED-WSTRUST-EXPOSED', label: 'usernamemixed (1.3)' }
];

class FederationProbePhase extends BasePhase {
  static key = 'federation_probe';
  static title = 'AD FS endpoint exposure';
  static profile = 'standard';

  async run() {
    const hosts = this.state.federationHosts || [];
    if (hosts.length === 0) return;

    const exposed = [];

    for (const host of hosts) {
      for (const endpoint of ENDPOINTS) {
        const url = `https://${host}${endpoint.path}`;
        const result = await this.probe(url);

        // A refused connection means not published. A 404 means AD FS is there
        // but this endpoint is disabled — also not exposed.
        if (!result.reachable || result.statusCode === null || result.statusCode === 404) continue;

        exposed.push({ host, endpoint: endpoint.label, statusCode: result.statusCode });

        this.emit(endpoint.finding, {
          target: url,
          titleSuffix: `${host} (${endpoint.label})`,
          evidence: {
            url,
            statusCode: result.statusCode,
            endpoint: endpoint.label,
            server: result.headers?.server || null
          }
        });
      }
    }

    this.state.exposedFederationEndpoints = exposed;
  }
}

module.exports = { FederationProbePhase, ENDPOINTS };
