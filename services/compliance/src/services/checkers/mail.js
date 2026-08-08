const ctx = require('./context');
const { logger } = require('../../logger');

/**
 * Mail and DNS authentication checkers (MAES-MAIL-*, MAES-DNS-*).
 *
 * These resolve public DNS records for the tenant's own verified domains.
 * No mail is sent and no third-party service is contacted.
 */

/** DKIM selectors Exchange Online publishes by default. */
const EXCHANGE_DKIM_SELECTORS = ['selector1', 'selector2'];

/** Parse the terminal all mechanism from an SPF record. */
function parseSpfAll(spfRecord) {
  const match = spfRecord.match(/([-~?+])all\b/i);
  return match ? `${match[1]}all` : null;
}

/** Parse DMARC tags into a plain object. */
function parseDmarc(record) {
  const tags = {};
  for (const part of record.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key && rest.length > 0) tags[key.trim().toLowerCase()] = rest.join('=').trim();
  }
  return tags;
}

/**
 * Resolve every mail-relevant DNS record for the tenant's verified domains once
 * per assessment, since four controls read from the same lookups.
 */
async function getDnsPosture(graphClient) {
  return ctx.memo(graphClient, 'dnsPosture', async () => {
    const domains = await ctx.getMailDomains(graphClient);
    const results = [];

    for (const domain of domains) {
      const name = domain.id;
      const entry = {
        domain: name,
        isDefault: domain.isDefault === true,
        isInitial: domain.isInitial === true,
        errors: []
      };

      try {
        const txt = await ctx.resolveTxt(name);
        entry.spf = txt.find(r => /^v=spf1\b/i.test(r)) || null;
        entry.mtaSts = txt.find(r => /^v=STSv1\b/i.test(r)) || null;
      } catch (error) {
        entry.errors.push(`TXT lookup failed: ${error.message}`);
      }

      try {
        const dmarcTxt = await ctx.resolveTxt(`_dmarc.${name}`);
        entry.dmarc = dmarcTxt.find(r => /^v=DMARC1\b/i.test(r)) || null;
      } catch (error) {
        entry.errors.push(`DMARC lookup failed: ${error.message}`);
      }

      try {
        const mtaStsTxt = await ctx.resolveTxt(`_mta-sts.${name}`);
        entry.mtaSts = entry.mtaSts || mtaStsTxt.find(r => /^v=STSv1\b/i.test(r)) || null;
      } catch (error) {
        entry.errors.push(`MTA-STS lookup failed: ${error.message}`);
      }

      try {
        const tlsRptTxt = await ctx.resolveTxt(`_smtp._tls.${name}`);
        entry.tlsRpt = tlsRptTxt.find(r => /^v=TLSRPTv1\b/i.test(r)) || null;
      } catch (error) {
        entry.errors.push(`TLS-RPT lookup failed: ${error.message}`);
      }

      try {
        entry.caa = await ctx.resolveCaa(name);
      } catch (error) {
        entry.errors.push(`CAA lookup failed: ${error.message}`);
        entry.caa = [];
      }

      entry.dkimSelectors = [];
      for (const selector of EXCHANGE_DKIM_SELECTORS) {
        try {
          const cnames = await ctx.resolveCname(`${selector}._domainkey.${name}`);
          if (cnames.length > 0) entry.dkimSelectors.push({ selector, target: cnames[0] });
        } catch (error) {
          logger.debug(`DKIM selector lookup failed for ${selector}._domainkey.${name}: ${error.message}`);
        }
      }

      results.push(entry);
    }

    return results;
  });
}

