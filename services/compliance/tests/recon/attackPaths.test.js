const { buildAttackPaths } = require('../../src/recon/attackPaths');
const { CATALOG, buildFinding, severityRank } = require('../../src/recon/findings/catalog');

const finding = (id, tags, extra = {}) => ({ id, tags, ...extra });

describe('finding catalog', () => {
  it('gives every entry a severity, impact and remediation', () => {
    // Report every incomplete entry at once rather than failing on the first.
    const incomplete = Object.entries(CATALOG)
      .filter(([, entry]) =>
        !['critical', 'high', 'medium', 'low', 'info'].includes(entry.severity)
        || !entry.impact
        || !entry.remediation
        || !Array.isArray(entry.tags))
      .map(([id]) => id);

    expect(incomplete).toEqual([]);
  });

  it('refuses to build an unknown finding rather than inventing one', () => {
    expect(() => buildFinding('NOT-A-REAL-FINDING', { phase: 'x' }))
      .toThrow(/Unknown finding id/);
  });

  it('carries the catalog metadata onto the built finding', () => {
    const built = buildFinding('AZURE-STORAGE-PUBLIC-CONTAINER', {
      phase: 'azure_surface',
      target: 'https://x.blob.core.windows.net/'
    });

    expect(built.severity).toBe('critical');
    expect(built.tags).toContain('ANON-READ');
    expect(built.impact).toBeTruthy();
    expect(built.mitreTechnique).toBe('T1530');
  });

  it('marks LEAD-tagged entries as leads automatically', () => {
    expect(buildFinding('LEAD-CODE-SEARCH', { phase: 'leads' }).isLead).toBe(true);
    expect(buildFinding('MAIL-SPF-MISSING', { phase: 'dns_surface' }).isLead).toBe(false);
  });

  it('appends a suffix so repeated findings are distinguishable', () => {
    const built = buildFinding('MAIL-SPF-MISSING', { phase: 'dns_surface', titleSuffix: 'contoso.com' });
    expect(built.title).toMatch(/: contoso\.com$/);
  });
});

describe('attack path assembly', () => {
  it('requires every trigger tag to be present', () => {
    // FED-ADFS-DETECTED alone is not enough for the Golden SAML chain.
    const paths = buildAttackPaths([finding('1', ['FED-ADFS-DETECTED'])]);
    expect(paths.map(p => p.pathId)).not.toContain('GOLDEN-SAML');
  });

  it('assembles the Golden SAML chain when both conditions hold', () => {
    const paths = buildAttackPaths([
      finding('1', ['FED-ADFS-DETECTED']),
      finding('2', ['FED-ADFS-DETECTED', 'FED-ADFS-MEX-EXPOSED'])
    ]);

    const golden = paths.find(p => p.pathId === 'GOLDEN-SAML');
    expect(golden).toBeDefined();
    expect(golden.matchedFindingIds).toEqual(['1', '2']);
    expect(golden.mitreTechniques).toContain('T1606.002');
  });

  it('adapts the spraying narrative to what was actually found', () => {
    const withoutEnum = buildAttackPaths([finding('1', ['MFA-BYPASS-PATH', 'FED-WSTRUST-EXPOSED'])])
      .find(p => p.pathId === 'SPRAY-TO-TENANT');
    const withEnum = buildAttackPaths([
      finding('1', ['MFA-BYPASS-PATH', 'FED-WSTRUST-EXPOSED']),
      finding('2', ['USER-ENUM', 'MFA-BYPASS-PATH'])
    ]).find(p => p.pathId === 'SPRAY-TO-TENANT');

    expect(withoutEnum.narrative).not.toMatch(/validate/);
    expect(withEnum.narrative).toMatch(/validate a target list/);
    expect(withEnum.narrative).toMatch(/WS-Trust/);
  });

  it('names the affected targets in the exfiltration narrative', () => {
    const paths = buildAttackPaths([
      finding('1', ['DATA-EXPOSURE', 'ANON-READ'], { target: 'https://x.blob.core.windows.net/' })
    ]);

    const path = paths.find(p => p.pathId === 'ANON-DATA-EXFIL');
    expect(path.narrative).toContain('https://x.blob.core.windows.net/');
    expect(path.severity).toBe('critical');
  });

  it('orders paths by severity', () => {
    const paths = buildAttackPaths([
      finding('1', ['MAIL-SPOOFABLE']),
      finding('2', ['DATA-EXPOSURE', 'ANON-READ']),
      finding('3', ['SUBDOMAIN-TAKEOVER'])
    ]);

    const ranks = paths.map(p => severityRank(p.severity));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(paths[0].pathId).toBe('ANON-DATA-EXFIL');
  });

  it('returns nothing when no chain is complete', () => {
    expect(buildAttackPaths([finding('1', ['SAAS-INVENTORY'])])).toEqual([]);
    expect(buildAttackPaths([])).toEqual([]);
  });
});
