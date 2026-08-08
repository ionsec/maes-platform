const federation = require('./federation');
const authSurface = require('./authSurface');
const mfa = require('./mfa');
const conditionalAccess = require('./conditionalAccess');
const servicePrincipals = require('./servicePrincipals');
const mail = require('./mail');

/**
 * Checker modules for the maes_entra_v100 control set.
 *
 * Each module exports a map of control_id -> async (graphClient, control).
 * Modules also export constants for testing, so only keys matching the
 * MAES-<SECTION>-<NN> control id shape are treated as checkers.
 */
const MODULES = [federation, authSurface, mfa, conditionalAccess, servicePrincipals, mail];

const CONTROL_ID_PATTERN = /^MAES-[A-Z]+-\d+$/;

function collectCheckers() {
  const checkers = new Map();

  for (const module of MODULES) {
    for (const [key, value] of Object.entries(module)) {
      if (!CONTROL_ID_PATTERN.test(key)) continue;
      if (typeof value !== 'function') continue;
      if (checkers.has(key)) {
        throw new Error(`Duplicate control checker registered for ${key}`);
      }
      checkers.set(key, value);
    }
  }

  return checkers;
}

module.exports = { collectCheckers, CONTROL_ID_PATTERN };
