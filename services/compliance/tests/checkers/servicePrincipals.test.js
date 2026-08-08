const sp = require('../../src/services/checkers/servicePrincipals');
const ctx = require('../../src/services/checkers/context');
const { createMockGraphClient } = require('../helpers/mockGraph');

const GRAPH_APP_ID = '00000003-0000-0000-c000-000000000000';

const GRAPH_SP = {
  id: 'graph-sp',
  appId: GRAPH_APP_ID,
  displayName: 'Microsoft Graph',
  appRoles: [
    { id: 'role-rolemgmt', value: 'RoleManagement.ReadWrite.Directory' },
    { id: 'role-mailread', value: 'Mail.Read' },
    { id: 'role-userread', value: 'User.Read.All' }
  ]
};

function client({ servicePrincipals = [], assignments = [], includeGraphSp = true } = {}) {
  const c = createMockGraphClient({
    '/servicePrincipals': includeGraphSp ? [GRAPH_SP, ...servicePrincipals] : servicePrincipals,
    [`/servicePrincipals/${GRAPH_SP.id}/appRoleAssignedTo`]: assignments
  });
  ctx.resetCache(c);
  return c;
}

describe('MAES-SP-01 high-privilege application permissions', () => {
  const check = sp['MAES-SP-01'];

  it('flags a service principal holding a tenant-takeover permission', async () => {
    const c = client({
      servicePrincipals: [{ id: 'sp1', appId: 'app-1', displayName: 'Backup Tool', accountEnabled: true }],
      assignments: [
        { principalId: 'sp1', principalDisplayName: 'Backup Tool', appRoleId: 'role-rolemgmt' }
      ]
    });

    const result = await check(c);

    expect(result.status).toBe('non_compliant');
    expect(result.evidence.failingEntities).toHaveLength(1);
    expect(result.evidence.failingEntities[0].permissions[0].permission)
      .toBe('RoleManagement.ReadWrite.Directory');
  });

  it('ignores permissions outside the high-privilege list', async () => {
    const c = client({
      servicePrincipals: [{ id: 'sp1', appId: 'app-1', displayName: 'Directory Reader' }],
      assignments: [{ principalId: 'sp1', appRoleId: 'role-userread' }]
    });

    expect((await check(c)).status).toBe('compliant');
  });

  it('groups several grants under one service principal', async () => {
    const c = client({
      servicePrincipals: [{ id: 'sp1', appId: 'app-1', displayName: 'Overreaching App' }],
      assignments: [
        { principalId: 'sp1', appRoleId: 'role-rolemgmt' },
        { principalId: 'sp1', appRoleId: 'role-mailread' }
      ]
    });

    const result = await check(c);

    expect(result.evidence.failingEntities).toHaveLength(1);
    expect(result.evidence.failingEntities[0].permissions).toHaveLength(2);
  });

  it('errors rather than passing when the Graph service principal cannot be resolved', async () => {
    const c = client({ includeGraphSp: false, servicePrincipals: [] });

    const result = await check(c);

    expect(result.status).toBe('error');
    expect(result.error).toContain('Microsoft Graph service principal');
  });

  it('names the principal from the assignment when the directory object is absent', async () => {
    const c = client({
      servicePrincipals: [],
      assignments: [{ principalId: 'sp-unknown', principalDisplayName: 'Ghost App', appRoleId: 'role-rolemgmt' }]
    });

    const result = await check(c);

    expect(result.evidence.failingEntities[0].displayName).toBe('Ghost App');
  });
});

describe('MAES-SP-02 credential hygiene', () => {
  const check = sp['MAES-SP-02'];
  const day = 24 * 60 * 60 * 1000;

  function withCredentials(credentials) {
    const c = createMockGraphClient({ '/servicePrincipals': [{ id: 'sp1', appId: 'app-1', displayName: 'App One', ...credentials }] });
    ctx.resetCache(c);
    return c;
  }

  it('passes on a short-lived, current secret', async () => {
    const now = Date.now();
    const c = withCredentials({
      passwordCredentials: [{
        keyId: 'k1',
        startDateTime: new Date(now - 30 * day).toISOString(),
        endDateTime: new Date(now + 60 * day).toISOString()
      }]
    });

    const result = await check(c);

    expect(result.status).toBe('compliant');
    expect(result.actualResult.totalCredentials).toBe(1);
  });

  it('flags an expired credential', async () => {
    const now = Date.now();
    const c = withCredentials({
      passwordCredentials: [{
        keyId: 'k1',
        startDateTime: new Date(now - 400 * day).toISOString(),
        endDateTime: new Date(now - 10 * day).toISOString()
      }]
    });

    const result = await check(c);

    expect(result.status).toBe('non_compliant');
    expect(result.actualResult.expiredCredentials).toBe(1);
  });

  it('flags a credential with an excessive lifetime', async () => {
    const now = Date.now();
    const c = withCredentials({
      keyCredentials: [{
        keyId: 'k2',
        startDateTime: new Date(now - 10 * day).toISOString(),
        endDateTime: new Date(now + 800 * day).toISOString()
      }]
    });

    const result = await check(c);

    expect(result.status).toBe('non_compliant');
    expect(result.actualResult.longLivedCredentials).toBe(1);
    expect(result.evidence.failingEntities[0].credentialType).toBe('certificate');
  });

  it('passes when there are no credentials at all', async () => {
    const c = withCredentials({});

    const result = await check(c);

    expect(result.status).toBe('compliant');
    expect(result.score).toBe(100);
  });
});
