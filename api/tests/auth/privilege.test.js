const { isSuperAdminRole, requireSuperAdmin } = require('../../src/middleware/auth');

/**
 * The boundary between `admin` and `super_admin`.
 *
 * These two roles were previously treated as equivalent, which let any
 * organization admin reach system-level operations and read any other
 * organization's data. The role model
 * (database/migrations/012_simplify_rbac_roles.sql) defines `admin` as scoped
 * to its own organization, so these tests pin that down.
 */

describe('isSuperAdminRole', () => {
  it('accepts super_admin', () => {
    expect(isSuperAdminRole({ role: 'super_admin' })).toBe(true);
  });

  it.each(['admin', 'analyst', 'viewer', 'service', '', null, undefined])(
    'rejects %p',
    (role) => {
      expect(isSuperAdminRole({ role })).toBe(false);
    }
  );

  it('rejects a missing user rather than throwing', () => {
    expect(isSuperAdminRole(undefined)).toBe(false);
    expect(isSuperAdminRole(null)).toBe(false);
  });

  it('does not accept a role that merely contains the string', () => {
    expect(isSuperAdminRole({ role: 'not_super_admin' })).toBe(false);
    expect(isSuperAdminRole({ role: 'super_administrator' })).toBe(false);
  });
});

describe('requireSuperAdmin', () => {
  const runMiddleware = (user) => {
    const req = { user };
    const res = {
      statusCode: null,
      body: null,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.body = payload; return this; }
    };
    let nextCalled = false;
    requireSuperAdmin()(req, res, () => { nextCalled = true; });
    return { res, nextCalled };
  };

  it('lets a super_admin through', () => {
    const { nextCalled } = runMiddleware({ id: 'u1', role: 'super_admin' });
    expect(nextCalled).toBe(true);
  });

  it('refuses an organization admin', () => {
    const { res, nextCalled } = runMiddleware({ id: 'u2', role: 'admin' });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it.each(['analyst', 'viewer'])('refuses %s', (role) => {
    const { res, nextCalled } = runMiddleware({ id: 'u3', role });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it('requires authentication before evaluating the role', () => {
    const { res, nextCalled } = runMiddleware(undefined);

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });
});
