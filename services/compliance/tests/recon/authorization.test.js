const db = require('../../src/services/database');
const {
  authorizeScan,
  coversDomain,
  AuthorizationError
} = require('../../src/recon/authorization');

const ORG = 'org-1';

const future = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

/**
 * Stub the two database reads the gate performs: the authorization list and
 * the organization's own domain record.
 */
function stubDb({ authorizations = [], organization = null } = {}) {
  jest.spyOn(db, 'getRows').mockResolvedValue(authorizations);
  jest.spyOn(db, 'getRow').mockResolvedValue(organization);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('coversDomain', () => {
  it('matches the domain itself', () => {
    expect(coversDomain(['contoso.com'], 'contoso.com')).toBe(true);
  });

  it('matches subdomains', () => {
    expect(coversDomain(['contoso.com'], 'mail.contoso.com')).toBe(true);
  });

  it('treats a wildcard entry as its parent', () => {
    expect(coversDomain(['*.contoso.com'], 'mail.contoso.com')).toBe(true);
  });

  it('does not match a domain that merely ends with the same string', () => {
    expect(coversDomain(['contoso.com'], 'evilcontoso.com')).toBe(false);
  });

  it('does not match an unrelated domain', () => {
    expect(coversDomain(['contoso.com'], 'fabrikam.com')).toBe(false);
  });

  it('is case- and trailing-dot-insensitive', () => {
    expect(coversDomain(['Contoso.com.'], 'MAIL.CONTOSO.COM')).toBe(true);
  });
});

describe('aggressive profile', () => {
  it('is refused with no authorization at all', async () => {
    stubDb({ organization: { fqdn: 'contoso.com' } });

    await expect(authorizeScan({
      organizationId: ORG,
      seedDomain: 'contoso.com',
      profile: 'aggressive'
    })).rejects.toThrow(AuthorizationError);
  });

  it('is refused even for the organization\'s own registered domain', async () => {
    // Owning the domain is enough for passive and standard, never for aggressive.
    stubDb({ organization: { fqdn: 'contoso.com' } });

    await expect(authorizeScan({
      organizationId: ORG,
      seedDomain: 'contoso.com',
      profile: 'aggressive'
    })).rejects.toThrow(/requires a current authorization record/);
  });

  it('is refused when the authorization ceiling is only standard', async () => {
    stubDb({
      authorizations: [{ id: 'a1', domains: ['contoso.com'], profile_ceiling: 'standard', expires_at: future() }]
    });

    await expect(authorizeScan({
      organizationId: ORG,
      seedDomain: 'contoso.com',
      profile: 'aggressive'
    })).rejects.toThrow(/none permits the aggressive tier/);
  });

  it('is refused when the authorization covers a different domain', async () => {
    stubDb({
      authorizations: [{ id: 'a1', domains: ['fabrikam.com'], profile_ceiling: 'aggressive', expires_at: future() }]
    });

    await expect(authorizeScan({
      organizationId: ORG,
      seedDomain: 'contoso.com',
      profile: 'aggressive'
    })).rejects.toThrow(/No current authorization covers this domain/);
  });

  it('proceeds with a covering aggressive authorization', async () => {
    stubDb({
      authorizations: [{ id: 'a1', domains: ['contoso.com'], profile_ceiling: 'aggressive', expires_at: future() }]
    });

    const result = await authorizeScan({
      organizationId: ORG,
      seedDomain: 'mail.contoso.com',
      profile: 'aggressive'
    });

    expect(result).toEqual({ authorizationId: 'a1', basis: 'explicit_authorization' });
  });
});

describe('passive and standard profiles', () => {
  it('proceed against the organization\'s own registered domain without an authorization', async () => {
    stubDb({ organization: { fqdn: 'contoso.com' } });

    const result = await authorizeScan({
      organizationId: ORG,
      seedDomain: 'contoso.com',
      profile: 'passive'
    });

    expect(result).toEqual({ authorizationId: null, basis: 'organization_owned_domain' });
  });

  it('are refused against a domain the organization does not own', async () => {
    stubDb({ organization: { fqdn: 'contoso.com' } });

    await expect(authorizeScan({
      organizationId: ORG,
      seedDomain: 'fabrikam.com',
      profile: 'standard'
    })).rejects.toThrow(/not a registered domain for this organization/);
  });

  it('proceed against a third-party domain with an explicit authorization', async () => {
    stubDb({
      authorizations: [{ id: 'a2', domains: ['fabrikam.com'], profile_ceiling: 'standard', expires_at: future() }],
      organization: { fqdn: 'contoso.com' }
    });

    const result = await authorizeScan({
      organizationId: ORG,
      seedDomain: 'fabrikam.com',
      profile: 'standard'
    });

    expect(result).toEqual({ authorizationId: 'a2', basis: 'explicit_authorization' });
  });

  it('recognise verified domains recorded on the organization metadata', async () => {
    stubDb({ organization: { fqdn: 'contoso.com', metadata: { verifiedDomains: ['contoso.co.uk'] } } });

    const result = await authorizeScan({
      organizationId: ORG,
      seedDomain: 'contoso.co.uk',
      profile: 'passive'
    });

    expect(result.basis).toBe('organization_owned_domain');
  });

  it('are refused when the organization record cannot be found', async () => {
    stubDb({ organization: null });

    await expect(authorizeScan({
      organizationId: ORG,
      seedDomain: 'contoso.com',
      profile: 'passive'
    })).rejects.toThrow(AuthorizationError);
  });
});

describe('unknown profiles', () => {
  it('are refused rather than defaulting to something permissive', async () => {
    stubDb({ organization: { fqdn: 'contoso.com' } });

    await expect(authorizeScan({
      organizationId: ORG,
      seedDomain: 'contoso.com',
      profile: 'maximum'
    })).rejects.toThrow(/Unknown scan profile/);
  });
});
