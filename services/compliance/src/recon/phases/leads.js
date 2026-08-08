const { BasePhase } = require('./basePhase');

/**
 * Analyst leads for the externally-keyed intelligence sources.
 *
 * Code search, breach corpora and web-search dorking all require a third-party
 * API credential. MAES will not spend someone's API quota — or send their
 * domain to a third party — without that being configured deliberately, so
 * where no credential is present this phase emits the queries for an analyst
 * to run rather than executing them.
 *
 * Runs at every profile: producing a lead costs nothing and touches nothing.
 */
class LeadsPhase extends BasePhase {
  static key = 'leads';
  static title = 'Analyst leads';
  static profile = 'passive';

  async run() {
    const domain = this.seedDomain;
    const slug = domain.split('.')[0];
    const tenantId = this.state.tenantId;
    const credentials = this.ctx.options?.externalCredentials || {};

    if (!credentials.codeSearchToken) {
      this.emitLead('LEAD-CODE-SEARCH', {
        target: domain,
        titleSuffix: domain,
        evidence: {
          reason: 'No code-search API credential configured for this organisation',
          queries: [
            `"${domain}" password`,
            `"${domain}" client_secret`,
            `"${domain}" AZURE_CLIENT_SECRET`,
            `"${slug}" "login.microsoftonline.com" client_secret`,
            tenantId ? `"${tenantId}"` : null,
            `"${domain}" "webhookb2"`,
            `"${slug}.blob.core.windows.net" sig=`,
            `"${slug}" "logic.azure.com" "sig="`
          ].filter(Boolean)
        }
      });
    }

    if (!credentials.breachIntelKey) {
      this.emitLead('LEAD-BREACH-INTEL', {
        target: domain,
        titleSuffix: domain,
        evidence: {
          reason: 'No breach-intelligence API credential configured for this organisation',
          lookups: [
            `Domain breach search for ${domain}`,
            `Paste-site search for "${domain}"`,
            `Credential-stuffing corpus check for ${domain} accounts`
          ]
        }
      });
    }
  }
}

module.exports = { LeadsPhase };
