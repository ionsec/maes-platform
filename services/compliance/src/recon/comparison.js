const db = require('../services/database');
const { SEVERITY_ORDER, severityRank } = require('./findings/catalog');

/**
 * Drift between two external exposure scans.
 *
 * The question this answers is not "how many findings do we have" but "what
 * changed" — a new critical exposure appearing between two scans matters far
 * more than the same twelve findings persisting, and a resolved one is worth
 * confirming rather than assuming.
 *
 * Findings are matched on (finding_id, target). The same catalog entry on a
 * different host is a different problem: a dangling record on old.contoso.com
 * and one on legacy.contoso.com are two separate exposures, not one recurring.
 */

/** Stable identity for a finding across scans. */
function findingKey(finding) {
  return `${finding.finding_id}::${finding.target || ''}`;
}

/**
 * Compare two sets of findings.
 *
 * @param {Object[]} baselineFindings
 * @param {Object[]} currentFindings
 * @returns {{added, resolved, persisting, severityChanged}}
 */
function diffFindings(baselineFindings = [], currentFindings = []) {
  const baseline = new Map(baselineFindings.map(f => [findingKey(f), f]));
  const current = new Map(currentFindings.map(f => [findingKey(f), f]));

  const added = [];
  const persisting = [];
  const severityChanged = [];

  for (const [key, finding] of current) {
    const previous = baseline.get(key);

    if (!previous) {
      added.push(finding);
      continue;
    }

    if (previous.severity !== finding.severity) {
      severityChanged.push({
        ...finding,
        previousSeverity: previous.severity,
        // Lower rank is more severe, so a smaller rank means it got worse.
        direction: severityRank(finding.severity) < severityRank(previous.severity)
          ? 'worsened'
          : 'improved'
      });
    } else {
      persisting.push(finding);
    }
  }

  const resolved = [];
  for (const [key, finding] of baseline) {
    if (!current.has(key)) resolved.push(finding);
  }

  const bySeverity = list => list.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

  return {
    added: bySeverity(added),
    resolved: bySeverity(resolved),
    persisting: bySeverity(persisting),
    severityChanged: bySeverity(severityChanged)
  };
}

/** Compare attack paths, which are identified by their template id. */
function diffAttackPaths(baselinePaths = [], currentPaths = []) {
  const baseline = new Set(baselinePaths.map(p => p.path_id));
  const current = new Set(currentPaths.map(p => p.path_id));

  return {
    added: currentPaths.filter(p => !baseline.has(p.path_id)),
    resolved: baselinePaths.filter(p => !current.has(p.path_id)),
    persisting: currentPaths.filter(p => baseline.has(p.path_id))
  };
}

/** Per-severity counts, excluding leads. */
function countBySeverity(findings) {
  const counts = Object.fromEntries(SEVERITY_ORDER.map(s => [s, 0]));
  for (const finding of findings) {
    if (!finding.is_lead && counts[finding.severity] !== undefined) counts[finding.severity]++;
  }
  return counts;
}

/**
 * Two scans are only meaningfully comparable when they looked for the same
 * things. Comparing a passive scan against an aggressive one produces a wall of
 * false "resolved" findings that are really just checks that were never run.
 */
function assessComparability(baseline, current) {
  const warnings = [];

  if (baseline.seed_domain !== current.seed_domain) {
    warnings.push(
      `The scans used different seed domains (${baseline.seed_domain} and ${current.seed_domain}), `
      + 'so differences largely reflect different scopes rather than real change.'
    );
  }

  if (baseline.profile !== current.profile) {
    warnings.push(
      `The scans ran at different profiles ('${baseline.profile}' and '${current.profile}'). `
      + 'Findings unique to the more aggressive scan may reflect checks the other never performed, '
      + 'not a change in the environment.'
    );
  }

  for (const [label, scan] of [['baseline', baseline], ['current', current]]) {
    if (scan.metadata?.certTransparencyFailed) {
      warnings.push(
        `The ${label} scan's certificate transparency lookup failed, so it examined only the seed domain. `
        + 'Host-specific differences are unreliable.'
      );
    }
    if (scan.metadata?.probeBudgetExhausted) {
      warnings.push(`The ${label} scan exhausted its probe budget and did not complete every phase.`);
    }
  }

  return warnings;
}

/**
 * Compare two completed scans belonging to the same organization.
 *
 * @param {string} baselineId
 * @param {string} currentId
 */
async function compareScans(baselineId, currentId) {
  const scans = await db.getRows(
    `SELECT * FROM maes.recon_scans WHERE id IN ($1, $2) AND status = 'completed'`,
    [baselineId, currentId]
  );

  if (scans.length !== 2) {
    const error = new Error('Both scans must exist and be completed');
    error.statusCode = 400;
    throw error;
  }

  const baseline = scans.find(s => s.id === baselineId);
  const current = scans.find(s => s.id === currentId);

  if (baseline.organization_id !== current.organization_id) {
    const error = new Error('Scans must belong to the same organization');
    error.statusCode = 400;
    throw error;
  }

  const [baselineFindings, currentFindings, baselinePaths, currentPaths] = await Promise.all([
    db.getRows(`SELECT * FROM maes.recon_findings WHERE scan_id = $1`, [baselineId]),
    db.getRows(`SELECT * FROM maes.recon_findings WHERE scan_id = $1`, [currentId]),
    db.getRows(`SELECT * FROM maes.recon_attack_paths WHERE scan_id = $1`, [baselineId]),
    db.getRows(`SELECT * FROM maes.recon_attack_paths WHERE scan_id = $1`, [currentId])
  ]);

  // Leads are analyst prompts that reappear on every scan; including them in
  // drift would bury the exposures that actually changed.
  const baselineExposures = baselineFindings.filter(f => !f.is_lead);
  const currentExposures = currentFindings.filter(f => !f.is_lead);

  const findings = diffFindings(baselineExposures, currentExposures);
  const attackPaths = diffAttackPaths(baselinePaths, currentPaths);

  return {
    baseline: summariseScan(baseline, baselineExposures),
    current: summariseScan(current, currentExposures),
    comparability: assessComparability(baseline, current),
    findings,
    attackPaths,
    summary: {
      added: findings.added.length,
      resolved: findings.resolved.length,
      persisting: findings.persisting.length,
      severityChanged: findings.severityChanged.length,
      worsened: findings.severityChanged.filter(f => f.direction === 'worsened').length,
      addedBySeverity: countBySeverity(findings.added),
      resolvedBySeverity: countBySeverity(findings.resolved)
    }
  };
}

function summariseScan(scan, exposures) {
  return {
    id: scan.id,
    seedDomain: scan.seed_domain,
    profile: scan.profile,
    completedAt: scan.completed_at,
    totalProbes: scan.total_probes,
    exposureCount: exposures.length,
    counts: countBySeverity(exposures)
  };
}

module.exports = {
  compareScans,
  diffFindings,
  diffAttackPaths,
  assessComparability,
  countBySeverity,
  findingKey
};
