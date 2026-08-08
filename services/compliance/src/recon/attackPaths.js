const { severityRank } = require('./findings/catalog');

/**
 * Attack chain assembly.
 *
 * Individual findings are often unremarkable on their own; what matters is the
 * combination. Each template names a set of tags that, when all present in one
 * scan, describe a route an attacker can actually walk. The narrative is
 * generated from the findings that matched, so it names real hosts rather than
 * describing the pattern in the abstract.
 */

const TEMPLATES = [
  {
    id: 'GOLDEN-SAML',
    name: 'Golden SAML via on-premises AD FS',
    requiredTags: ['FED-ADFS-DETECTED', 'FED-ADFS-MEX-EXPOSED'],
    effort: 'high',
    blastRadius: 'Tenant-wide impersonation of any federated user',
    severity: 'high',
    mitre: ['T1606.002', 'T1590.002'],
    narrative: () =>
      'The domain is federated to AD FS, and the metadata exchange endpoint is publicly readable, so the '
      + 'relying-party catalogue and trust configuration can be enumerated without a credential. An attacker '
      + 'who then reaches the AD FS server and extracts the token-signing certificate can forge SAML assertions '
      + 'for any user against any of those relying parties. Entra ID MFA and Conditional Access do not apply to '
      + 'an assertion the tenant already trusts.'
  },
  {
    id: 'SPRAY-TO-TENANT',
    name: 'Password spraying through an MFA-exempt authentication path',
    requiredTags: ['MFA-BYPASS-PATH'],
    effort: 'low',
    blastRadius: 'Any account whose password can be guessed',
    severity: 'high',
    mitre: ['T1110.003', 'T1078.004'],
    narrative: (findings) => {
      const hasEnum = findings.some(f => f.tags.includes('USER-ENUM'));
      const hasWsTrust = findings.some(f => f.tags.includes('FED-WSTRUST-EXPOSED'));

      let text = 'An authentication path exists that accepts a username and password without applying '
        + 'Conditional Access or MFA';
      if (hasWsTrust) {
        text += ', via the exposed AD FS WS-Trust endpoint';
      }
      text += '. ';
      if (hasEnum) {
        text += 'Account existence is also disclosed to unauthenticated callers, so an attacker can validate '
          + 'a target list first and spray only real accounts — raising the hit rate while generating far fewer '
          + 'failed sign-ins than a blind attempt would. ';
      }
      text += 'A single guessed password on this path yields a working session with no second factor.';
      return text;
    }
  },
  {
    id: 'ANON-DATA-EXFIL',
    name: 'Unauthenticated data exfiltration',
    requiredTags: ['DATA-EXPOSURE', 'ANON-READ'],
    effort: 'low',
    blastRadius: 'Every record in the exposed store',
    severity: 'critical',
    mitre: ['T1530'],
    narrative: (findings) => {
      const targets = findings
        .filter(f => f.tags.includes('ANON-READ'))
        .map(f => f.target)
        .filter(Boolean)
        .slice(0, 5);

      return 'One or more data stores return content to unauthenticated requests'
        + (targets.length > 0 ? ` (${targets.join(', ')})` : '')
        + '. No credential, no phishing and no lateral movement is required — the data can be retrieved '
        + 'directly, and the retrieval is indistinguishable from ordinary anonymous traffic in most logging '
        + 'configurations.';
    }
  },
  {
    id: 'TAKEOVER-TO-PHISH',
    name: 'Subdomain takeover into credential phishing',
    requiredTags: ['SUBDOMAIN-TAKEOVER'],
    effort: 'low',
    blastRadius: 'Users who trust the organisation\'s own domain',
    severity: 'high',
    mitre: ['T1584.001', 'T1566'],
    narrative: (findings) => {
      const hosts = findings
        .filter(f => f.tags.includes('SUBDOMAIN-TAKEOVER'))
        .map(f => f.target)
        .filter(Boolean)
        .slice(0, 5);

      return `A dangling DNS record points at an unclaimed cloud resource${hosts.length > 0 ? ` (${hosts.join(', ')})` : ''}. `
        + 'Registering that resource name serves attacker content from a hostname the organisation owns. '
        + 'Phishing from a genuine corporate subdomain defeats the "check the domain" advice users are trained '
        + 'on, and domain control is frequently sufficient to obtain a valid TLS certificate for it.';
    }
  },
  {
    id: 'SPOOF-TO-PHISH',
    name: 'Inbound phishing as the organisation itself',
    requiredTags: ['MAIL-SPOOFABLE'],
    effort: 'low',
    blastRadius: 'Staff, customers and partners',
    severity: 'medium',
    mitre: ['T1566.002'],
    narrative: () =>
      'Mail authentication is incomplete, so a receiving server has no reliable instruction to reject forged '
      + 'mail from this domain. Phishing that appears to come from an internal address bypasses the strongest '
      + 'signal most recipients rely on, and the same gap lets an attacker impersonate the organisation to its '
      + 'customers and partners.'
  },
  {
    id: 'ANON-EXEC',
    name: 'Unauthenticated code execution surface',
    requiredTags: ['ANON-EXEC'],
    effort: 'medium',
    blastRadius: 'Depends on the function\'s own permissions and managed identity',
    severity: 'high',
    mitre: ['T1190'],
    narrative: () =>
      'A serverless endpoint responds without a key. Whatever the function does is available to anyone who '
      + 'finds the URL, executing inside the organisation\'s cloud environment and under whatever managed '
      + 'identity the function holds.'
  }
];

/**
 * Match templates against a scan's findings.
 *
 * @param {Object[]} findings - findings emitted by the scan
 * @returns {Object[]} attack paths, most severe first
 */
function buildAttackPaths(findings) {
  const present = new Set(findings.flatMap(f => f.tags || []));
  const paths = [];

  for (const template of TEMPLATES) {
    const matches = template.requiredTags.every(tag => present.has(tag));
    if (!matches) continue;

    const matched = findings.filter(f =>
      (f.tags || []).some(tag => template.requiredTags.includes(tag)));

    paths.push({
      pathId: template.id,
      name: template.name,
      effort: template.effort,
      blastRadius: template.blastRadius,
      severity: template.severity,
      triggerTags: template.requiredTags,
      matchedFindingIds: matched.map(f => f.id).filter(Boolean),
      narrative: template.narrative(matched),
      mitreTechniques: template.mitre
    });
  }

  return paths.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
}

module.exports = { buildAttackPaths, TEMPLATES };
