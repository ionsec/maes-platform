const { phasesForProfile, PHASES, profileAllows } = require('../../src/recon/phases');
const { TenantPhase, extractTenantId, classifyCloud } = require('../../src/recon/phases/tenant');
const { DnsSurfacePhase } = require('../../src/recon/phases/dnsSurface');
const { SubdomainTakeoverPhase } = require('../../src/recon/phases/subdomainTakeover');
const { CertTransparencyPhase } = require('../../src/recon/phases/certTransparency');
const { UserEnumerationPhase } = require('../../src/recon/phases/userEnumeration');
const { HttpHeadersPhase, findSubscriptionId } = require('../../src/recon/phases/httpHeaders');
const { AzureSurfacePhase, extractContainerNames } = require('../../src/recon/phases/azureSurface');

/** Context double: canned probe responses and DNS answers, no network. */
function makeCtx({ seedDomain = 'contoso.com', profile = 'passive', probes = {}, dns = {}, state = {}, options = {} } = {}) {
  const issued = [];

  const ctx = {
    seedDomain,
    profile,
    options,
    state: { discoveredHosts: [seedDomain], ...state },
    probeClient: {
      issued,
      async probe(url, opts = {}) {
        issued.push({ url, ...opts });
        const canned = probes[url];
        if (canned === undefined) {
          return { url, reachable: false, statusCode: null, headers: {}, body: null, error: 'ECONNREFUSED' };
        }
        return { url, reachable: true, statusCode: 200, headers: {}, body: null, error: null, ...canned };
      },
      async probeAll(urls, opts) {
        return Promise.all(urls.map(u => ctx.probeClient.probe(u, opts)));
      },
      async logDnsLookup() {}
    },
    dns: {
      async txt(name) { return dns.txt?.[name] || []; },
      async mx(name) { return dns.mx?.[name] || []; },
      async cname(name) { return dns.cname?.[name] || []; },
      async caa(name) { return dns.caa?.[name] || []; },
      async ns(name) { return dns.ns?.[name] || []; },
      async exists(name) { return dns.exists?.[name] ?? false; }
    }
  };

  return ctx;
}

describe('profile gating', () => {
  it('runs strictly more phases as the profile escalates', () => {
    const passive = phasesForProfile('passive');
    const standard = phasesForProfile('standard');
    const aggressive = phasesForProfile('aggressive');

    expect(passive.length).toBeLessThan(standard.length);
    expect(standard.length).toBeLessThan(aggressive.length);
    // Each tier is a superset of the one before it.
    expect(standard).toEqual(expect.arrayContaining(passive));
    expect(aggressive).toEqual(expect.arrayContaining(standard));
  });

  it('keeps enumeration and third-party probing out of passive and standard', () => {
    const standardKeys = phasesForProfile('standard').map(p => p.key);
    expect(standardKeys).not.toContain('user_enumeration');
    expect(standardKeys).not.toContain('cross_saas');
  });

  it('keeps active probing of the organisation out of passive', () => {
    const passiveKeys = phasesForProfile('passive').map(p => p.key);
    expect(passiveKeys).not.toContain('federation_probe');
    expect(passiveKeys).not.toContain('azure_surface');
    expect(passiveKeys).not.toContain('m365_surface');
    expect(passiveKeys).not.toContain('http_headers');
  });

  it('rejects an unknown profile rather than running everything', () => {
    expect(() => phasesForProfile('everything')).toThrow(/Unknown recon profile/);
  });

  it('gives every phase a declared profile and a unique key', () => {
    const keys = PHASES.map(p => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const phase of PHASES) {
      expect(['passive', 'standard', 'aggressive']).toContain(phase.profile);
    }
  });

  it('profileAllows compares tiers in order', () => {
    expect(profileAllows('standard', 'passive')).toBe(true);
    expect(profileAllows('passive', 'standard')).toBe(false);
    expect(profileAllows('aggressive', 'aggressive')).toBe(true);
  });
});