/** MAES-MAIL-01: SPF published and not permissive. */
async function checkSpf(graphClient) {
  const posture = await getDnsPosture(graphClient);

  if (posture.length === 0) {
    return {
      status: 'not_applicable',
      score: 100,
      actualResult: { domains: 0 },
      evidence: { reason: 'No mail-enabled verified domains found' }
    };
  }

  const failingEntities = [];

  for (const entry of posture) {
    if (!entry.spf) {
      failingEntities.push({
        type: 'Domain',
        id: entry.domain,
        displayName: entry.domain,
        reason: 'No SPF record published'
      });
      continue;
    }

    const allMechanism = parseSpfAll(entry.spf);
    if (!allMechanism) {
      failingEntities.push({
        type: 'Domain',
        id: entry.domain,
        displayName: entry.domain,
        reason: 'SPF record has no terminal all mechanism',
        record: entry.spf
      });
    } else if (allMechanism === '?all' || allMechanism === '+all') {
      failingEntities.push({
        type: 'Domain',
        id: entry.domain,
        displayName: entry.domain,
        reason: `SPF record ends in ${allMechanism}, which authorises any host to send for this domain`,
        record: entry.spf
      });
    }
  }

  const isCompliant = failingEntities.length === 0;

  return {
    status: isCompliant ? 'compliant' : 'non_compliant',
    score: Math.round(((posture.length - failingEntities.length) / posture.length) * 100),
    actualResult: {
      domains: posture.length,
      domainsWithSpf: posture.filter(e => e.spf).length,
      failingDomains: failingEntities.length
    },
    evidence: {
      failingEntities,
      records: posture.map(e => ({ domain: e.domain, spf: e.spf, allMechanism: e.spf ? parseSpfAll(e.spf) : null }))
    },
    remediationGuidance: isCompliant
      ? null
      : `${failingEntities.length} domain(s) have a missing or permissive SPF record. Publish an SPF record `
        + 'enumerating every legitimate sending service and terminate it with -all. Keep the record within the '
        + 'ten DNS-lookup limit, and inventory third-party senders before tightening from ~all to -all.'
  };
}

/** MAES-MAIL-02: DMARC published with an enforcing policy. */
async function checkDmarc(graphClient) {
  const posture = await getDnsPosture(graphClient);

  if (posture.length === 0) {
    return {
      status: 'not_applicable',
      score: 100,
      actualResult: { domains: 0 },
      evidence: { reason: 'No mail-enabled verified domains found' }
    };
  }

  const failingEntities = [];
  const records = [];

  for (const entry of posture) {
    if (!entry.dmarc) {
      failingEntities.push({
        type: 'Domain',
        id: entry.domain,
        displayName: entry.domain,
        reason: 'No DMARC record published at _dmarc'
      });
      records.push({ domain: entry.domain, dmarc: null, policy: null });
      continue;
    }

    const tags = parseDmarc(entry.dmarc);
    const policy = (tags.p || '').toLowerCase();
    records.push({ domain: entry.domain, dmarc: entry.dmarc, policy, pct: tags.pct, rua: tags.rua });

    if (policy !== 'quarantine' && policy !== 'reject') {
      failingEntities.push({
        type: 'Domain',
        id: entry.domain,
        displayName: entry.domain,
        reason: policy
          ? `DMARC policy is p=${policy}, which requests no enforcement`
          : 'DMARC record has no p= tag',
        record: entry.dmarc
      });
    } else if (tags.pct && Number(tags.pct) < 100) {
      failingEntities.push({
        type: 'Domain',
        id: entry.domain,
        displayName: entry.domain,
        reason: `DMARC policy is p=${policy} but applies to only ${tags.pct}% of messages`,
        record: entry.dmarc
      });
    }
  }

  const isCompliant = failingEntities.length === 0;

  return {
    status: isCompliant ? 'compliant' : 'non_compliant',
    score: Math.round(((posture.length - failingEntities.length) / posture.length) * 100),
    actualResult: {
      domains: posture.length,
      domainsWithDmarc: posture.filter(e => e.dmarc).length,
      failingDomains: failingEntities.length
    },
    evidence: { failingEntities, records },
    remediationGuidance: isCompliant
      ? null
      : `${failingEntities.length} domain(s) lack an enforcing DMARC policy. Publish a DMARC record, collect `
        + 'aggregate (rua) reports until every legitimate sender is aligned, then raise the policy through '
        + 'p=quarantine to p=reject with pct=100. Without enforcement, SPF and DKIM only produce telemetry.'
  };
}

