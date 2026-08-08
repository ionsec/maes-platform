const conditionalAccess = require('../../src/services/checkers/conditionalAccess');
const ctx = require('../../src/services/checkers/context');
const { createMockGraphClient } = require('../helpers/mockGraph');

const policy = (overrides = {}) => ({
  id: 'p1',
  displayName: 'Require MFA',
  state: 'enabled',
  conditions: {
    users: { includeUsers: ['All'], excludeUsers: [], excludeGroups: [], excludeRoles: [] },
    applications: { includeApplications: ['All'] },
    clientAppTypes: []
  },
  grantControls: { builtInControls: ['mfa'] },
  ...overrides
});

function client(policies, users = {}) {
  const c = createMockGraphClient({
    '/identity/conditionalAccess/policies': policies,
    ...users
  });
  ctx.resetCache(c);
  return c;
}

describe('MAES-CA-01 policy states', () => {
  const check = conditionalAccess['MAES-CA-01'];

  it('passes when every policy is enabled', async () => {
    const result = await check(client([policy(), policy({ id: 'p2' })]));

    expect(result.status).toBe('compliant');
    expect(result.score).toBe(100);
  });

  it('flags report-only and disabled policies separately', async () => {
    const result = await check(client([
      policy(),
      policy({ id: 'p2', displayName: 'Pilot', state: 'enabledForReportingButNotEnforced' }),
      policy({ id: 'p3', displayName: 'Old', state: 'disabled' })
    ]));

    expect(result.status).toBe('non_compliant');
    expect(result.actualResult.reportOnly).toBe(1);
    expect(result.actualResult.disabled).toBe(1);
    expect(result.evidence.failingEntities).toHaveLength(2);
    expect(result.score).toBe(33);
  });

  it('fails when the tenant has no policies at all', async () => {
    const result = await check(client([]));

    expect(result.status).toBe('non_compliant');
    expect(result.evidence.failingEntities[0].type).toBe('Tenant');
  });
});

describe('MAES-CA-02 exclusion inventory', () => {
  const check = conditionalAccess['MAES-CA-02'];

  it('passes when no policy excludes anything', async () => {
    const result = await check(client([policy()]));

    expect(result.status).toBe('compliant');
    expect(result.actualResult.excludedUsers).toBe(0);
  });

  it('resolves excluded user identities', async () => {
    const p = policy();
    p.conditions.users.excludeUsers = ['u1'];

    const result = await check(client([p, policy({ id: 'p2' })], {
      '/users/u1': { id: 'u1', displayName: 'Alice Admin', userPrincipalName: 'alice@contoso.com', accountEnabled: true }
    }));

    expect(result.status).toBe('non_compliant');
    expect(result.evidence.failingEntities[0].userPrincipalName).toBe('alice@contoso.com');
    expect(result.evidence.failingEntities[0].reason).toContain('1 of 2');
  });

  it('accepts up to two accounts excluded from every policy as break-glass', async () => {
    const p = policy();
    p.conditions.users.excludeUsers = ['u1', 'u2'];

    const result = await check(client([p], {
      '/users/u1': { id: 'u1', displayName: 'Break Glass 1', userPrincipalName: 'bg1@contoso.com' },
      '/users/u2': { id: 'u2', displayName: 'Break Glass 2', userPrincipalName: 'bg2@contoso.com' }
    }));

    expect(result.actualResult.likelyBreakGlassAccounts).toBe(2);
    expect(result.status).toBe('compliant');
  });

  it('flags more than two accounts excluded from every policy', async () => {
    const p = policy();
    p.conditions.users.excludeUsers = ['u1', 'u2', 'u3'];

    const result = await check(client([p], {
      '/users/u1': { id: 'u1', displayName: 'BG 1' },
      '/users/u2': { id: 'u2', displayName: 'BG 2' },
      '/users/u3': { id: 'u3', displayName: 'BG 3' }
    }));

    expect(result.status).toBe('non_compliant');
    expect(result.evidence.failingEntities).toHaveLength(3);
  });

  it('reports excluded groups and roles', async () => {
    const p = policy();
    p.conditions.users.excludeGroups = ['g1'];
    p.conditions.users.excludeRoles = ['r1'];

    const result = await check(client([p]));

    const types = result.evidence.failingEntities.map(e => e.type).sort();
    expect(types).toEqual(['DirectoryRole', 'Group']);
  });

  it('still reports the exclusion when the user object cannot be read', async () => {
    const p = policy();
    p.conditions.users.excludeUsers = ['missing'];

    const result = await check(client([p, policy({ id: 'p2' })]));

    expect(result.status).toBe('non_compliant');
    expect(result.evidence.failingEntities[0].displayName).toContain('Unresolved user');
  });
});