describe('tenant fingerprinting', () => {
  const OPENID = 'https://login.microsoftonline.com/contoso.com/v2.0/.well-known/openid-configuration';
  const REALM = 'https://login.microsoftonline.com/getuserrealm.srf?login=probe%40contoso.com&json=1';

  it('extracts the tenant id from the issuer', () => {
    expect(extractTenantId({ issuer: 'https://login.microsoftonline.com/8efe2cef-1111-2222-3333-444455556666/v2.0' }))
      .toBe('8efe2cef-1111-2222-3333-444455556666');
  });

  it('classifies sovereign clouds', () => {
    expect(classifyCloud('https://login.microsoftonline.us/x/oauth2/token')).toBe('AzureUSGovernment');
    expect(classifyCloud('https://login.partner.microsoftonline.cn/x')).toBe('AzureChinaCloud');
    expect(classifyCloud('https://login.microsoftonline.com/x')).toBe('AzurePublicCloud');
  });

  it('reports a managed tenant', async () => {
    const ctx = makeCtx({
      probes: {
        [OPENID]: { body: { issuer: 'https://login.microsoftonline.com/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/v2.0' } },
        [REALM]: { body: { NameSpaceType: 'Managed' } }
      }
    });

    const phase = new TenantPhase(ctx);
    await phase.run();

    const ids = phase.findings.map(f => f.findingId);
    expect(ids).toContain('TENANT-IDENTIFIED');
    expect(ids).toContain('TENANT-MANAGED-AUTH');
    expect(ctx.state.tenantId).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  });

  it('reports federation and records the AD FS host for later phases', async () => {
    const ctx = makeCtx({
      probes: {
        [OPENID]: { body: { issuer: 'https://login.microsoftonline.com/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/v2.0' } },
        [REALM]: { body: { NameSpaceType: 'Federated', AuthURL: 'https://sts.contoso.com/adfs/ls/?x=1' } }
      }
    });

    const phase = new TenantPhase(ctx);
    await phase.run();

    expect(phase.findings.map(f => f.findingId)).toContain('FED-ADFS-DETECTED');
    expect(ctx.state.federationHosts).toEqual(['sts.contoso.com']);
  });

  it('emits nothing when the domain is not a Microsoft tenant', async () => {
    const ctx = makeCtx({ probes: {} });
    const phase = new TenantPhase(ctx);
    await phase.run();

    expect(phase.findings).toHaveLength(0);
    expect(ctx.state.isMicrosoftTenant).toBe(false);
  });
});

describe('DNS surface', () => {
  it('flags a domain with no mail authentication at all', async () => {
    const ctx = makeCtx();
    const phase = new DnsSurfacePhase(ctx);
    await phase.run();

    const ids = phase.findings.map(f => f.findingId);
    expect(ids).toEqual(expect.arrayContaining([
      'MAIL-SPF-MISSING',
      'MAIL-DMARC-MISSING',
      'MAIL-DKIM-MISSING',
      'DNS-CAA-MISSING',
      'DNS-MTASTS-MISSING'
    ]));
  });

  it('stays quiet on a well-configured domain', async () => {
    const ctx = makeCtx({
      dns: {
        txt: {
          'contoso.com': ['v=spf1 include:spf.protection.outlook.com -all'],
          '_dmarc.contoso.com': ['v=DMARC1; p=reject; pct=100'],
          '_mta-sts.contoso.com': ['v=STSv1; id=20240101'],
          '_smtp._tls.contoso.com': ['v=TLSRPTv1; rua=mailto:t@contoso.com']
        },
        caa: { 'contoso.com': [{ issue: 'digicert.com' }] },
        cname: { 'selector1._domainkey.contoso.com': ['selector1-contoso._domainkey.contoso.onmicrosoft.com'] }
      }
    });

    const phase = new DnsSurfacePhase(ctx);
    await phase.run();

    expect(phase.findings).toHaveLength(0);
  });

  it('flags a permissive SPF terminal mechanism', async () => {
    const ctx = makeCtx({
      dns: { txt: { 'contoso.com': ['v=spf1 include:x ?all'] } }
    });

    const phase = new DnsSurfacePhase(ctx);
    await phase.run();

    expect(phase.findings.map(f => f.findingId)).toContain('MAIL-SPF-PERMISSIVE');
  });

  it('flags a DMARC policy that only covers part of the mail flow', async () => {
    const ctx = makeCtx({
      dns: { txt: { '_dmarc.contoso.com': ['v=DMARC1; p=reject; pct=25'] } }
    });

    const phase = new DnsSurfacePhase(ctx);
    await phase.run();

    const finding = phase.findings.find(f => f.findingId === 'MAIL-DMARC-NOT-ENFORCING');
    expect(finding.evidence.pct).toBe(25);
  });
});

