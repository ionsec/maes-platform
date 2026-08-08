const fs = require('fs').promises;
const path = require('path');
const db = require('../services/database');
const { logger } = require('../logger');
const { renderPdf, isAvailable: pdfAvailable, escapeHtml } = require('../services/pdfRenderer');
const { SEVERITY_ORDER, severityRank } = require('./findings/catalog');

/**
 * Reports for external exposure scans.
 *
 * Deliberately separate from the compliance report generator: the two describe
 * different things. A compliance report answers "how much of the benchmark did
 * we pass"; this one answers "what can an attacker see, and what can they chain
 * it into". They share only the PDF renderer and the output directory.
 */

const SEVERITY_COLORS = {
  critical: '#b3261e',
  high: '#d93025',
  medium: '#e37400',
  low: '#1a73e8',
  info: '#5f6368'
};

class ReconReportGenerator {
  constructor() {
    // Same directory the compliance reports use, so the existing download
    // endpoint and cleanup sweep cover these too.
    this.outputPath = path.join(__dirname, '../reports');
  }

  async initialize() {
    await fs.mkdir(this.outputPath, { recursive: true });
    logger.info('External exposure report generator initialized');
  }

  /**
   * @param {string} scanId
   * @param {string} [format] html | pdf | json | csv
   * @param {Object} [options]
   * @param {boolean} [options.includeProbeLog] - append the full probe audit trail
   */
  async generateReport(scanId, format = 'html', options = {}) {
    logger.info(`Generating ${format.toUpperCase()} external exposure report for scan ${scanId}`);

    const data = await this.fetchScanData(scanId, options);
    if (!data) {
      throw new Error('Scan not found');
    }
    if (data.scan.status !== 'completed') {
      throw new Error(`Scan is '${data.scan.status}'; only completed scans can be reported on`);
    }

    switch (String(format).toLowerCase()) {
      case 'html': return this.generateHTMLReport(data, options);
      case 'pdf': return this.generatePDFReport(data, options);
      case 'json': return this.generateJSONReport(data, options);
      case 'csv': return this.generateCSVReport(data, options);
      default: throw new Error(`Unsupported report format: ${format}`);
    }
  }

  async fetchScanData(scanId, options = {}) {
    const scan = await db.getRow(
      `SELECT s.*, o.name AS organization_name
         FROM maes.recon_scans s
         JOIN maes.organizations o ON o.id = s.organization_id
        WHERE s.id = $1`,
      [scanId]
    );
    if (!scan) return null;

    const findings = await db.getRows(
      `SELECT * FROM maes.recon_findings WHERE scan_id = $1 ORDER BY phase, finding_id`,
      [scanId]
    );

    const attackPaths = await db.getRows(
      `SELECT * FROM maes.recon_attack_paths WHERE scan_id = $1`,
      [scanId]
    );

    let authorization = null;
    if (scan.authorization_id) {
      authorization = await db.getRow(
        `SELECT domains, profile_ceiling, authorized_by_name, authorization_reference, authorized_at, expires_at
           FROM maes.recon_authorizations WHERE id = $1`,
        [scan.authorization_id]
      );
    }

    let probeLog = [];
    if (options.includeProbeLog) {
      probeLog = await db.getRows(
        `SELECT kind, method, url, host, status_code, elapsed_ms, error, probed_at
           FROM maes.recon_probe_log WHERE scan_id = $1 ORDER BY probed_at`,
        [scanId]
      );
    }

    // Leads are analyst actions, not exposures; keeping them separate stops
    // them inflating the finding count in the summary.
    const exposures = findings.filter(f => !f.is_lead);
    const leads = findings.filter(f => f.is_lead);

    return { scan, findings, exposures, leads, attackPaths, authorization, probeLog };
  }

  // --- formats -----------------------------------------------------------