/** MAES-MAIL-03: DKIM signing enabled per domain. */
async function checkDkim(graphClient) {
  const posture = await getDnsPosture(graphClient);

  // The onmicrosoft.com initial domain is signed by Microsoft and needs no
  // customer-published selectors.
  const customDomains = posture.filter(e => !e.isInitial);

  if (customDomains.length === 0) {
    return {
      status: 'not_applicable',
      score: 100,
      actualResult: { customDomains: 0 },
      evidence: { reason: 'No custom mail-enabled domains found' }
    };
  }

  const failingEntities = customDomains
    .filter(e => e.dkimSelectors.length === 0)
    .map(e => ({
      type: 'Domain',
      id: e.domain,
      displayName: e.domain,
      reason: `No DKIM selector records found (checked ${EXCHANGE_DKIM_SELECTORS.join(', ')})`
    }));

  const isCompliant = failingEntities.length === 0;

  return {
    status: isCompliant ? 'compliant' : 'non_compliant',
    score: Math.round(((customDomains.length - failingEntities.length) / customDomains.length) * 100),
    actualResult: {
      customDomains: customDomains.length,
      domainsWithDkim: customDomains.length - failingEntities.length,
      selectorsChecked: EXCHANGE_DKIM_SELECTORS
    },
    evidence: {
      failingEntities,
      records: customDomains.map(e => ({ domain: e.domain, selectors: e.dkimSelectors }))
    },
    remediationGuidance: isCompliant
      ? null
      : `${failingEntities.length} custom domain(s) have no published DKIM selectors. Enable DKIM signing for each `
        + 'domain in the Microsoft 365 Defender portal and publish the selector1 and selector2 CNAME records. '
        + 'Unlike SPF, DKIM survives forwarding, which is what lets you raise DMARC to enforcement without '
        + 'breaking legitimate forwarded mail.'
  };
}

/** MAES-DNS-01: supporting mail and DNS security records. */
async function checkDnsPosture(graphClient) {
  const posture = await getDnsPosture(graphClient);
  const customDomains = posture.filter(e => !e.isInitial);

  if (customDomains.length === 0) {
    return {
      status: 'not_applicable',
      score: 100,
      actualResult: { customDomains: 0 },
      evidence: { reason: 'No custom verified domains found' }
    };
  }

  const failingEntities = [];

  for (const entry of customDomains) {
    const missing = [];
    if (!entry.caa || entry.caa.length === 0) missing.push('CAA');
    if (!entry.mtaSts) missing.push('MTA-STS');
    if (!entry.tlsRpt) missing.push('TLS-RPT');

    if (missing.length > 0) {
      failingEntities.push({
        type: 'Domain',
        id: entry.domain,
        displayName: entry.domain,
        reason: `Missing DNS security record(s): ${missing.join(', ')}`,
        missing
      });
    }
  }

  const isCompliant = failingEntities.length === 0;

  return {
    status: isCompliant ? 'compliant' : 'non_compliant',
    score: Math.round(((customDomains.length - failingEntities.length) / customDomains.length) * 100),
    actualResult: {
      customDomains: customDomains.length,
      domainsWithCaa: customDomains.filter(e => e.caa && e.caa.length > 0).length,
      domainsWithMtaSts: customDomains.filter(e => e.mtaSts).length,
      domainsWithTlsRpt: customDomains.filter(e => e.tlsRpt).length
    },
    evidence: {
      failingEntities,
      records: customDomains.map(e => ({
        domain: e.domain,
        caa: e.caa,
        mtaSts: Boolean(e.mtaSts),
        tlsRpt: Boolean(e.tlsRpt),
        lookupErrors: e.errors
      })),
      // Node's DNS resolver cannot query DS or DNSKEY records, so DNSSEC status
      // is not evaluated here and must be confirmed at the registrar.
      dnssecEvaluated: false
    },
    remediationGuidance: isCompliant
      ? null
      : `${failingEntities.length} domain(s) are missing supporting DNS security records. Publish a CAA record `
        + 'naming only the certificate authorities in use, deploy MTA-STS in testing mode with TLS-RPT reporting, '
        + 'then move MTA-STS to enforce once the reports are clean. Confirm DNSSEC separately at the registrar; '
        + 'it is not evaluated by this check.'
  };
}

module.exports = {
  'MAES-MAIL-01': checkSpf,
  'MAES-MAIL-02': checkDmarc,
  'MAES-MAIL-03': checkDkim,
  'MAES-DNS-01': checkDnsPosture,
  // exported for tests
  parseSpfAll,
  parseDmarc,
  EXCHANGE_DKIM_SELECTORS
};
