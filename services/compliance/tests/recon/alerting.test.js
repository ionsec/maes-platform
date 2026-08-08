const db = require('../../src/services/database');
const {
  raiseAlertsForScan,
  truncate,
  ALERTING_SEVERITIES
} = require('../../src/recon/alerting');

const SCAN = {
  id: 'scan-2',
  organization_id: 'org-1',
  seed_domain: 'contoso.com',
  profile: 'standard',
  completed_at: '2026-02-01T00:00:00.000Z'
};

const PREVIOUS = { ...SCAN, id: 'scan-1', completed_at: '2026-01-01T00:00:00.000Z' };

const finding = (overrides = {}) => ({
  id: 'f1',
  finding_id: 'AZURE-STORAGE-PUBLIC-CONTAINER',
  phase: 'azure_surface',
  title: 'Public container',
  description: 'desc',
  severity: 'critical',
  tags: ['DATA-EXPOSURE'],
  target: 'https://acct.blob.core.windows.net/',
  evidence: {},
  impact: 'impact',
  remediation: 'fix it',
  mitre_technique: 'T1530',
  is_lead: false,
  ...overrides
});

/**
 * Stub the three reads and one write the alerter performs.
 * Returns the alert rows it attempted to insert.
 */
function stubDb({ previousScan = PREVIOUS, previousFindings = [], previousPaths = [] } = {}) {
  const inserted = [];

  jest.spyOn(db, 'getRow').mockImplementation(async () => previousScan);

  jest.spyOn(db, 'getRows').mockImplementation(async (sql) => {
    if (/recon_findings/.test(sql)) return previousFindings;
    if (/recon_attack_paths/.test(sql)) return previousPaths;
    return [];
  });

  jest.spyOn(db, 'insert').mockImplementation(async (sql, params) => {
    inserted.push({
      organizationId: params[0],
      severity: params[1],
      type: params[2],
      category: params[3],
      title: params[4],
      description: params[5],
      source: JSON.parse(params[6]),
      affectedEntities: JSON.parse(params[7]),
      evidence: JSON.parse(params[8]),
      mitreAttack: JSON.parse(params[9]),
      recommendations: JSON.parse(params[10]),
      tags: params[11],
      metadata: JSON.parse(params[12])
    });
    return { id: `alert-${inserted.length}` };
  });

  return inserted;
}

afterEach(() => jest.restoreAllMocks());

describe('noise control', () => {
  it('does not re-alert on a finding that was already present', async () => {
    const standing = finding();
    const inserted = stubDb({ previousFindings: [standing] });

    const result = await raiseAlertsForScan(SCAN, [standing], []);

    expect(inserted).toHaveLength(0);
    expect(result.reason).toBe('drift');
  });

  it('alerts on a newly-appeared critical finding', async () => {
    const inserted = stubDb({ previousFindings: [] });

    await raiseAlertsForScan(SCAN, [finding()], []);

    expect(inserted).toHaveLength(1);
    expect(inserted[0].severity).toBe('critical');
    expect(inserted[0].title).toMatch(/^New external exposure/);
  });

  it('stays silent for a new finding below high severity', async () => {
    const inserted = stubDb({ previousFindings: [] });

    await raiseAlertsForScan(SCAN, [finding({ severity: 'low' }), finding({ severity: 'medium' })], []);

    expect(inserted).toHaveLength(0);
  });

  it('never alerts on leads, which recur on every scan', async () => {
    const inserted = stubDb({ previousFindings: [] });

    await raiseAlertsForScan(SCAN, [
      finding({ finding_id: 'LEAD-CODE-SEARCH', severity: 'critical', is_lead: true })
    ], []);

    expect(inserted).toHaveLength(0);
  });

  it('alerts when a known finding escalates into high severity', async () => {
    const before = finding({ severity: 'medium' });
    const after = finding({ severity: 'critical' });
    const inserted = stubDb({ previousFindings: [before] });

    await raiseAlertsForScan(SCAN, [after], []);

    expect(inserted).toHaveLength(1);
    expect(inserted[0].title).toMatch(/escalated to critical/);
    expect(inserted[0].metadata.previousSeverity).toBe('medium');
  });

  it('does not alert when a finding de-escalates', async () => {
    const inserted = stubDb({ previousFindings: [finding({ severity: 'critical' })] });

    await raiseAlertsForScan(SCAN, [finding({ severity: 'low' })], []);

    expect(inserted).toHaveLength(0);
  });

  it('does not alert on a resolved finding', async () => {
    const inserted = stubDb({ previousFindings: [finding()] });

    await raiseAlertsForScan(SCAN, [], []);

    expect(inserted).toHaveLength(0);
  });

  it('treats the same finding on a different host as new', async () => {
    const inserted = stubDb({ previousFindings: [finding({ target: 'https://a.blob.core.windows.net/' })] });

    await raiseAlertsForScan(SCAN, [finding({ target: 'https://b.blob.core.windows.net/' })], []);

    expect(inserted).toHaveLength(1);
  });
});