  async generateHTMLReport(data, options = {}) {
    const html = this.buildHTMLReport(data, options);
    const fileName = `external_exposure_${data.scan.id}_${Date.now()}.html`;
    const filePath = path.join(this.outputPath, fileName);

    await fs.writeFile(filePath, html, 'utf8');
    logger.info(`External exposure HTML report generated: ${fileName}`);

    return { format: 'html', fileName, filePath, size: (await fs.stat(filePath)).size };
  }

  async generatePDFReport(data, options = {}) {
    if (!pdfAvailable()) {
      logger.warn('Puppeteer not available, generating HTML instead of PDF');
      const html = await this.generateHTMLReport(data, options);
      return { ...html, format: 'pdf', note: 'PDF generation unavailable - HTML generated instead' };
    }

    try {
      const buffer = await renderPdf(this.buildHTMLReport(data, options), {
        headerText: `External Exposure - ${data.scan.seed_domain}`
      });

      const fileName = `external_exposure_${data.scan.id}_${Date.now()}.pdf`;
      const filePath = path.join(this.outputPath, fileName);
      await fs.writeFile(filePath, buffer);

      logger.info(`External exposure PDF report generated: ${fileName}`);
      return { format: 'pdf', fileName, filePath, size: buffer.length };

    } catch (error) {
      logger.error('Error generating external exposure PDF:', error);
      const html = await this.generateHTMLReport(data, options);
      return {
        ...html,
        format: 'pdf',
        note: 'PDF generation failed - HTML generated instead',
        error: error.message
      };
    }
  }

  async generateJSONReport(data, options = {}) {
    const { scan, findings, attackPaths, authorization, probeLog } = data;

    const report = {
      metadata: {
        generatedAt: new Date().toISOString(),
        format: 'json',
        version: '1.0.0',
        generator: 'MAES External Exposure Reporter'
      },
      scan: {
        id: scan.id,
        organization: scan.organization_name,
        seedDomain: scan.seed_domain,
        profile: scan.profile,
        status: scan.status,
        startedAt: scan.started_at,
        completedAt: scan.completed_at,
        duration: scan.duration,
        totalProbes: scan.total_probes
      },
      authorization: authorization
        ? {
          domains: authorization.domains,
          profileCeiling: authorization.profile_ceiling,
          authorizedBy: authorization.authorized_by_name,
          reference: authorization.authorization_reference,
          authorizedAt: authorization.authorized_at,
          expiresAt: authorization.expires_at
        }
        : { basis: scan.metadata?.authorizationBasis || 'unknown' },
      coverage: this.buildCoverage(scan),
      summary: this.countBySeverity(data.exposures),
      findings: findings.map(f => ({
        id: f.finding_id,
        phase: f.phase,
        title: f.title,
        severity: f.severity,
        tags: f.tags,
        target: f.target,
        description: f.description,
        impact: f.impact,
        remediation: f.remediation,
        mitreTechnique: f.mitre_technique,
        isLead: f.is_lead,
        evidence: f.evidence
      })),
      attackPaths: attackPaths.map(p => ({
        id: p.path_id,
        name: p.name,
        severity: p.severity,
        effort: p.effort,
        blastRadius: p.blast_radius,
        triggerTags: p.trigger_tags,
        narrative: p.narrative,
        mitreTechniques: p.mitre_techniques
      })),
      ...(options.includeProbeLog ? { probeLog } : {})
    };

    const fileName = `external_exposure_${scan.id}_${Date.now()}.json`;
    const filePath = path.join(this.outputPath, fileName);
    await fs.writeFile(filePath, JSON.stringify(report, null, 2), 'utf8');

    logger.info(`External exposure JSON report generated: ${fileName}`);
    return { format: 'json', fileName, filePath, size: (await fs.stat(filePath)).size, data: report };
  }

