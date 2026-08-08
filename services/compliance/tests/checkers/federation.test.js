const federation = require('../../src/services/checkers/federation');
const ctx = require('../../src/services/checkers/context');
const { createMockGraphClient } = require('../helpers/mockGraph');

const FEDERATED = { id: 'contoso.com', isVerified: true, authenticationType: 'Federated', isDefault: true };
const MANAGED = { id: 'contoso.onmicrosoft.com', isVerified: true, authenticationType: 'Managed', isInitial: true };

/**
 * @param {Object[]} domains
 * @param {Object} probeByUrl - path suffix -> {reachable, statusCode}
 */
function setup(domains, probeByUrl = {}, federationHost = 'sts.contoso.com') {
  const client = createMockGraphClient({ '/domains': domains });
  ctx.resetCache(client);

  jest.spyOn(ctx, 'getFederationHost').mockResolvedValue(federationHost);
  jest.spyOn(ctx, 'probe').mockImplementation(async (url) => ({
    url,
    reachable: false,
    statusCode: null,
    error: 'ECONNREFUSED',
    ...(probeByUrl[url] || {})
  }));

  return client;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('MAES-FED-01 federated domain inventory', () => {
  const check = federation['MAES-FED-01'];

  it('passes when every domain is managed', async () => {
    const result = await check(setup([MANAGED]));

    expect(result.status).toBe('compliant');
    expect(result.actualResult.federatedDomains).toBe(0);
  });

  it('reports each federated domain', async () => {
    const result = await check(setup([FEDERATED, MANAGED]));

    expect(result.status).toBe('non_compliant');
    expect(result.actualResult.federatedDomains).toBe(1);
    expect(result.actualResult.managedDomains).toBe(1);
    expect(result.evidence.failingEntities[0].id).toBe('contoso.com');
  });
});

describe('MAES-FED-02 WS-Trust endpoints', () => {
  const check = federation['MAES-FED-02'];

  it('is not applicable without federated domains', async () => {
    jest.spyOn(ctx, 'getFederationHost').mockResolvedValue(null);
    const client = createMockGraphClient({ '/domains': [MANAGED] });
    ctx.resetCache(client);

    expect((await check(client)).status).toBe('not_applicable');
  });

  it('flags a reachable usernamemixed endpoint', async () => {
    const client = setup([FEDERATED], {
      'https://sts.contoso.com/adfs/services/trust/2005/usernamemixed': { reachable: true, statusCode: 200, error: null }
    });

    const result = await check(client);

    expect(result.status).toBe('non_compliant');
    expect(result.evidence.failingEntities).toHaveLength(1);
    expect(result.evidence.failingEntities[0].displayName).toContain('usernamemixed');
  });

  it('flags both endpoints when both answer', async () => {
    const client = setup([FEDERATED], {
      'https://sts.contoso.com/adfs/services/trust/2005/usernamemixed': { reachable: true, statusCode: 200, error: null },
      'https://sts.contoso.com/adfs/services/trust/2005/windowstransport': { reachable: true, statusCode: 401, error: null }
    });

    expect((await check(client)).evidence.failingEntities).toHaveLength(2);
  });

  it('treats a 404 as not exposed', async () => {
    const client = setup([FEDERATED], {
      'https://sts.contoso.com/adfs/services/trust/2005/usernamemixed': { reachable: true, statusCode: 404, error: null }
    });

    expect((await check(client)).status).toBe('compliant');
  });

  it('treats a refused connection as not exposed', async () => {
    const client = setup([FEDERATED]);

    expect((await check(client)).status).toBe('compliant');
  });
});

describe('MAES-FED-03 MEX endpoint', () => {
  const check = federation['MAES-FED-03'];

  it('flags a reachable MEX endpoint', async () => {
    const client = setup([FEDERATED], {
      'https://sts.contoso.com/adfs/services/trust/mex': { reachable: true, statusCode: 200, error: null }
    });

    const result = await check(client);

    expect(result.status).toBe('non_compliant');
    expect(result.evidence.failingEntities[0].displayName).toContain('mex');
  });

  it('passes when MEX is not published', async () => {
    const client = setup([FEDERATED], {
      'https://sts.contoso.com/adfs/services/trust/mex': { reachable: true, statusCode: 404, error: null }
    });

    expect((await check(client)).status).toBe('compliant');
  });

  it('probes each federation host only once across both controls', async () => {
    const client = setup([FEDERATED], {
      'https://sts.contoso.com/adfs/services/trust/mex': { reachable: true, statusCode: 200, error: null }
    });

    await federation['MAES-FED-02'](client);
    await federation['MAES-FED-03'](client);

    // Three endpoints, one host, one round of probing.
    expect(ctx.probe).toHaveBeenCalledTimes(3);
  });
});
