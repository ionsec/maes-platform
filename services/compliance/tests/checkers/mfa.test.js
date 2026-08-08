const mfa = require('../../src/services/checkers/mfa');
const ctx = require('../../src/services/checkers/context');
const { createMockGraphClient } = require('../helpers/mockGraph');

const USERS = [
  { id: 'u1', displayName: 'Alice Admin', userPrincipalName: 'alice@contoso.com', accountEnabled: true, userType: 'Member' },
  { id: 'u2', displayName: 'Bob User', userPrincipalName: 'bob@contoso.com', accountEnabled: true, userType: 'Member' },
  { id: 'u3', displayName: 'Disabled Dave', userPrincipalName: 'dave@contoso.com', accountEnabled: false, userType: 'Member' },
  { id: 'u4', displayName: 'Guest Grace', userPrincipalName: 'grace@partner.com', accountEnabled: true, userType: 'Guest' }
];

function client(routes) {
  const c = createMockGraphClient({ '/users': USERS, ...routes });
  ctx.resetCache(c);
  return c;
}

describe('MAES-MFA-01 registration coverage', () => {
  const check = mfa['MAES-MFA-01'];

  it('counts only enabled member users', async () => {
    const c = client({
      '/reports/authenticationMethods/userRegistrationDetails': [
        { id: 'u1', userPrincipalName: 'alice@contoso.com', isMfaRegistered: true, methodsRegistered: ['fido2SecurityKey'] },
        { id: 'u2', userPrincipalName: 'bob@contoso.com', isMfaRegistered: true, methodsRegistered: ['microsoftAuthenticatorPush'] }
      ]
    });

    const result = await check(c);

    expect(result.status).toBe('compliant');
    expect(result.actualResult.enabledMemberUsers).toBe(2);
  });

  it('flags a user with no registered method', async () => {
    const c = client({
      '/reports/authenticationMethods/userRegistrationDetails': [
        { id: 'u1', userPrincipalName: 'alice@contoso.com', isMfaRegistered: true, methodsRegistered: ['fido2SecurityKey'] },
        { id: 'u2', userPrincipalName: 'bob@contoso.com', isMfaRegistered: false, methodsRegistered: [] }
      ]
    });

    const result = await check(c);

    expect(result.status).toBe('non_compliant');
    expect(result.score).toBe(50);
    expect(result.evidence.failingEntities).toHaveLength(1);
    expect(result.evidence.failingEntities[0].userPrincipalName).toBe('bob@contoso.com');
  });

  it('flags a user missing from the report rather than assuming compliance', async () => {
    const c = client({
      '/reports/authenticationMethods/userRegistrationDetails': [
        { id: 'u1', userPrincipalName: 'alice@contoso.com', isMfaRegistered: true, methodsRegistered: ['fido2SecurityKey'] }
      ]
    });

    const result = await check(c);

    expect(result.status).toBe('non_compliant');
    expect(result.actualResult.missingFromReport).toBe(1);
    expect(result.evidence.failingEntities[0].reason).toContain('registration report');
  });

  it('matches by UPN when the report carries no id', async () => {
    const c = client({
      '/reports/authenticationMethods/userRegistrationDetails': [
        { userPrincipalName: 'Alice@contoso.com', isMfaRegistered: true, methodsRegistered: ['fido2SecurityKey'] },
        { userPrincipalName: 'bob@contoso.com', isMfaRegistered: true, methodsRegistered: ['microsoftAuthenticatorPush'] }
      ]
    });

    expect((await check(c)).status).toBe('compliant');
  });
});