  async generateCSVReport(data) {
    const rows = [[
      'Finding ID', 'Severity', 'Phase', 'Title', 'Target',
      'MITRE Technique', 'Tags', 'Is Lead', 'Impact', 'Remediation'
    ]];

    const sorted = [...data.findings].sort((a, b) =>
      severityRank(a.severity) - severityRank(b.severity));

    for (const f of sorted) {
      rows.push([
        f.finding_id,
        f.severity,
        f.phase,
        f.title,
        f.target || '',
        f.mitre_technique || '',
        (f.tags || []).join(' '),
        f.is_lead ? 'yes' : 'no',
        f.impact || '',
        f.remediation || ''
      ]);
    }

    const csv = rows.map(row => row.map(csvCell).join(',')).join('\n');

    const fileName = `external_exposure_${data.scan.id}_${Date.now()}.csv`;
    const filePath = path.join(this.outputPath, fileName);
    await fs.writeFile(filePath, csv, 'utf8');

    logger.info(`External exposure CSV report generated: ${fileName}`);
    return { format: 'csv', fileName, filePath, size: (await fs.stat(filePath)).size };
  }

  // --- helpers -----------------------------------------------------------

  countBySeverity(findings) {
    const counts = Object.fromEntries(SEVERITY_ORDER.map(s => [s, 0]));
    for (const f of findings) {
      if (counts[f.severity] !== undefined) counts[f.severity]++;
    }
    return counts;
  }

  /**
   * Anything that narrowed this scan's coverage.
   *
   * A report that omits this reads as a complete picture when it may not be —
   * a scan whose CT lookup failed saw one hostname, not the estate.
   */
  buildCoverage(scan) {
    const metadata = scan.metadata || {};
    const caveats = [];

    if (metadata.certTransparencyFailed) {
      caveats.push(
        'The certificate transparency lookup failed, so no additional hostnames were discovered. '
        + 'Every host-based phase examined only the seed domain.'
      );
    }
    if (metadata.probeBudgetExhausted) {
      caveats.push(
        `The scan reached its probe budget of ${metadata.probeBudget} and stopped before all phases ran.`
      );
    }
    if (metadata.truncation?.certTransparency) {
      const t = metadata.truncation.certTransparency;
      caveats.push(`Certificate transparency returned ${t.found} hostnames; the first ${t.kept} were examined.`);
    }
    if (metadata.truncation?.headerCheck) {
      const t = metadata.truncation.headerCheck;
      caveats.push(`${t.found} hostnames were discovered; response headers were checked on ${t.checked}.`);
    }
    for (const failure of metadata.phaseErrors || []) {
      caveats.push(`Phase '${failure.phase}' failed and contributed no findings: ${failure.error}`);
    }
    if (scan.profile !== 'aggressive') {
      caveats.push(
        `This was a '${scan.profile}' scan. Account enumeration and third-party platform checks were not `
        + 'performed; their absence here is not evidence of their absence in the environment.'
      );
    }

    return {
      profile: scan.profile,
      phasesRun: metadata.phasesRun || [],
      discoveredHostCount: metadata.discoveredHostCount ?? null,
      totalProbes: scan.total_probes,
      caveats
    };
  }

