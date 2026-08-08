const { ReconReportGenerator, csvCell } = require('../../src/recon/reconReportGenerator');

const generator = new ReconReportGenerator();

const scan = (overrides = {}) => ({
  id: 'scan-1',
  organization_name: 'Contoso',
  seed_domain: 'contoso.com',
  profile: 'standard',
  status: 'completed',
  total_probes: 42,
  completed_at: '2026-01-01T00:00:00.000Z',
  metadata: { phasesRun: ['tenant', 'dns_surface'], discoveredHostCount: 12 },
  ...overrides
});

const finding = (overrides = {}) => ({
  id: 'f1',
  finding_id: 'MAIL-SPF-MISSING',
  phase: 'dns_surface',
  title: 'No SPF record published: contoso.com',
  description: 'The domain publishes no SPF record.',
  severity: 'medium',
  tags: ['MAIL-SPOOFABLE'],
  target: 'contoso.com',
  evidence: { txtRecords: [] },
  impact: 'Receivers cannot reject forged mail.',
  remediation: 'Publish an SPF record.',
  mitre_technique: 'T1566',
  is_lead: false,
  ...overrides
});

describe('coverage caveats', () => {
  it('says so when the CT lookup failed', () => {
    const coverage = generator.buildCoverage(scan({
      metadata: { certTransparencyFailed: true, phasesRun: [] }
    }));

    expect(coverage.caveats.join(' ')).toMatch(/certificate transparency lookup failed/i);
  });

  it('says so when the probe budget ran out', () => {
    const coverage = generator.buildCoverage(scan({
      metadata: { probeBudgetExhausted: true, probeBudget: 1500, phasesRun: [] }
    }));

    expect(coverage.caveats.join(' ')).toMatch(/probe budget of 1500/);
  });

  it('reports truncation rather than presenting partial coverage as complete', () => {
    const coverage = generator.buildCoverage(scan({
      metadata: {
        phasesRun: [],
        truncation: { certTransparency: { found: 400, kept: 300 }, headerCheck: { found: 300, checked: 50 } }
      }
    }));

    const text = coverage.caveats.join(' ');
    expect(text).toMatch(/400 hostnames; the first 300/);
    expect(text).toMatch(/headers were checked on 50/);
  });

  it('names phases that failed', () => {
    const coverage = generator.buildCoverage(scan({
      metadata: { phasesRun: [], phaseErrors: [{ phase: 'azure_surface', error: 'timeout' }] }
    }));

    expect(coverage.caveats.join(' ')).toMatch(/'azure_surface' failed/);
  });

  it('notes what a non-aggressive scan did not look for', () => {
    expect(generator.buildCoverage(scan({ profile: 'passive' })).caveats.join(' '))
      .toMatch(/not evidence of their absence/);
    expect(generator.buildCoverage(scan({ profile: 'aggressive' })).caveats.join(' '))
      .not.toMatch(/not evidence of their absence/);
  });
});

describe('severity counting', () => {
  it('counts each severity independently', () => {
    const counts = generator.countBySeverity([
      finding({ severity: 'critical' }),
      finding({ severity: 'medium' }),
      finding({ severity: 'medium' })
    ]);

    expect(counts).toMatchObject({ critical: 1, high: 0, medium: 2, low: 0, info: 0 });
  });
});

describe('HTML report', () => {
  const data = {
    scan: scan(),
    findings: [finding()],
    exposures: [finding()],
    leads: [],
    attackPaths: [],
    authorization: null,
    probeLog: []
  };

  it('includes the finding, its impact and its remediation', () => {
    const html = generator.buildHTMLReport(data, {});

    expect(html).toContain('No SPF record published');
    expect(html).toContain('Receivers cannot reject forged mail.');
    expect(html).toContain('Publish an SPF record.');
    expect(html).toContain('T1566');
  });

  it('escapes content so a hostile finding target cannot inject markup', () => {
    const hostile = {
      ...data,
      findings: [finding({ title: '<script>alert(1)</script>', target: '"><img src=x>' })],
      exposures: [finding({ title: '<script>alert(1)</script>', target: '"><img src=x>' })]
    };

    const html = generator.buildHTMLReport(hostile, {});

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('states the authorization basis when no explicit authorization was used', () => {
    const html = generator.buildHTMLReport({
      ...data,
      scan: scan({ metadata: { ...scan().metadata, authorizationBasis: 'organization_owned_domain' } })
    }, {});

    expect(html).toContain('organization_owned_domain');
  });

  it('shows explicit authorization details when one was used', () => {
    const html = generator.buildHTMLReport({
      ...data,
      authorization: {
        domains: ['contoso.com'],
        profile_ceiling: 'aggressive',
        authorized_by_name: 'Dana Ops',
        authorization_reference: 'ENG-77',
        expires_at: '2026-06-01T00:00:00.000Z'
      }
    }, {});

    expect(html).toContain('Dana Ops');
    expect(html).toContain('ENG-77');
  });

  it('does not present an empty result as unqualified good news', () => {
    const html = generator.buildHTMLReport({ ...data, exposures: [], findings: [] }, {});

    expect(html).toMatch(/Review the coverage notes below/);
  });

  it('omits evidence when asked to', () => {
    const withEvidence = generator.buildHTMLReport(data, {});
    const without = generator.buildHTMLReport(data, { includeEvidence: false });

    expect(withEvidence).toContain('txtRecords');
    expect(without).not.toContain('txtRecords');
  });

  it('separates leads from exposures', () => {
    const html = generator.buildHTMLReport({
      ...data,
      leads: [finding({ id: 'l1', finding_id: 'LEAD-CODE-SEARCH', title: 'Suggested queries', is_lead: true })]
    }, {});

    expect(html).toContain('Analyst leads');
    expect(html).toContain('not confirmed exposures');
  });
});

describe('CSV quoting', () => {
  it('quotes cells containing separators, quotes or newlines', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('has,comma')).toBe('"has,comma"');
    expect(csvCell('has"quote')).toBe('"has""quote"');
    expect(csvCell('has\nnewline')).toBe('"has\nnewline"');
    expect(csvCell(null)).toBe('');
  });
});
