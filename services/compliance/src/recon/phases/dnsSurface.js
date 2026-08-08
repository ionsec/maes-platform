const { BasePhase } = require('./basePhase');

/**
 * Mail and DNS posture for the seed domain.
 *
 * Entirely passive: public DNS lookups only, no traffic to the organisation.
 */

const DKIM_SELECTORS = ['selector1', 'selector2', 'default', 'google', 'k1', 'mail', 'dkim', 's1', 's2'];

class DnsSurfacePhase extends BasePhase {
  static key = 'dns_surface';
  static title = 'DNS and mail authentication surface';
  static profile = 'passive';

  async run() {
    const domain = this.seedDomain;

    const [txt, dmarcTxt, mtaStsTxt, tlsRptTxt, mx, caa, ns] = await Promise.all([
      this.dns.txt(domain),
      this.dns.txt(`_dmarc.${domain}`),
      this.dns.txt(`_mta-sts.${domain}`),
      this.dns.txt(`_smtp._tls.${domain}`),
      this.dns.mx(domain),
      this.dns.caa(domain),
      this.dns.ns(domain)
    ]);

    const spf = txt.find(r => /^v=spf1\b/i.test(r)) || null;
    const dmarc = dmarcTxt.find(r => /^v=DMARC1\b/i.test(r)) || null;
    const mtaSts = mtaStsTxt.find(r => /^v=STSv1\b/i.test(r)) || null;
    const tlsRpt = tlsRptTxt.find(r => /^v=TLSRPTv1\b/i.test(r)) || null;

    this.state.mx = mx;
    this.state.usesExchangeOnline = mx.some(r => /\.mail\.protection\.outlook\.com$/i.test(r.exchange || ''));

    // SPF
    if (!spf) {
      this.emit('MAIL-SPF-MISSING', { target: domain, titleSuffix: domain, evidence: { txtRecords: txt } });
    } else {
      const all = (spf.match(/([-~?+])all\b/i) || [])[0] || null;
      if (all === '?all' || all === '+all') {
        this.emit('MAIL-SPF-PERMISSIVE', {
          target: domain,
          titleSuffix: `${domain} (${all})`,
          evidence: { record: spf, allMechanism: all }
        });
      }
    }

    // DMARC
    if (!dmarc) {
      this.emit('MAIL-DMARC-MISSING', { target: domain, titleSuffix: domain, evidence: {} });
    } else {
      const tags = parseDmarc(dmarc);
      const policy = (tags.p || '').toLowerCase();
      const pct = tags.pct ? Number(tags.pct) : 100;

      if (policy !== 'quarantine' && policy !== 'reject') {
        this.emit('MAIL-DMARC-NOT-ENFORCING', {
          target: domain,
          titleSuffix: `${domain} (p=${policy || 'unset'})`,
          evidence: { record: dmarc, policy, pct }
        });
      } else if (pct < 100) {
        this.emit('MAIL-DMARC-NOT-ENFORCING', {
          target: domain,
          titleSuffix: `${domain} (p=${policy}, pct=${pct})`,
          evidence: { record: dmarc, policy, pct }
        });
      }
    }

    // DKIM: report only when no selector at all resolves, since selector names
    // are free-form and absence of a guessed name proves nothing on its own.
    const foundSelectors = [];
    for (const selector of DKIM_SELECTORS) {
      const cname = await this.dns.cname(`${selector}._domainkey.${domain}`);
      if (cname.length > 0) foundSelectors.push({ selector, target: cname[0] });
    }

    if (foundSelectors.length === 0) {
      this.emit('MAIL-DKIM-MISSING', {
        target: domain,
        titleSuffix: domain,
        evidence: { selectorsChecked: DKIM_SELECTORS }
      });
    }

    if (caa.length === 0) {
      this.emit('DNS-CAA-MISSING', { target: domain, titleSuffix: domain, evidence: {} });
    }

    if (!mtaSts) {
      this.emit('DNS-MTASTS-MISSING', {
        target: domain,
        titleSuffix: domain,
        evidence: { tlsRptPresent: Boolean(tlsRpt) }
      });
    }

    this.state.dns = {
      spf,
      dmarc,
      mtaSts,
      tlsRpt,
      caa,
      nameServers: ns,
      dkimSelectors: foundSelectors,
      // TXT verification tokens reveal which SaaS platforms the organisation uses.
      verificationTokens: txt.filter(r => !/^v=spf1\b/i.test(r))
    };
  }
}

function parseDmarc(record) {
  const tags = {};
  for (const part of record.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key && rest.length > 0) tags[key.trim().toLowerCase()] = rest.join('=').trim();
  }
  return tags;
}

module.exports = { DnsSurfacePhase, parseDmarc, DKIM_SELECTORS };