describe('attack path alerts', () => {
  const path = (overrides = {}) => ({
    id: 'p1',
    path_id: 'ANON-DATA-EXFIL',
    name: 'Unauthenticated data exfiltration',
    severity: 'critical',
    effort: 'low',
    blast_radius: 'everything',
    trigger_tags: ['DATA-EXPOSURE'],
    narrative: 'narrative',
    mitre_techniques: ['T1530'],
    ...overrides
  });

  it('alerts on a newly-assembled chain', async () => {
    const inserted = stubDb({ previousPaths: [] });

    await raiseAlertsForScan(SCAN, [], [path()]);

    expect(inserted).toHaveLength(1);
    expect(inserted[0].title).toMatch(/^New attack path/);
    expect(inserted[0].tags).toContain('attack-path');
  });

  it('does not re-alert on a chain that already existed', async () => {
    const existing = path();
    const inserted = stubDb({ previousPaths: [existing] });

    await raiseAlertsForScan(SCAN, [], [existing]);

    expect(inserted).toHaveLength(0);
  });

  it('grades a non-critical chain as high, since a walkable route is not a low finding', async () => {
    const inserted = stubDb({ previousPaths: [] });

    await raiseAlertsForScan(SCAN, [], [path({ severity: 'medium' })]);

    expect(inserted[0].severity).toBe('high');
  });
});

describe('baseline scan', () => {
  it('raises one summary alert rather than one per finding', async () => {
    const inserted = stubDb({ previousScan: null });

    const result = await raiseAlertsForScan(SCAN, [
      finding({ id: 'a', target: 'a' }),
      finding({ id: 'b', target: 'b' }),
      finding({ id: 'c', target: 'c', severity: 'high' })
    ], []);

    expect(result.reason).toBe('baseline');
    expect(inserted).toHaveLength(1);
    expect(inserted[0].title).toMatch(/^Baseline external exposure/);
    expect(inserted[0].metadata.findingCount).toBe(3);
    expect(inserted[0].source.isBaseline).toBe(true);
  });

  it('raises nothing when a baseline scan finds nothing severe', async () => {
    const inserted = stubDb({ previousScan: null });

    await raiseAlertsForScan(SCAN, [finding({ severity: 'low' })], []);

    expect(inserted).toHaveLength(0);
  });

  it('grades the summary critical when any finding is critical', async () => {
    const inserted = stubDb({ previousScan: null });

    await raiseAlertsForScan(SCAN, [finding({ severity: 'high' }), finding({ id: 'b', target: 'b' })], []);

    expect(inserted[0].severity).toBe('critical');
  });
});

describe('alert shape', () => {
  it('writes ATT&CK ids where the SIEM export path reads them', async () => {
    const inserted = stubDb({ previousFindings: [] });

    await raiseAlertsForScan(SCAN, [finding()], []);

    // siemService selects mitre_attack->'techniques' as a flat array.
    expect(inserted[0].mitreAttack).toEqual({ techniques: ['T1530'] });
  });

  it('records the scan and its predecessor so the alert is traceable', async () => {
    const inserted = stubDb({ previousFindings: [] });

    await raiseAlertsForScan(SCAN, [finding()], []);

    expect(inserted[0].source).toMatchObject({
      component: 'external_exposure',
      scanId: 'scan-2',
      previousScanId: 'scan-1',
      seedDomain: 'contoso.com'
    });
  });

  it('carries the remediation through as a recommendation', async () => {
    const inserted = stubDb({ previousFindings: [] });

    await raiseAlertsForScan(SCAN, [finding()], []);

    expect(inserted[0].recommendations).toEqual(['fix it']);
  });

  it('explains that the exposure is new relative to the previous scan', async () => {
    const inserted = stubDb({ previousFindings: [] });

    await raiseAlertsForScan(SCAN, [finding()], []);

    expect(inserted[0].description).toMatch(/not present in the previous scan/);
  });
});

describe('title truncation', () => {
  it('leaves a short title alone', () => {
    expect(truncate('short', 255)).toBe('short');
  });

  it('truncates a long title so the insert cannot be rejected by the column limit', () => {
    const long = 'x'.repeat(400);
    const result = truncate(long, 255);

    expect(result).toHaveLength(255);
    expect(result.endsWith('…')).toBe(true);
  });

  it('applies the limit to a real over-long finding title', async () => {
    const inserted = stubDb({ previousFindings: [] });

    await raiseAlertsForScan(SCAN, [finding({ title: 'y'.repeat(400) })], []);

    expect(inserted[0].title.length).toBeLessThanOrEqual(255);
  });
});

describe('alerting severities', () => {
  it('covers only high and critical, matching the alert severity enum', () => {
    expect([...ALERTING_SEVERITIES].sort()).toEqual(['critical', 'high']);
  });
});