describe('subdomain takeover', () => {
  it('flags a CNAME to a claimable service whose target does not resolve', async () => {
    const ctx = makeCtx({
      state: { discoveredHosts: ['old.contoso.com'] },
      dns: {
        cname: { 'old.contoso.com': ['retired-app.azurewebsites.net'] },
        exists: { 'retired-app.azurewebsites.net': false }
      }
    });

    const phase = new SubdomainTakeoverPhase(ctx);
    await phase.run();

    expect(phase.findings).toHaveLength(1);
    expect(phase.findings[0].findingId).toBe('SUBDOMAIN-TAKEOVER-CANDIDATE');
    expect(phase.findings[0].evidence.service).toBe('Azure App Service');
  });

  it('does not flag a live resource', async () => {
    const ctx = makeCtx({
      state: { discoveredHosts: ['app.contoso.com'] },
      dns: {
        cname: { 'app.contoso.com': ['live-app.azurewebsites.net'] },
        exists: { 'live-app.azurewebsites.net': true }
      }
    });

    const phase = new SubdomainTakeoverPhase(ctx);
    await phase.run();

    expect(phase.findings).toHaveLength(0);
  });

  it('ignores CNAMEs to services outside the claimable list', async () => {
    const ctx = makeCtx({
      state: { discoveredHosts: ['www.contoso.com'] },
      dns: {
        cname: { 'www.contoso.com': ['contoso.map.example-cdn.com'] },
        exists: { 'contoso.map.example-cdn.com': false }
      }
    });

    const phase = new SubdomainTakeoverPhase(ctx);
    await phase.run();

    expect(phase.findings).toHaveLength(0);
  });
});

describe('certificate transparency', () => {
  const CT_URL = 'https://crt.sh/?q=%25.contoso.com&output=json';

  it('collects in-scope hostnames and drops wildcards to their parent', async () => {
    const ctx = makeCtx({
      probes: {
        [CT_URL]: {
          body: [
            { name_value: 'www.contoso.com\n*.api.contoso.com' },
            { name_value: 'mail.contoso.com' },
            { name_value: 'notours.example.com' }
          ]
        }
      }
    });

    const phase = new CertTransparencyPhase(ctx);
    await phase.run();

    expect(ctx.state.ctHostnames).toEqual(['api.contoso.com', 'mail.contoso.com', 'www.contoso.com']);
    expect(ctx.state.ctHostnames).not.toContain('notours.example.com');
  });

  it('records truncation rather than silently dropping hosts', async () => {
    const many = Array.from({ length: 400 }, (_, i) => ({ name_value: `h${i}.contoso.com` }));
    const ctx = makeCtx({ probes: { [CT_URL]: { body: many } } });

    const phase = new CertTransparencyPhase(ctx);
    await phase.run();

    expect(ctx.state.ctHostnames).toHaveLength(CertTransparencyPhase.MAX_HOSTS);
    expect(ctx.state.ctTruncated).toEqual({ found: 400, kept: CertTransparencyPhase.MAX_HOSTS });
  });
});