describe('MAES-MFA-02 phishing-resistant methods for privileged roles', () => {
  const check = mfa['MAES-MFA-02'];

  const rolesRoute = {
    '/directoryRoles': [
      { id: 'r1', displayName: 'Global Administrator' },
      { id: 'r2', displayName: 'Message Center Reader' }
    ],
    '/directoryRoles/r1/members': [
      { id: 'u1', displayName: 'Alice Admin', userPrincipalName: 'alice@contoso.com', '@odata.type': '#microsoft.graph.user' }
    ],
    '/directoryRoles/r2/members': [
      { id: 'u2', displayName: 'Bob User', userPrincipalName: 'bob@contoso.com', '@odata.type': '#microsoft.graph.user' }
    ]
  };

  it('passes when a privileged holder has a FIDO2 key', async () => {
    const c = client({
      ...rolesRoute,
      '/reports/authenticationMethods/userRegistrationDetails': [
        { id: 'u1', userPrincipalName: 'alice@contoso.com', isMfaRegistered: true, methodsRegistered: ['fido2SecurityKey'] }
      ]
    });

    const result = await check(c);

    expect(result.status).toBe('compliant');
    expect(result.actualResult.privilegedRoleHolders).toBe(1);
  });

  it('fails when the only method is push notification', async () => {
    const c = client({
      ...rolesRoute,
      '/reports/authenticationMethods/userRegistrationDetails': [
        { id: 'u1', userPrincipalName: 'alice@contoso.com', isMfaRegistered: true, methodsRegistered: ['microsoftAuthenticatorPush', 'mobilePhone'] }
      ]
    });

    const result = await check(c);

    expect(result.status).toBe('non_compliant');
    expect(result.evidence.failingEntities[0].reason).toContain('phishing-resistant');
  });

  it('ignores non-privileged roles', async () => {
    const c = client({
      ...rolesRoute,
      '/reports/authenticationMethods/userRegistrationDetails': [
        { id: 'u1', userPrincipalName: 'alice@contoso.com', isMfaRegistered: true, methodsRegistered: ['fido2SecurityKey'] }
      ]
    });

    const result = await check(c);

    // Bob holds only Message Center Reader and must not appear.
    expect(result.actualResult.privilegedRoleHolders).toBe(1);
    expect(result.actualResult.rolesInspected).toEqual(['Global Administrator']);
  });

  it('skips group and service principal role members', async () => {
    const c = client({
      '/directoryRoles': [{ id: 'r1', displayName: 'Global Administrator' }],
      '/directoryRoles/r1/members': [
        { id: 'sp1', displayName: 'Some App', '@odata.type': '#microsoft.graph.servicePrincipal' }
      ],
      '/reports/authenticationMethods/userRegistrationDetails': []
    });

    expect((await check(c)).status).toBe('not_applicable');
  });
});

describe('MAES-MFA-03 policy coverage', () => {
  const check = mfa['MAES-MFA-03'];

  const mfaPolicy = (overrides = {}) => ({
    id: 'p1',
    displayName: 'Require MFA for all users',
    state: 'enabled',
    conditions: {
      users: { includeUsers: ['All'], excludeUsers: [], excludeGroups: [], excludeRoles: [] },
      applications: { includeApplications: ['All'] },
      clientAppTypes: []
    },
    grantControls: { builtInControls: ['mfa'] },
    ...overrides
  });

  it('passes when a blanket policy has no exclusions', async () => {
    const c = client({ '/identity/conditionalAccess/policies': [mfaPolicy()] });

    const result = await check(c);

    expect(result.status).toBe('compliant');
    expect(result.actualResult.usersOutsideAllMfaPolicies).toBe(0);
  });

  it('fails when there is no MFA-enforcing policy', async () => {
    const c = client({ '/identity/conditionalAccess/policies': [] });

    const result = await check(c);

    expect(result.status).toBe('non_compliant');
    expect(result.actualResult.usersOutsideAllMfaPolicies).toBe(2);
  });

  it('flags a user excluded from the only blanket policy', async () => {
    const policy = mfaPolicy();
    policy.conditions.users.excludeUsers = ['u2'];
    const c = client({ '/identity/conditionalAccess/policies': [policy] });

    const result = await check(c);

    expect(result.status).toBe('non_compliant');
    expect(result.evidence.failingEntities).toHaveLength(1);
    expect(result.evidence.failingEntities[0].id).toBe('u2');
  });

  it('does not flag a user excluded from only one of two blanket policies', async () => {
    const first = mfaPolicy();
    first.conditions.users.excludeUsers = ['u2'];
    const second = mfaPolicy({ id: 'p2', displayName: 'Backup MFA policy' });

    const c = client({ '/identity/conditionalAccess/policies': [first, second] });

    const result = await check(c);

    expect(result.status).toBe('compliant');
  });

  it('resolves excluded groups to their members', async () => {
    const policy = mfaPolicy();
    policy.conditions.users.excludeGroups = ['g1'];

    const c = client({
      '/identity/conditionalAccess/policies': [policy],
      '/groups/g1/members': [{ id: 'u1', displayName: 'Alice Admin', userPrincipalName: 'alice@contoso.com' }]
    });

    const result = await check(c);

    expect(result.status).toBe('non_compliant');
    expect(result.evidence.failingEntities.map(e => e.id)).toEqual(['u1']);
  });

  it('requires manual review when MFA is enforced only for specific groups', async () => {
    const scoped = mfaPolicy({
      conditions: {
        users: { includeUsers: [], includeGroups: ['g1'], excludeUsers: [], excludeGroups: [], excludeRoles: [] },
        applications: { includeApplications: ['All'] },
        clientAppTypes: []
      }
    });

    const c = client({ '/identity/conditionalAccess/policies': [scoped] });

    expect((await check(c)).status).toBe('manual_review');
  });

  it('accepts an authentication strength reference as an MFA requirement', async () => {
    const strength = mfaPolicy({
      grantControls: { builtInControls: [], authenticationStrength: { id: 'strength-1' } }
    });

    const c = client({ '/identity/conditionalAccess/policies': [strength] });

    expect((await check(c)).status).toBe('compliant');
  });
});
