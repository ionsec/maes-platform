const mail = require('../../src/services/checkers/mail');
const ctx = require('../../src/services/checkers/context');
const { createMockGraphClient } = require('../helpers/mockGraph');

const { parseSpfAll, parseDmarc } = mail;

/**
 * Build a client whose domain list is fixed and whose DNS answers come from a
 * lookup table keyed by record name.
 */
function clientWithDns(domains, txtByName, options = {}) {
  const client = createMockGraphClient({ '/domains': domains });
  ctx.resetCache(client);

  jest.spyOn(ctx, 'resolveTxt').mockImplementation(async name => txtByName[name] || []);
  jest.spyOn(ctx, 'resolveCaa').mockImplementation(async name => options.caa?.[name] || []);
  jest.spyOn(ctx, 'resolveCname').mockImplementation(async name => options.cname?.[name] || []);

  return client;
}

const CUSTOM_DOMAIN = {
  id: 'contoso.com',
  isVerified: true,
  isInitial: false,
  isDefault: true,
  supportedServices: ['Email', 'OfficeCommunicationsOnline']
};

afterEach(() => {
  jest.restoreAllMocks();
});

describe('SPF parsing', () => {
  it.each([
    ['v=spf1 include:spf.protection.outlook.com -all', '-all'],
    ['v=spf1 include:spf.protection.outlook.com ~all', '~all'],
    ['v=spf1 include:spf.protection.outlook.com ?all', '?all'],
    ['v=spf1 +all', '+all'],
    ['v=spf1 include:spf.protection.outlook.com', null]
  ])('parses %s', (record, expected) => {
    expect(parseSpfAll(record)).toBe(expected);
  });
});

describe('DMARC parsing', () => {
  it('splits tags into a map', () => {
    const tags = parseDmarc('v=DMARC1; p=reject; pct=100; rua=mailto:d@contoso.com');
    expect(tags).toEqual({
      v: 'DMARC1',
      p: 'reject',
      pct: '100',
      rua: 'mailto:d@contoso.com'
    });
  });
});

describe('MAES-MAIL-01 SPF', () => {
  const check = mail['MAES-MAIL-01'];

  it('passes on a hard-fail record', async () => {
    const client = clientWithDns([CUSTOM_DOMAIN], {
      'contoso.com': ['v=spf1 include:spf.protection.outlook.com -all']
    });

    const result = await check(client);

    expect(result.status).toBe('compliant');
    expect(result.score).toBe(100);
  });

  it('fails on a permissive ?all record', async () => {
    const client = clientWithDns([CUSTOM_DOMAIN], {
      'contoso.com': ['v=spf1 include:spf.protection.outlook.com ?all']
    });

    const result = await check(client);

    expect(result.status).toBe('non_compliant');
    expect(result.evidence.failingEntities[0].reason).toContain('?all');
  });

  it('fails when no SPF record is published', async () => {
    const client = clientWithDns([CUSTOM_DOMAIN], { 'contoso.com': ['some-other-txt'] });

    const result = await check(client);

    expect(result.status).toBe('non_compliant');
    expect(result.evidence.failingEntities[0].reason).toBe('No SPF record published');
  });

  it('accepts a soft-fail record', async () => {
    const client = clientWithDns([CUSTOM_DOMAIN], {
      'contoso.com': ['v=spf1 include:spf.protection.outlook.com ~all']
    });

    expect((await check(client)).status).toBe('compliant');
  });
});

describe('MAES-MAIL-02 DMARC', () => {
  const check = mail['MAES-MAIL-02'];

  it('passes at p=reject with full coverage', async () => {
    const client = clientWithDns([CUSTOM_DOMAIN], {
      '_dmarc.contoso.com': ['v=DMARC1; p=reject; pct=100']
    });

    expect((await check(client)).status).toBe('compliant');
  });

  it('fails at p=none', async () => {
    const client = clientWithDns([CUSTOM_DOMAIN], {
      '_dmarc.contoso.com': ['v=DMARC1; p=none; rua=mailto:d@contoso.com']
    });

    const result = await check(client);

    expect(result.status).toBe('non_compliant');
    expect(result.evidence.failingEntities[0].reason).toContain('p=none');
  });

  it('fails when an enforcing policy applies to a fraction of messages', async () => {
    const client = clientWithDns([CUSTOM_DOMAIN], {
      '_dmarc.contoso.com': ['v=DMARC1; p=reject; pct=20']
    });

    const result = await check(client);

    expect(result.status).toBe('non_compliant');
    expect(result.evidence.failingEntities[0].reason).toContain('20%');
  });

  it('fails when no record is published', async () => {
    const client = clientWithDns([CUSTOM_DOMAIN], {});

    const result = await check(client);

    expect(result.status).toBe('non_compliant');
    expect(result.evidence.failingEntities[0].reason).toContain('No DMARC record');
  });
});

describe('MAES-MAIL-03 DKIM', () => {
  const check = mail['MAES-MAIL-03'];

  it('passes when selector CNAMEs resolve', async () => {
    const client = clientWithDns([CUSTOM_DOMAIN], {}, {
      cname: {
        'selector1._domainkey.contoso.com': ['selector1-contoso-com._domainkey.contoso.onmicrosoft.com'],
        'selector2._domainkey.contoso.com': ['selector2-contoso-com._domainkey.contoso.onmicrosoft.com']
      }
    });

    expect((await check(client)).status).toBe('compliant');
  });

  it('fails when no selector resolves', async () => {
    const client = clientWithDns([CUSTOM_DOMAIN], {});

    const result = await check(client);

    expect(result.status).toBe('non_compliant');
    expect(result.evidence.failingEntities[0].reason).toContain('selector1, selector2');
  });

  it('skips the onmicrosoft.com initial domain', async () => {
    const client = clientWithDns([{ ...CUSTOM_DOMAIN, id: 'contoso.onmicrosoft.com', isInitial: true }], {});

    const result = await check(client);

    expect(result.status).toBe('not_applicable');
  });
});

describe('MAES-DNS-01 supporting records', () => {
  const check = mail['MAES-DNS-01'];

  it('passes when CAA, MTA-STS and TLS-RPT are all published', async () => {
    const client = clientWithDns(
      [CUSTOM_DOMAIN],
      {
        '_mta-sts.contoso.com': ['v=STSv1; id=20240101'],
        '_smtp._tls.contoso.com': ['v=TLSRPTv1; rua=mailto:tls@contoso.com']
      },
      { caa: { 'contoso.com': [{ issue: 'digicert.com' }] } }
    );

    const result = await check(client);

    expect(result.status).toBe('compliant');
    expect(result.evidence.dnssecEvaluated).toBe(false);
  });

  it('reports each missing record type', async () => {
    const client = clientWithDns([CUSTOM_DOMAIN], {});

    const result = await check(client);

    expect(result.status).toBe('non_compliant');
    expect(result.evidence.failingEntities[0].missing).toEqual(['CAA', 'MTA-STS', 'TLS-RPT']);
  });
});
