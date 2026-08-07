/**
 * MAES Redesign design tokens.
 *
 * Single source of truth for the redesign's surfaces, borders, severity ramp
 * and the repeated inline recipes (severity pill, status dot, quiet filter
 * chip, table header/cell). Ported verbatim from the `MAES Redesign.dc.html`
 * design spec so components and the MUI theme cannot drift apart.
 */

// Surfaces: page → panel → raised panel → hover row
export const surface = {
  page: '#0A0A0A',
  chrome: '#111111', // sidebar, topbar, detail pane
  panel: '#141414', // cards, tables
  raised: '#171717', // table head, selected row
  hover: '#181818',
  input: '#0A0A0A',
  knob: '#2B2B2B',
}

// Borders, hairlines outward-in
export const line = {
  strong: '#333333', // control borders
  base: '#262626', // panel borders, section dividers
  soft: '#1E1E1E', // in-panel row dividers
  faint: '#1C1C1C', // table row dividers
  muted: '#3A3A3A', // inert / not-applicable
}

export const ink = {
  primary: '#FFFFFF',
  body: '#E0E0E0',
  strong: '#C9C9C9',
  muted: '#B5B5B5',
  secondary: '#8A8A8A',
  tertiary: '#7A7A7A',
  quiet: '#7D7D7D',
  faint: '#6B6B6B',
  dim: '#5C5C5C',
}

export const accent = {
  main: '#00E5FF',
  hover: '#5CEEFF',
  light: '#4FC3F7',
  dark: '#0097A7',
  on: '#001014', // text on a cyan fill
  border: '#1E4A52', // cyan-tinted outline
  wash: 'rgba(0, 229, 255, 0.12)',
  washSoft: 'rgba(0, 229, 255, 0.10)',
  washRing: 'rgba(0, 229, 255, 0.35)',
  track: 'rgba(0, 229, 255, 0.35)',
}

/** Severity ramp — the spine of the whole design. */
export const severity = {
  critical: '#FF4444',
  high: '#FF9800',
  medium: '#FFC107',
  low: '#00E5FF',
  info: '#7A7A7A',
  ok: '#00E676',
}

export const EASE = 'cubic-bezier(.4,0,.2,1)'
export const MOTION = `.12s ${EASE}`
export const MONO = "'Roboto Mono', Consolas, Monaco, monospace"

export const SIDEBAR_WIDTH = 224
export const TOPBAR_HEIGHT = 52
export const DETAIL_PANE_WIDTH = 400

/**
 * Resolve any severity-ish string to a ramp color. Accepts the ramp keys plus
 * the status vocabulary the API actually returns (completed, failed, running,
 * new, resolved, …) so callers never have to map twice.
 */
const STATUS_TO_SEVERITY = {
  critical: 'critical',
  failed: 'critical',
  error: 'critical',
  unhealthy: 'critical',
  noncompliant: 'critical',
  'non-compliant': 'critical',
  high: 'high',
  warning: 'high',
  degraded: 'high',
  investigating: 'high',
  unassigned: 'high',
  generating: 'high',
  manual: 'high',
  'manual review': 'high',
  medium: 'medium',
  elevated: 'medium',
  blocked: 'medium',
  low: 'low',
  running: 'low',
  new: 'low',
  admin: 'low',
  ok: 'ok',
  completed: 'ok',
  compliant: 'ok',
  healthy: 'ok',
  active: 'ok',
  resolved: 'ok',
  contained: 'ok',
  success: 'ok',
  info: 'info',
  queued: 'info',
  pending: 'info',
  normal: 'info',
  inactive: 'info',
  unknown: 'info',
  viewer: 'info',
  analyst: 'info',
}

export const sev = (level) => {
  if (!level) return severity.info
  const key = String(level).toLowerCase()
  return severity[STATUS_TO_SEVERITY[key] || key] || severity.info
}

/** Numeric risk/score → severity key, matching the spec's 70/40/20 breaks. */
export const sevForScore = (n) => {
  const v = Number(n) || 0
  if (v >= 70) return 'critical'
  if (v >= 40) return 'high'
  if (v >= 20) return 'medium'
  return 'ok'
}

/** 18px uppercase severity/status pill. */
export const pill = (color, filled) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  height: 18,
  padding: '0 7px',
  borderRadius: '3px',
  fontSize: '.625rem',
  fontWeight: 600,
  letterSpacing: '.04em',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
  color,
  background: filled || `${color}1f`,
  border: `1px solid ${color}4d`,
})

/** Small status dot. */
export const dot = (color, size = 7) => ({
  width: size,
  height: size,
  borderRadius: '50%',
  flex: 'none',
  background: color,
  display: 'inline-block',
})

/** 26px quiet filter chip, cyan-washed when active. */
export const chipQuiet = (active) => ({
  height: 26,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '0 10px',
  borderRadius: '5px',
  fontSize: '.75rem',
  fontWeight: 500,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  userSelect: 'none',
  transition: `background ${MOTION}, border-color ${MOTION}`,
  ...(active
    ? { background: accent.wash, color: accent.main, border: `1px solid ${accent.washRing}` }
    : { background: 'transparent', color: ink.secondary, border: `1px solid ${line.base}` }),
})

/** Uppercase section eyebrow used above every detail block. */
export const eyebrow = {
  fontSize: '.625rem',
  fontWeight: 600,
  letterSpacing: '.1em',
  textTransform: 'uppercase',
  color: ink.dim,
}

export default {
  surface,
  line,
  ink,
  accent,
  severity,
  sev,
  sevForScore,
  pill,
  dot,
  chipQuiet,
  eyebrow,
  EASE,
  MOTION,
  MONO,
  SIDEBAR_WIDTH,
  TOPBAR_HEIGHT,
  DETAIL_PANE_WIDTH,
}
