const { BasePhase } = require('./basePhase');

/**
 * Account-name validation check.
 *
 * Aggressive tier, and deliberately narrow. The goal is to establish *whether*
 * the tenant discloses account existence to unauthenticated callers — not to
 * harvest a user list. It therefore submits two probes: one obviously invalid
 * account, and one seed account supplied by the operator (if any). If the two
 * responses differ, enumeration is possible, and that is the finding.
 *
 * No password is ever submitted, and no wordlist is used.
 */
class UserEnumerationPhase extends BasePhase {
  static key = 'user_enumeration';
  static title = 'Account enumeration exposure';
  static profile = 'aggressive';

  async run() {
    const domain = this.seedDomain;

    // A random local part that cannot plausibly exist.
    const invalid = `maes-probe-${Math.random().toString(36).slice(2, 10)}@${domain}`;
    const seedUser = this.ctx.options?.seedUser || null;

    const invalidResult = await this._credentialType(invalid);
    if (!invalidResult) return;

    const knownResult = seedUser ? await this._credentialType(seedUser) : null;

    const differs = knownResult !== null
      && knownResult.ifExistsResult !== invalidResult.ifExistsResult;

    // Even without a seed account, a tenant that reports a definitive
    // "does not exist" for the random address is disclosing existence.
    const disclosesByItself = invalidResult.ifExistsResult === 1;

    if (differs || disclosesByItself) {
      this.emit('USER-ENUM-POSSIBLE', {
        target: domain,
        titleSuffix: domain,
        evidence: {
          method: 'GetCredentialType response differential',
          invalidAccountResponse: invalidResult,
          seedAccountResponse: knownResult,
          seedAccountSupplied: Boolean(seedUser),
          note: 'No passwords were submitted and no account list was harvested; '
            + 'this check establishes only whether account existence is disclosed.'
        }
      });
    }

    this.state.userEnumerationPossible = differs || disclosesByItself;
  }

  async _credentialType(username) {
    const result = await this.probe('https://login.microsoftonline.com/common/GetCredentialType', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: { username, isOtherIdpSupported: true }
    });

    if (!result.reachable || result.statusCode !== 200) return null;

    const body = parseBody(result.body);
    if (!body) return null;

    return {
      ifExistsResult: body.IfExistsResult ?? null,
      throttleStatus: body.ThrottleStatus ?? null,
      isUnmanaged: body.EstsProperties?.DomainType ?? null
    };
  }
}

function parseBody(body) {
  if (!body) return null;
  if (typeof body === 'object') return body;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

module.exports = { UserEnumerationPhase };
