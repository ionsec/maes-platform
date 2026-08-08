const db = require('../services/database');
const { logger } = require('../logger');
const { ProbeClient, ProbeBudgetExceededError } = require('./probeClient');
const { ReconResolver } = require('./resolver');
const { phasesForProfile } = require('./phases');
const { buildAttackPaths } = require('./attackPaths');
const { authorizeScan, AuthorizationError } = require('./authorization');
const { raiseAlertsForScan } = require('./alerting');
const { SEVERITY_ORDER } = require('./findings/catalog');

/**
 * External exposure scan engine.
 *
 * Mirrors AssessmentEngine.runAssessment: create the record, run units of work
 * in order, write progress to the database after each one, then finalise.
 * Progress is reported through recon_scans.progress; the frontend polls.
 */

/** Probe budget per profile. Aggressive scans do more work, not unlimited work. */
const PROBE_BUDGETS = {
  passive: 400,
  standard: 1500,
  aggressive: 4000
};

class ReconEngine {
  /**
   * @param {string} organizationId
   * @param {string} seedDomain
   * @param {string} profile - passive | standard | aggressive
   * @param {Object} [options]
   * @param {string} [options.name]
   * @param {string} [options.description]
   * @param {string} [options.triggeredBy] - user id
   * @param {boolean} [options.isScheduled]
   * @param {string} [options.seedUser] - optional account for the enumeration check
   * @param {Object} [options.externalCredentials]
   */
  async runScan(organizationId, seedDomain, profile = 'passive', options = {}) {
    const domain = normaliseDomain(seedDomain);
    let scan = null;

    // Authorize before creating any record: a refused scan should leave no
    // half-created row behind.
    const authorization = await authorizeScan({ organizationId, seedDomain: domain, profile });

    try {
      scan = await db.insert(
        `INSERT INTO maes.recon_scans
           (organization_id, seed_domain, profile, name, description, status,
            authorization_id, triggered_by, is_scheduled, parameters, metadata)
         VALUES ($1, $2, $3, $4, $5, 'running', $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          organizationId,
          domain,
          profile,
          options.name || `External Exposure (${profile}) — ${domain}`,
          options.description || null,
          authorization.authorizationId,
          options.triggeredBy || null,
          options.isScheduled || false,
          JSON.stringify({ seedUser: options.seedUser || null }),
          JSON.stringify({
            startTime: new Date().toISOString(),
            authorizationBasis: authorization.basis,
            engineVersion: '1.0.0'
          })
        ]
      );

      await db.query(
        `UPDATE maes.recon_scans SET started_at = NOW(), progress = 2 WHERE id = $1`,
        [scan.id]
      );

      logger.info(`Recon scan ${scan.id} started: ${domain} (${profile}, basis: ${authorization.basis})`);

      const probeClient = new ProbeClient({
        scanId: scan.id,
        db,
        maxProbes: PROBE_BUDGETS[profile]
      });

      const ctx = {
        seedDomain: domain,
        profile,
        probeClient,
        dns: new ReconResolver({ probeClient }),
        state: { discoveredHosts: [domain] },
        options
      };

      const phaseClasses = phasesForProfile(profile);
      await db.query(
        `UPDATE maes.recon_scans SET total_phases = $2 WHERE id = $1`,
        [scan.id, phaseClasses.length]
      );

      const allFindings = [];
      let completed = 0;

      for (const PhaseClass of phaseClasses) {
        try {
          logger.debug(`Recon scan ${scan.id}: running phase ${PhaseClass.key}`);
          const phase = new PhaseClass(ctx);
          await phase.run();
          allFindings.push(...phase.findings);
        } catch (error) {
          if (error instanceof ProbeBudgetExceededError) {
            // Budget exhaustion is a scan-level condition, not a phase failure:
            // remaining phases would have nothing to work with.
            logger.warn(`Recon scan ${scan.id}: probe budget exhausted during ${PhaseClass.key}, stopping early`);
            ctx.state.probeBudgetExhausted = true;
            completed++;
            break;
          }
          // One phase failing must not lose the findings of the others.
          logger.error(`Recon scan ${scan.id}: phase ${PhaseClass.key} failed: ${error.message}`);
          ctx.state.phaseErrors = [
            ...(ctx.state.phaseErrors || []),
            { phase: PhaseClass.key, error: error.message }
          ];
        }

        completed++;
        const progress = Math.min(95, Math.floor((completed / phaseClasses.length) * 90) + 5);
        await db.query(
          `UPDATE maes.recon_scans SET progress = $2, completed_phases = $3 WHERE id = $1`,
          [scan.id, progress, completed]
        );
      }

      const storedFindings = await this._storeFindings(scan.id, allFindings);
      const attackPaths = buildAttackPaths(storedFindings);
      const storedPaths = await this._storeAttackPaths(scan.id, attackPaths);

      const counts = countBySeverity(storedFindings);
      const startedAt = new Date(scan.created_at).getTime();

      await db.query(
        `UPDATE maes.recon_scans
            SET status = 'completed',
                completed_at = NOW(),
                progress = 100,
                critical_findings = $2,
                high_findings = $3,
                medium_findings = $4,
                low_findings = $5,
                info_findings = $6,
                total_probes = $7,
                duration = $8,
                metadata = metadata || $9::jsonb
          WHERE id = $1`,
        [
          scan.id,
          counts.critical,
          counts.high,
          counts.medium,
          counts.low,
          counts.info,
          probeClient.count,
          Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
          JSON.stringify({
            endTime: new Date().toISOString(),
            phasesRun: phaseClasses.map(p => p.key),
            phaseErrors: ctx.state.phaseErrors || [],
            probeBudgetExhausted: Boolean(ctx.state.probeBudgetExhausted),
            probeBudget: PROBE_BUDGETS[profile],
            truncation: {
              certTransparency: ctx.state.ctTruncated || null,
              headerCheck: ctx.state.headerCheckTruncated || null
            },
            // A failed CT query means every downstream phase worked from a
            // hostname list of one. Recording it keeps a thin scan from
            // reading as a clean bill of health.
            certTransparencyFailed: Boolean(ctx.state.ctQueryFailed),
            discoveredHostCount: (ctx.state.discoveredHosts || []).length
          })
        ]
      );

      logger.info(
        `Recon scan ${scan.id} completed: ${storedFindings.length} finding(s), `
        + `${attackPaths.length} attack path(s), ${probeClient.count} probe(s)`
      );

      // Alerting compares against the previous scan of this domain, so it runs
      // after the results are committed. A failure here must not fail a scan
      // whose findings are already safely stored.
      let alerting = { alerts: [], reason: 'skipped' };
      try {
        const scanRow = await db.getRow(`SELECT * FROM maes.recon_scans WHERE id = $1`, [scan.id]);
        const findingRows = await db.getRows(
          `SELECT * FROM maes.recon_findings WHERE scan_id = $1`, [scan.id]
        );
        alerting = await raiseAlertsForScan(scanRow, findingRows, storedPaths);
      } catch (error) {
        logger.error(`Recon scan ${scan.id}: failed to raise alerts: ${error.message}`);
        alerting = { alerts: [], reason: 'failed', error: error.message };
      }

      return {
        success: true,
        scanId: scan.id,
        findings: storedFindings,
        attackPaths,
        counts,
        probeCount: probeClient.count,
        alerts: alerting.alerts,
        alertingReason: alerting.reason
      };

    } catch (error) {
      logger.error(`Recon scan failed for ${domain}:`, error);

      if (scan) {
        await db.query(
          `UPDATE maes.recon_scans
              SET status = 'failed',
                  completed_at = NOW(),
                  error_message = $2,
                  error_details = $3
            WHERE id = $1`,
          [scan.id, error.message, JSON.stringify({ stack: error.stack })]
        );
      }

      throw error;
    }
  }

  /** Persist findings, returning them with their database ids attached. */
  async _storeFindings(scanId, findings) {
    const stored = [];

    for (const finding of findings) {
      const row = await db.insert(
        `INSERT INTO maes.recon_findings
           (scan_id, finding_id, phase, title, description, severity, tags, target,
            evidence, impact, remediation, mitre_technique, is_lead)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING id`,
        [
          scanId,
          finding.findingId,
          finding.phase,
          finding.title,
          finding.description,
          finding.severity,
          finding.tags,
          finding.target,
          JSON.stringify(finding.evidence || {}),
          finding.impact,
          finding.remediation,
          finding.mitreTechnique,
          finding.isLead || false
        ]
      );

      stored.push({ ...finding, id: row.id });
    }

    return stored;
  }

  async _storeAttackPaths(scanId, paths) {
    const stored = [];

    for (const path of paths) {
      const row = await db.insert(
        `INSERT INTO maes.recon_attack_paths
           (scan_id, path_id, name, effort, blast_radius, severity,
            trigger_tags, matched_findings, narrative, mitre_techniques)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          scanId,
          path.pathId,
          path.name,
          path.effort,
          path.blastRadius,
          path.severity,
          path.triggerTags,
          path.matchedFindingIds,
          path.narrative,
          path.mitreTechniques
        ]
      );

      stored.push(row);
    }

    return stored;
  }
}

/** Strip scheme, path, port and trailing dot from operator input. */
function normaliseDomain(input) {
  let domain = String(input || '').trim().toLowerCase();
  domain = domain.replace(/^[a-z]+:\/\//, '');
  domain = domain.split('/')[0];
  domain = domain.split(':')[0];
  domain = domain.replace(/\.$/, '');

  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
    throw new Error(`'${input}' is not a valid domain name`);
  }

  return domain;
}

function countBySeverity(findings) {
  const counts = Object.fromEntries(SEVERITY_ORDER.map(s => [s, 0]));
  for (const finding of findings) {
    if (counts[finding.severity] !== undefined) counts[finding.severity]++;
  }
  return counts;
}

module.exports = {
  ReconEngine,
  reconEngine: new ReconEngine(),
  normaliseDomain,
  countBySeverity,
  PROBE_BUDGETS,
  AuthorizationError
};