describe('user enumeration check', () => {
  const URL = 'https://login.microsoftonline.com/common/GetCredentialType';

  it('submits no password', async () => {
    const ctx = makeCtx({ probes: { [URL]: { body: { IfExistsResult: 0 } } } });

    const phase = new UserEnumerationPhase(ctx);
    await phase.run();

    for (const call of ctx.probeClient.issued) {
      expect(JSON.stringify(call.data || {})).not.toMatch(/password/i);
    }
  });

  it('flags a tenant that discloses account non-existence', async () => {
    const ctx = makeCtx({ probes: { [URL]: { body: { IfExistsResult: 1 } } } });

    const phase = new UserEnumerationPhase(ctx);
    await phase.run();

    expect(phase.findings.map(f => f.findingId)).toContain('USER-ENUM-POSSIBLE');
  });

  it('stays quiet when responses are indistinguishable', async () => {
    const ctx = makeCtx({ probes: { [URL]: { body: { IfExistsResult: 0 } } } });

    const phase = new UserEnumerationPhase(ctx);
    await phase.run();

    expect(phase.findings).toHaveLength(0);
  });

  it('issues exactly two probes when a seed account is supplied', async () => {
    const ctx = makeCtx({
      options: { seedUser: 'known@contoso.com' },
      probes: { [URL]: { body: { IfExistsResult: 0 } } }
    });

    const phase = new UserEnumerationPhase(ctx);
    await phase.run();

    expect(ctx.probeClient.issued).toHaveLength(2);
  });
});

describe('HTTP header review', () => {
  it('flags missing headers and accepts CSP frame-ancestors in place of X-Frame-Options', async () => {
    const ctx = makeCtx({
      state: { discoveredHosts: ['www.contoso.com'] },
      probes: {
        'https://www.contoso.com/': {
          headers: {
            'Strict-Transport-Security': 'max-age=31536000',
            'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'"
          }
        }
      }
    });

    const phase = new HttpHeadersPhase(ctx);
    await phase.run();

    expect(phase.findings).toHaveLength(0);
  });

  it('reports the specific headers that are absent', async () => {
    const ctx = makeCtx({
      state: { discoveredHosts: ['www.contoso.com'] },
      probes: { 'https://www.contoso.com/': { headers: {} } }
    });

    const phase = new HttpHeadersPhase(ctx);
    await phase.run();

    expect(phase.findings[0].evidence.missing)
      .toEqual(['HSTS', 'Content-Security-Policy', 'X-Frame-Options']);
  });

  it('only treats a GUID as a subscription id when it is labelled as one', () => {
    expect(findSubscriptionId({ headers: {}, body: 'request-id: aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }))
      .toBeNull();
    expect(findSubscriptionId({ headers: {}, body: '/subscriptions/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/rg' }))
      .toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  });
});

describe('Azure surface', () => {
  it('parses container names from a blob listing', () => {
    const xml = '<EnumerationResults><Containers>'
      + '<Container><Name>backups</Name></Container>'
      + '<Container><Name>public</Name></Container>'
      + '</Containers></EnumerationResults>';
    expect(extractContainerNames(xml)).toEqual(['backups', 'public']);
  });

  it('flags an anonymously listable storage account', async () => {
    const ctx = makeCtx({
      probes: {
        'https://contoso.blob.core.windows.net/?comp=list': {
          body: '<EnumerationResults><Container><Name>backups</Name></Container></EnumerationResults>'
        }
      }
    });

    const phase = new AzureSurfacePhase(ctx);
    await phase.run();

    const finding = phase.findings.find(f => f.findingId === 'AZURE-STORAGE-PUBLIC-CONTAINER');
    expect(finding).toBeDefined();
    expect(finding.severity).toBe('critical');
    expect(finding.evidence.containers).toEqual(['backups']);
  });

  it('does not flag a storage account that refuses anonymous listing', async () => {
    const ctx = makeCtx({
      probes: { 'https://contoso.blob.core.windows.net/?comp=list': { statusCode: 403, body: '' } }
    });

    const phase = new AzureSurfacePhase(ctx);
    await phase.run();

    expect(phase.findings.filter(f => f.findingId === 'AZURE-STORAGE-PUBLIC-CONTAINER')).toHaveLength(0);
  });
});
