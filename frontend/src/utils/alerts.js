/**
 * Shared alert shaping helpers. The API returns `affected_entities` as a loose
 * JSONB blob, so the redesign's "principal" line needs one canonical reading
 * that the Command Center triage queue and the Alerts screen both use.
 */

const ENTITY_KEYS = ['user', 'userPrincipalName', 'upn', 'email', 'account', 'principal', 'ip', 'ipAddress', 'host', 'device', 'application', 'app', 'resource']

/** Best-effort human principal for an alert. */
export const alertEntity = (alert) => {
  const e = alert?.affectedEntities || alert?.affected_entities
  if (!e) return '—'
  if (typeof e === 'string') return e
  if (Array.isArray(e)) return e.length ? String(e[0]) : '—'
  for (const k of ENTITY_KEYS) {
    const v = e[k]
    if (typeof v === 'string' && v) return v
    if (Array.isArray(v) && v.length) return String(v[0])
  }
  const first = Object.values(e).find((v) => typeof v === 'string' && v)
  return first || '—'
}

/** 'account_management' → 'account management' */
export const alertCategory = (alert) => String(alert?.category || 'other').replace(/_/g, ' ')

/** Unowned alerts are what the triage queue is for. */
export const isUnassigned = (alert) => !(alert?.assignedTo || alert?.assigned_to)

export const alertOwnerLabel = (alert) => {
  if (!isUnassigned(alert)) return alert.assignedToName || alert.assigned_to_name || 'Assigned'
  return 'Unassigned'
}

export const isOpen = (alert) => !['resolved', 'false_positive'].includes(alert?.status)

/** Compact age: 12m / 3h / 2d. */
export const shortAge = (iso) => {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms)) return '—'
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

/** Critical / high / medium / low first — the order the queue must show. */
const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 }
export const bySeverityThenAge = (a, b) => {
  const d = (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9)
  if (d !== 0) return d
  return new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0)
}
