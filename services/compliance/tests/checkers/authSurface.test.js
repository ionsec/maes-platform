const authSurface = require('../../src/services/checkers/authSurface');
const ctx = require('../../src/services/checkers/context');
const { createMockGraphClient } = require('../helpers/mockGraph');

const blockLegacyPolicy = (overrides = {}) => ({
  id: 'p-block-legacy',
  displayName: 'Block legacy authentication',
  state: 'enabled',
  conditions: {
    users: { includeUsers: ['All'], excludeUsers: [], excludeGroups: [], excludeRoles: [] },
    applications: { includeApplications: ['All'] },
    clientAppTypes: ['exchangeActiveSync', 'other']
  },
  grantControls: { builtInControls: ['block'] },
  ...overrides
});

function clientWithPolicies(policies) {
  const client = createMockGraphClient({
    '/identity/conditionalAccess/policies': policies
  });
  ctx.resetCache(client);
  return client;
}

describe('MAES-AUTH-01 ROPC blocked', () => {
  const check = authSurface['MAES-AUTH-01'];

  it('passes when an enabled policy blocks other clients for all users and apps', async () => {
    const result = await check(clientWithPolicies([blockLegacyPolicy()]));

    expect(result.status).toBe('compliant');
    expect(result.score).toBe(100);
    expect(result.evidence.failingEntities).toHaveLength(0);
  });

  it('fails when the blocking policy is only in report-only state', async () => {
    const reportOnly = blockLegacyPolicy({ state: 'enabledForReportingButNotEnforced' });
    const result = await check(clientWithPolicies([reportOnly]));

    expect(result.status).toBe('non_compliant');
    expect(result.evidence.failingEntities).toHaveLength(1);
    expect(result.evidence.failingEntities[0].reason).toContain('enabledForReportingButNotEnforced');
  });

  it('fails when no policy targets other clients', async () => {
    const mfaOnly = blockLegacyPolicy({
      id: 'p-mfa',
      displayName: 'Require MFA',
      conditions: {
        users: { includeUsers: ['All'] },
        applications: { includeApplications: ['All'] },
        clientAppTypes: ['browser', 'mobileAppsAndDesktopClients']
      },
      grantControls: { builtInControls: ['mfa'] }
    });

    const result = await check(clientWithPolicies([mfaOnly]));

    expect(result.status).toBe('non_compliant');
    expect(result.evidence.failingEntities[0].type).toBe('Tenant');
  });

  it('does not count a policy scoped to a single application', async () => {
    const scoped = blockLegacyPolicy({
      conditions: {
        ...blockLegacyPolicy().conditions,
        applications: { includeApplications: ['00000002-0000-0ff1-ce00-000000000000'] }
      }
    });

    const result = await check(clientWithPolicies([scoped]));

    expect(result.status).toBe('non_compliant');
  });
});

describe('MAES-AUTH-02 legacy authentication blocked', () => {
  const check = authSurface['MAES-AUTH-02'];

  it('passes with an enabled tenant-wide block policy', async () => {
    const result = await check(clientWithPolicies([blockLegacyPolicy()]));

    expect(result.status).toBe('compliant');
    expect(result.actualResult.principalsExcludedFromBlock).toBe(0);
  });

  it('still passes but reports exclusions on the blocking policy', async () => {
    const withExclusions = blockLegacyPolicy({
      conditions: {
        ...blockLegacyPolicy().conditions,
        users: {
          includeUsers: ['All'],
          excludeUsers: ['u1', 'u2'],
          excludeGroups: ['g1'],
          excludeRoles: []
        }
      }
    });

    const result = await check(clientWithPolicies([withExclusions]));

    expect(result.status).toBe('compliant');
    expect(result.actualResult.principalsExcludedFromBlock).toBe(3);
    expect(result.evidence.note).toContain('MAES-CA-02');
  });

  it('fails when there are no policies at all', async () => {
    const result = await check(clientWithPolicies([]));

    expect(result.status).toBe('non_compliant');
    expect(result.score).toBe(0);
    expect(result.remediationGuidance).toContain('Conditional Access policy blocking legacy authentication');
  });
});
