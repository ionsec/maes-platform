const {
  diffFindings,
  diffAttackPaths,
  assessComparability,
  countBySeverity,
  findingKey
} = require('../../src/recon/comparison');

const finding = (overrides = {}) => ({
  id: 'f1',
  finding_id: 'MAIL-SPF-MISSING',
  target: 'contoso.com',
  severity: 'medium',
  is_lead: false,
  ...overrides
});

describe('finding identity', () => {
  it('keys on the catalog id and the target together', () => {
    expect(findingKey(finding())).toBe('MAIL-SPF-MISSING::contoso.com');
  });

  it('treats the same finding on two hosts as two separate problems', () => {
    const a = finding({ finding_id: 'SUBDOMAIN-TAKEOVER-CANDIDATE', target: 'old.contoso.com' });
    const b = finding({ finding_id: 'SUBDOMAIN-TAKEOVER-CANDIDATE', target: 'legacy.contoso.com' });

    const diff = diffFindings([a], [a, b]);

    expect(diff.added).toHaveLength(1);
    expect(diff.added[0].target).toBe('legacy.contoso.com');
    expect(diff.persisting).toHaveLength(1);
  });
});

describe('finding drift', () => {
  it('classifies added, resolved and persisting findings', () => {
    const stays = finding({ target: 'a.com' });
    const goes = finding({ target: 'b.com' });
    const arrives = finding({ target: 'c.com' });

    const diff = diffFindings([stays, goes], [stays, arrives]);

    expect(diff.persisting.map(f => f.target)).toEqual(['a.com']);
    expect(diff.resolved.map(f => f.target)).toEqual(['b.com']);
    expect(diff.added.map(f => f.target)).toEqual(['c.com']);
  });

  it('reports a severity change separately from persistence', () => {
    const before = finding({ severity: 'low' });
    const after = finding({ severity: 'critical' });

    const diff = diffFindings([before], [after]);

    expect(diff.persisting).toHaveLength(0);
    expect(diff.severityChanged).toHaveLength(1);
    expect(diff.severityChanged[0]).toMatchObject({
      previousSeverity: 'low',
      severity: 'critical',
      direction: 'worsened'
    });
  });

  it('recognises a severity downgrade as an improvement', () => {
    const diff = diffFindings(
      [finding({ severity: 'critical' })],
      [finding({ severity: 'low' })]
    );

    expect(diff.severityChanged[0].direction).toBe('improved');
  });

  it('orders each list most severe first', () => {
    const diff = diffFindings([], [
      finding({ target: 'a', severity: 'low' }),
      finding({ target: 'b', severity: 'critical' }),
      finding({ target: 'c', severity: 'medium' })
    ]);

    expect(diff.added.map(f => f.severity)).toEqual(['critical', 'medium', 'low']);
  });

  it('handles an empty baseline as everything being new', () => {
    const diff = diffFindings([], [finding()]);

    expect(diff.added).toHaveLength(1);
    expect(diff.resolved).toHaveLength(0);
  });

  it('handles an empty current scan as everything being resolved', () => {
    const diff = diffFindings([finding()], []);

    expect(diff.resolved).toHaveLength(1);
    expect(diff.added).toHaveLength(0);
  });
});

describe('attack path drift', () => {
  it('tracks paths by template id', () => {
    const golden = { path_id: 'GOLDEN-SAML' };
    const spray = { path_id: 'SPRAY-TO-TENANT' };
    const exfil = { path_id: 'ANON-DATA-EXFIL' };

    const diff = diffAttackPaths([golden, spray], [golden, exfil]);

    expect(diff.persisting.map(p => p.path_id)).toEqual(['GOLDEN-SAML']);
    expect(diff.resolved.map(p => p.path_id)).toEqual(['SPRAY-TO-TENANT']);
    expect(diff.added.map(p => p.path_id)).toEqual(['ANON-DATA-EXFIL']);
  });
});

describe('severity counts', () => {
  it('excludes leads, which reappear on every scan', () => {
    const counts = countBySeverity([
      finding({ severity: 'high' }),
      finding({ severity: 'info', is_lead: true })
    ]);

    expect(counts.high).toBe(1);
    expect(counts.info).toBe(0);
  });
});

describe('comparability warnings', () => {
  const scan = (overrides = {}) => ({
    seed_domain: 'contoso.com',
    profile: 'standard',
    metadata: {},
    ...overrides
  });

  it('stays silent for two like-for-like scans', () => {
    expect(assessComparability(scan(), scan())).toEqual([]);
  });

  it('warns when the profiles differ, since missing checks look like resolved findings', () => {
    const warnings = assessComparability(scan({ profile: 'passive' }), scan({ profile: 'aggressive' }));

    expect(warnings.join(' ')).toMatch(/different profiles/);
    expect(warnings.join(' ')).toMatch(/not a change in the environment/);
  });

  it('warns when the seed domains differ', () => {
    const warnings = assessComparability(scan(), scan({ seed_domain: 'fabrikam.com' }));

    expect(warnings.join(' ')).toMatch(/different seed domains/);
  });

  it('warns when either scan had a failed certificate transparency lookup', () => {
    const warnings = assessComparability(
      scan({ metadata: { certTransparencyFailed: true } }),
      scan()
    );

    expect(warnings.join(' ')).toMatch(/baseline scan's certificate transparency lookup failed/);
  });

  it('warns when either scan ran out of probe budget', () => {
    const warnings = assessComparability(scan(), scan({ metadata: { probeBudgetExhausted: true } }));

    expect(warnings.join(' ')).toMatch(/current scan exhausted its probe budget/);
  });
});
