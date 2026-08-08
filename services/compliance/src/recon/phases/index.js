const { TenantPhase } = require('./tenant');
const { DnsSurfacePhase } = require('./dnsSurface');
const { CertTransparencyPhase } = require('./certTransparency');
const { SubdomainTakeoverPhase } = require('./subdomainTakeover');
const { LeadsPhase } = require('./leads');
const { FederationProbePhase } = require('./federationProbe');
const { HttpHeadersPhase } = require('./httpHeaders');
const { AzureSurfacePhase } = require('./azureSurface');
const { M365SurfacePhase } = require('./m365Surface');
const { UserEnumerationPhase } = require('./userEnumeration');
const { CrossSaasPhase } = require('./crossSaas');

/**
 * Phase registry, mirroring services/extractor/src/extractors/index.js.
 *
 * Order matters: phases run sequentially and later ones consume the hostnames
 * and tenant details earlier ones write into shared state.
 */
const PHASES = [
  // Passive — public records only, nothing sent to the organisation's own hosts
  // except Microsoft's documented discovery endpoints.
  TenantPhase,
  DnsSurfacePhase,
  CertTransparencyPhase,
  SubdomainTakeoverPhase,
  LeadsPhase,

  // Standard — bounded active probing of the organisation's own surface.
  FederationProbePhase,
  HttpHeadersPhase,
  AzureSurfacePhase,
  M365SurfacePhase,

  // Aggressive — enumeration, and probing of third-party infrastructure.
  UserEnumerationPhase,
  CrossSaasPhase
];

/** Profiles in increasing order of aggressiveness. */
const PROFILE_ORDER = ['passive', 'standard', 'aggressive'];

/** Is `profile` at least as aggressive as `required`? */
function profileAllows(profile, required) {
  return PROFILE_ORDER.indexOf(profile) >= PROFILE_ORDER.indexOf(required);
}

/** Phase classes that run at the given profile. */
function phasesForProfile(profile) {
  if (!PROFILE_ORDER.includes(profile)) {
    throw new Error(`Unknown recon profile '${profile}'. Expected one of: ${PROFILE_ORDER.join(', ')}`);
  }
  return PHASES.filter(phase => profileAllows(profile, phase.profile));
}

const phaseRegistry = Object.fromEntries(PHASES.map(phase => [phase.key, phase]));

module.exports = {
  PHASES,
  PROFILE_ORDER,
  phaseRegistry,
  phasesForProfile,
  profileAllows
};