  buildHTMLReport(data, options = {}) {
    const { scan, exposures, leads, attackPaths, authorization } = data;
    const counts = this.countBySeverity(exposures);
    const coverage = this.buildCoverage(scan);

    const sorted = [...exposures].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>External Exposure Report - ${escapeHtml(scan.seed_domain)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
         color: #202124; margin: 0; padding: 32px; line-height: 1.55; }
  h1 { margin: 0 0 4px; font-size: 26px; }
  h2 { margin: 32px 0 12px; font-size: 19px; border-bottom: 2px solid #e8eaed; padding-bottom: 6px; }
  h3 { margin: 20px 0 6px; font-size: 15px; }
  .subtitle { color: #5f6368; margin-bottom: 24px; }
  .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; margin-bottom: 8px; }
  .meta div { background: #f8f9fa; border-radius: 6px; padding: 10px 12px; }
  .meta .label { font-size: 11px; text-transform: uppercase; letter-spacing: .4px; color: #5f6368; }
  .meta .value { font-size: 15px; font-weight: 600; word-break: break-word; }
  .counts { display: flex; gap: 10px; flex-wrap: wrap; margin: 16px 0 8px; }
  .count { flex: 1 1 110px; border-radius: 6px; padding: 12px; color: #fff; text-align: center; }
  .count .n { font-size: 26px; font-weight: 700; display: block; }
  .count .s { font-size: 11px; text-transform: uppercase; letter-spacing: .5px; }
  .finding { border: 1px solid #e8eaed; border-left-width: 5px; border-radius: 6px;
             padding: 14px 16px; margin-bottom: 14px; page-break-inside: avoid; }
  .finding .title { font-weight: 600; font-size: 15px; }
  .pill { display: inline-block; font-size: 10px; text-transform: uppercase; letter-spacing: .5px;
          padding: 2px 8px; border-radius: 10px; color: #fff; margin-right: 6px; vertical-align: middle; }
  .tag { display: inline-block; font-size: 10px; padding: 2px 7px; border-radius: 10px;
         background: #f1f3f4; color: #5f6368; margin: 2px 4px 2px 0; }
  .label-inline { font-size: 11px; text-transform: uppercase; letter-spacing: .4px;
                  color: #5f6368; margin-top: 10px; }
  pre { background: #f8f9fa; border-radius: 4px; padding: 10px; font-size: 11px;
        overflow-x: auto; white-space: pre-wrap; word-break: break-word; max-height: 320px; }
  .path { border: 1px solid #e8eaed; border-radius: 6px; padding: 14px 16px;
          margin-bottom: 14px; page-break-inside: avoid; }
  .caveat { background: #fef7e0; border-left: 4px solid #f9ab00; padding: 10px 14px;
            border-radius: 4px; margin-bottom: 8px; font-size: 13px; }
  .clean { background: #e6f4ea; border-left: 4px solid #34a853; padding: 12px 14px; border-radius: 4px; }
  footer { margin-top: 40px; padding-top: 14px; border-top: 1px solid #e8eaed;
           color: #5f6368; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e8eaed; }
  th { color: #5f6368; text-transform: uppercase; font-size: 10px; letter-spacing: .4px; }
</style>
</head>
<body>

<h1>External Exposure Report</h1>
<div class="subtitle">
  ${escapeHtml(scan.organization_name)} &middot; ${escapeHtml(scan.seed_domain)}
</div>

<div class="meta">
  <div><div class="label">Seed domain</div><div class="value">${escapeHtml(scan.seed_domain)}</div></div>
  <div><div class="label">Profile</div><div class="value">${escapeHtml(scan.profile)}</div></div>
  <div><div class="label">Completed</div><div class="value">${scan.completed_at ? new Date(scan.completed_at).toLocaleString() : '—'}</div></div>
  <div><div class="label">Probes issued</div><div class="value">${scan.total_probes ?? 0}</div></div>
</div>

<h2>Summary</h2>
<div class="counts">
  ${SEVERITY_ORDER.map(s => `
    <div class="count" style="background:${SEVERITY_COLORS[s]}">
      <span class="n">${counts[s]}</span><span class="s">${s}</span>
    </div>`).join('')}
</div>
${exposures.length === 0
    ? '<div class="clean">No exposures were identified at this profile. Review the coverage notes below '
      + 'before treating this as a clean result.</div>'
    : `<p>${exposures.length} exposure${exposures.length === 1 ? '' : 's'} identified across
       ${coverage.phasesRun.length} phase${coverage.phasesRun.length === 1 ? '' : 's'}.</p>`}

<h2>Coverage and limitations</h2>
<p><strong>Phases run:</strong> ${coverage.phasesRun.map(escapeHtml).join(', ') || '—'}</p>
${coverage.caveats.length === 0
    ? '<p>No coverage limitations were recorded for this scan.</p>'
    : coverage.caveats.map(c => `<div class="caveat">${escapeHtml(c)}</div>`).join('')}

<h2>Authorization</h2>
${authorization
    ? `<table>
        <tr><th>Domains</th><td>${(authorization.domains || []).map(escapeHtml).join(', ')}</td></tr>
        <tr><th>Profile ceiling</th><td>${escapeHtml(authorization.profile_ceiling)}</td></tr>
        <tr><th>Authorized by</th><td>${escapeHtml(authorization.authorized_by_name || '—')}</td></tr>
        <tr><th>Reference</th><td>${escapeHtml(authorization.authorization_reference || '—')}</td></tr>
        <tr><th>Expires</th><td>${new Date(authorization.expires_at).toLocaleString()}</td></tr>
       </table>`
    : `<p>Run against a domain registered to this organization
        (basis: ${escapeHtml(scan.metadata?.authorizationBasis || 'unknown')}). No separate scope
        authorization was required at the '${escapeHtml(scan.profile)}' profile.</p>`}

<h2>Attack paths</h2>
${attackPaths.length === 0
    ? '<p>No attack chains were assembled from these findings. Individual findings may still warrant action.</p>'
    : attackPaths
      .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
      .map(p => `
        <div class="path">
          <div class="title">
            <span class="pill" style="background:${SEVERITY_COLORS[p.severity]}">${escapeHtml(p.severity)}</span>
            ${escapeHtml(p.name)}
          </div>
          <p>${escapeHtml(p.narrative)}</p>
          <div class="label-inline">Effort</div><div>${escapeHtml(p.effort || '—')}</div>
          <div class="label-inline">Blast radius</div><div>${escapeHtml(p.blast_radius || '—')}</div>
          <div style="margin-top:8px">
            ${(p.mitre_techniques || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
          </div>
        </div>`).join('')}

<h2>Findings</h2>
${sorted.length === 0
    ? '<p>None.</p>'
    : sorted.map(f => `
      <div class="finding" style="border-left-color:${SEVERITY_COLORS[f.severity]}">
        <div class="title">
          <span class="pill" style="background:${SEVERITY_COLORS[f.severity]}">${escapeHtml(f.severity)}</span>
          ${escapeHtml(f.title)}
        </div>
        <p>${escapeHtml(f.description || '')}</p>
        ${f.impact ? `<div class="label-inline">Why it matters</div><div>${escapeHtml(f.impact)}</div>` : ''}
        ${f.remediation ? `<div class="label-inline">Remediation</div><div>${escapeHtml(f.remediation)}</div>` : ''}
        <div style="margin-top:10px">
          <span class="tag">${escapeHtml(f.finding_id)}</span>
          <span class="tag">phase: ${escapeHtml(f.phase)}</span>
          ${f.mitre_technique ? `<span class="tag">${escapeHtml(f.mitre_technique)}</span>` : ''}
          ${(f.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}
        </div>
        ${options.includeEvidence === false || !f.evidence || Object.keys(f.evidence).length === 0
          ? ''
          : `<div class="label-inline">Evidence</div><pre>${escapeHtml(JSON.stringify(f.evidence, null, 2))}</pre>`}
      </div>`).join('')}

${leads.length === 0 ? '' : `
<h2>Analyst leads</h2>
<p>These are actions to take, not confirmed exposures. They require a third-party API credential that MAES
   does not hold for this organization.</p>
${leads.map(l => `
  <div class="finding" style="border-left-color:${SEVERITY_COLORS.info}">
    <div class="title">${escapeHtml(l.title)}</div>
    <p>${escapeHtml(l.description || '')}</p>
    <pre>${escapeHtml(JSON.stringify(l.evidence, null, 2))}</pre>
  </div>`).join('')}`}

<footer>
  Generated by MAES on ${new Date().toLocaleString()} &middot; scan ${escapeHtml(scan.id)}<br>
  Findings describe what was observable from outside the tenant at the time of the scan. Absence of a finding
  is not proof of absence of the underlying issue.
</footer>

</body>
</html>`;
  }
}

/** RFC 4180 quoting. */
function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

module.exports = {
  ReconReportGenerator,
  reconReportGenerator: new ReconReportGenerator(),
  csvCell
};
