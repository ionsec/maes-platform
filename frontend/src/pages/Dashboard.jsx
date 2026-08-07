import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Box, Button, Typography, Tooltip } from '@mui/material'
import { Warning } from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import axios from '../utils/axios'
import { useAlerts } from '../hooks/useAlerts'
import { useOrganization } from '../contexts/OrganizationContext'
import { useShell } from '../contexts/ShellContext'
import { HEALTH_SERVICES } from '../hooks/useSystemHealth'
import {
  KpiStrip,
  Panel,
  PanelHeader,
  MiniBar,
  SeverityPill,
  StatusDot,
  StatusPip,
  EmptyState,
} from '../components/ui'
import { surface, line, ink, accent, severity, sev, MONO, MOTION } from '../theme/tokens'
import { alertEntity, isUnassigned, isOpen, shortAge, bySeverityThenAge } from '../utils/alerts'

dayjs.extend(relativeTime)

const RANGE_DAYS = { '24h': 1, '7d': 7, '30d': 30, '90d': 90 }

/** Build the sparkline polyline the redesign draws over the detection trend. */
const points = (vals, max, w, h) =>
  vals
    .map((v, i) => `${(i * w) / Math.max(1, vals.length - 1)},${h - (v / Math.max(1, max)) * (h - 12)}`)
    .join(' ')

/**
 * Command Center — the redesign's home screen.
 *
 * Reads top-down: a posture strip that says whether anything needs a human
 * right now, the triage queue as the primary column, collection + platform
 * health beside it, then the detection trend.
 */
const Dashboard = () => {
  const navigate = useNavigate()
  const { alerts, loading: alertsLoading } = useAlerts()
  const { selectedOrganization, selectedOrganizationId } = useOrganization()
  const { range, health } = useShell()

  const [extractions, setExtractions] = useState([])
  const [analyses, setAnalyses] = useState([])
  const [incidentStats, setIncidentStats] = useState(null)
  const [uebaStats, setUebaStats] = useState(null)
  const [compliance, setCompliance] = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)

  const fetchData = useCallback(async () => {
    const orgQuery = selectedOrganizationId ? `?organizationId=${selectedOrganizationId}` : ''
    // Each panel degrades on its own: a 403 from a permission-gated summary
    // must not blank the whole screen.
    const soft = (p) => p.then((r) => r.data).catch(() => null)

    const [ext, ana, inc, ueba, comp] = await Promise.all([
      soft(axios.get(`/api/extractions${orgQuery}`)),
      soft(axios.get(`/api/analysis${orgQuery}`)),
      soft(axios.get('/api/incidents/stats/summary')),
      soft(axios.get('/api/ueba/stats')),
      selectedOrganizationId
        ? soft(axios.get(`/api/compliance/assessments/${selectedOrganizationId}?limit=1`))
        : Promise.resolve(null),
    ])

    setExtractions(ext?.extractions || [])
    setAnalyses(ana?.analysisJobs || [])
    setIncidentStats(inc?.stats || null)
    setUebaStats(ueba?.stats || null)
    setCompliance((comp?.assessments || comp?.data || [])[0] || null)
    setLastRefresh(new Date())
  }, [selectedOrganizationId])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 30000)
    return () => clearInterval(id)
  }, [fetchData])

  const openAlerts = useMemo(() => alerts.filter(isOpen), [alerts])
  const unassignedCritical = useMemo(
    () => openAlerts.filter((a) => a.severity === 'critical' && isUnassigned(a)),
    [openAlerts]
  )
  const unassigned = useMemo(() => openAlerts.filter(isUnassigned), [openAlerts])

  const oldestUnassigned = useMemo(() => {
    const times = unassigned.map((a) => a.createdAt || a.created_at).filter(Boolean)
    if (!times.length) return null
    return times.sort((a, b) => new Date(a) - new Date(b))[0]
  }, [unassigned])

  // Jobs still moving — the freshness signal in the posture strip.
  const runningJobs = useMemo(
    () => [...extractions, ...analyses].filter((j) => ['pending', 'running'].includes(j.status)),
    [extractions, analyses]
  )

  const complianceScore = compliance?.complianceScore ?? compliance?.compliance_score ?? null
  const failedControls = compliance?.failedControls ?? compliance?.failed_controls ?? null

  const posture = [
    {
      label: 'Unassigned critical',
      value: String(unassignedCritical.length),
      unit: unassignedCritical.length === 1 ? 'alert' : 'alerts',
      note: oldestUnassigned ? `oldest ${shortAge(oldestUnassigned)}` : 'queue clear',
      level: unassignedCritical.length ? 'critical' : 'ok',
    },
    {
      label: 'Open cases',
      value: String(incidentStats?.open ?? incidentStats?.total ?? 0),
      unit: incidentStats?.critical ? `${incidentStats.critical} critical` : '',
      note: incidentStats?.investigating ? `${incidentStats.investigating} investigating` : 'no active investigation',
      level: incidentStats?.critical ? 'critical' : 'high',
    },
    {
      label: 'Users at elevated risk',
      value: String(uebaStats?.elevated_risk ?? 0),
      unit: uebaStats?.total_baselines ? `of ${uebaStats.total_baselines}` : '',
      note: uebaStats?.avg_risk_score ? `avg score ${Math.round(uebaStats.avg_risk_score)}` : 'no baselines yet',
      level: Number(uebaStats?.elevated_risk) > 0 ? 'medium' : 'ok',
    },
    {
      label: 'CIS compliance',
      value: complianceScore != null ? String(Math.round(complianceScore)) : '—',
      unit: complianceScore != null ? '%' : '',
      note: failedControls != null ? `${failedControls} controls failing` : 'not assessed',
      level: complianceScore == null ? 'info' : complianceScore >= 80 ? 'ok' : 'medium',
    },
    {
      label: 'Evidence freshness',
      value: runningJobs.length ? String(runningJobs.length) : '—',
      unit: runningJobs.length ? 'running' : '',
      note: lastRefresh ? `refreshed ${dayjs(lastRefresh).fromNow()}` : 'loading…',
      level: 'ok',
    },
  ]

  const triage = useMemo(() => [...openAlerts].sort(bySeverityThenAge).slice(0, 6), [openAlerts])

  // Collection pipeline: the jobs actually worth watching — in flight first,
  // then the most recent failures.
  const pipeline = useMemo(() => {
    const all = [
      ...extractions.map((e) => ({ ...e, kind: 'extraction' })),
      ...analyses.map((a) => ({ ...a, kind: 'analysis' })),
    ]
    const active = all.filter((j) => ['pending', 'running'].includes(j.status))
    const failed = all.filter((j) => j.status === 'failed')
    return [...active, ...failed]
      .sort((a, b) => new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0))
      .slice(0, 5)
  }, [extractions, analyses])

  // Detection trend over the selected window, bucketed per day by severity band.
  const trend = useMemo(() => {
    const days = RANGE_DAYS[range] || 7
    const buckets = Array.from({ length: days }, () => ({ high: 0, medium: 0, low: 0 }))
    const start = dayjs().startOf('day').subtract(days - 1, 'day')
    alerts.forEach((a) => {
      const created = dayjs(a.createdAt || a.created_at)
      if (!created.isValid()) return
      const idx = created.startOf('day').diff(start, 'day')
      if (idx < 0 || idx >= days) return
      const band = ['critical', 'high'].includes(a.severity) ? 'high' : a.severity === 'medium' ? 'medium' : 'low'
      buckets[idx][band] += 1
    })
    const max = Math.max(1, ...buckets.flatMap((b) => [b.high, b.medium, b.low]))
    const labels = buckets.map((_, i) => start.add(i, 'day'))
    // A 90-day axis can't carry 90 labels; thin them to ~7.
    const step = Math.ceil(days / 7)
    return {
      max,
      high: points(buckets.map((b) => b.high), max, 900, 170),
      medium: points(buckets.map((b) => b.medium), max, 900, 170),
      low: points(buckets.map((b) => b.low), max, 900, 170),
      labels: labels.filter((_, i) => i % step === 0 || i === days - 1).map((d) => d.format('MMM D')),
      empty: buckets.every((b) => !b.high && !b.medium && !b.low),
    }
  }, [alerts, range])

  const healthyServices = HEALTH_SERVICES.filter((s) => health?.[s.key] === 'healthy').length
  const knownServices = HEALTH_SERVICES.filter((s) => health?.[s.key] && health[s.key] !== 'unknown').length

  const heroCopy = unassignedCritical.length
    ? `${unassignedCritical.length === 1 ? 'One critical alert is' : `${unassignedCritical.length} critical alerts are`} still unassigned${
        failedControls ? `, and ${failedControls} CIS controls are failing.` : '.'
      }`
    : unassigned.length
      ? `No unassigned criticals. ${unassigned.length} lower-severity ${unassigned.length === 1 ? 'alert' : 'alerts'} still need an owner.`
      : 'Nothing is waiting on a human. Every open alert has an owner.'

  return (
    <Box sx={{ p: '20px 24px 40px' }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '12px', mb: '4px', flexWrap: 'wrap' }}>
        <Typography variant="h1" data-tour="dashboard-title">
          Command Center
        </Typography>
        <Box component="span" sx={{ fontSize: '.75rem', color: ink.faint }}>
          {[
            selectedOrganization?.organization_name,
            `last ${range}`,
            lastRefresh ? `refreshed ${dayjs(lastRefresh).fromNow()}` : 'loading…',
          ]
            .filter(Boolean)
            .join(' · ')}
        </Box>
      </Box>
      <Typography sx={{ m: 0, mb: '20px', fontSize: '.8125rem', color: ink.secondary, maxWidth: '70ch', textWrap: 'pretty' }}>
        {heroCopy}
      </Typography>

      <KpiStrip items={posture} sx={{ mb: '20px' }} data-tour="metrics-cards" />

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          alignItems: 'start',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0,1.6fr) minmax(0,1fr)' },
        }}
      >
        {/* Triage queue — the primary column */}
        <Panel data-tour="recent-jobs">
          <PanelHeader
            title="Triage queue"
            meta={`${unassigned.length} unassigned`}
            action={
              <Box
                component="a"
                href="/alerts"
                onClick={(e) => {
                  e.preventDefault()
                  navigate('/alerts')
                }}
                sx={{ fontSize: '.75rem' }}
              >
                Open all alerts
              </Box>
            }
          />
          {alertsLoading && !triage.length ? (
            <EmptyState title="Loading alerts…" />
          ) : !triage.length ? (
            <EmptyState title="No open alerts" hint="Detections will appear here as analysis runs complete." />
          ) : (
            triage.map((a) => (
              <Box
                key={a.id}
                onClick={() => navigate(`/alerts?alert=${a.id}`)}
                sx={{
                  display: 'flex',
                  borderBottom: `1px solid ${line.soft}`,
                  cursor: 'pointer',
                  transition: `background ${MOTION}`,
                  '&:hover': { background: surface.hover },
                  '&:last-of-type': { borderBottom: 'none' },
                }}
              >
                <Box sx={{ width: 3, flex: 'none', background: sev(a.severity) }} />
                <Box sx={{ flex: 1, minWidth: 0, p: '11px 16px', display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: '3px' }}>
                      <SeverityPill level={a.severity} />
                      <Box
                        sx={{
                          fontSize: '.8125rem',
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {a.title}
                      </Box>
                    </Box>
                    <Box
                      sx={{
                        fontSize: '.75rem',
                        color: ink.tertiary,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {alertEntity(a)}
                      {a.description ? ` — ${a.description}` : ''}
                    </Box>
                  </Box>
                  <Box sx={{ flex: 'none', textAlign: 'right' }}>
                    <Box sx={{ fontSize: '.75rem', color: ink.secondary }}>
                      {shortAge(a.createdAt || a.created_at)}
                    </Box>
                    <Box sx={{ fontSize: '.6875rem', color: isUnassigned(a) ? severity.high : ink.faint }}>
                      {isUnassigned(a) ? 'Unassigned' : 'Assigned'}
                    </Box>
                  </Box>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation()
                      navigate(`/alerts?alert=${a.id}`)
                    }}
                    sx={{ flex: 'none' }}
                  >
                    {isUnassigned(a) ? 'Take' : 'Open'}
                  </Button>
                </Box>
              </Box>
            ))
          )}
        </Panel>

        {/* Secondary column */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Panel>
            <PanelHeader
              title="Collection pipeline"
              action={
                <Box
                  component="a"
                  href="/extractions"
                  onClick={(e) => {
                    e.preventDefault()
                    navigate('/extractions')
                  }}
                  sx={{ fontSize: '.75rem' }}
                >
                  Manage
                </Box>
              }
            />
            <Box sx={{ p: '8px 16px 14px' }}>
              {!pipeline.length ? (
                <EmptyState title="Nothing in flight" hint="No running or failed jobs." />
              ) : (
                pipeline.map((j) => {
                  const failed = j.status === 'failed'
                  const level = failed ? 'critical' : j.status === 'running' ? 'low' : 'info'
                  return (
                    <Box
                      key={`${j.kind}-${j.id}`}
                      sx={{ py: 1, borderBottom: `1px solid ${line.soft}`, '&:last-of-type': { borderBottom: 'none' } }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: '6px' }}>
                        <StatusDot level={level} size={6} />
                        <Box
                          sx={{
                            fontSize: '.8125rem',
                            flex: 1,
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {j.type || j.name || j.kind}
                        </Box>
                        <Box sx={{ fontSize: '.75rem', color: ink.secondary, fontFamily: MONO, flex: 'none' }}>
                          {failed ? 'failed' : `${Math.round(j.progress || 0)}%`}
                        </Box>
                      </Box>
                      <MiniBar value={j.progress || 0} level={level} />
                    </Box>
                  )
                })
              )}
            </Box>
          </Panel>

          <Panel pad data-tour="monitoring-tools">
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px', mb: '12px' }}>
              <Box sx={{ fontSize: '.8125rem', fontWeight: 600 }}>Platform health</Box>
              <Box
                sx={{
                  ml: 'auto',
                  fontSize: '.6875rem',
                  color: health?.overallStatus === 'healthy' ? severity.ok : ink.secondary,
                }}
              >
                {knownServices ? `${healthyServices} / ${knownServices} healthy` : 'checking…'}
              </Box>
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {HEALTH_SERVICES.map((s) => (
                <Tooltip key={s.key} title={`${s.description} — ${health?.[s.key] || 'unknown'}`}>
                  <StatusPip level={health?.[s.key] || 'unknown'} label={s.label} />
                </Tooltip>
              ))}
            </Box>
            <Box
              sx={{
                mt: '12px',
                pt: '12px',
                borderTop: `1px solid ${line.soft}`,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <Warning sx={{ fontSize: 16, color: health?.overallStatus === 'healthy' ? ink.dim : severity.high }} />
              <Box sx={{ fontSize: '.75rem', color: ink.secondary, flex: 1 }}>
                {health?.overallStatus === 'healthy'
                  ? 'No service failures reported'
                  : health?.overallStatus
                    ? 'One or more services are unhealthy'
                    : 'Health check pending'}
              </Box>
              <Box
                component="a"
                href="/system-logs"
                onClick={(e) => {
                  e.preventDefault()
                  navigate('/system-logs')
                }}
                sx={{ fontSize: '.75rem' }}
              >
                Logs
              </Box>
            </Box>
          </Panel>
        </Box>
      </Box>

      {/* Detections over time */}
      <Panel pad sx={{ mt: 2 }} data-tour="activity-chart">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1, flexWrap: 'wrap' }}>
          <Box sx={{ fontSize: '.8125rem', fontWeight: 600 }}>Detections over time</Box>
          <Box sx={{ display: 'flex', gap: '14px', ml: 'auto', fontSize: '.6875rem', color: ink.secondary }}>
            {[
              ['Critical / high', severity.critical],
              ['Medium', severity.high],
              ['Low / info', accent.main],
            ].map(([label, color]) => (
              <Box key={label} sx={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <Box component="span" sx={{ width: 10, height: 2, background: color, display: 'inline-block' }} />
                {label}
              </Box>
            ))}
          </Box>
        </Box>
        {trend.empty ? (
          <EmptyState title="No detections in this window" hint={`Nothing raised in the last ${range}.`} />
        ) : (
          <>
            <Box
              component="svg"
              viewBox="0 0 900 180"
              preserveAspectRatio="none"
              sx={{ width: '100%', height: 180, display: 'block' }}
            >
              <g stroke={line.soft}>
                <line x1="0" y1="45" x2="900" y2="45" />
                <line x1="0" y1="90" x2="900" y2="90" />
                <line x1="0" y1="135" x2="900" y2="135" />
                <line x1="0" y1="170" x2="900" y2="170" />
              </g>
              <polyline fill="none" stroke={accent.main} strokeWidth="1.5" points={trend.low} />
              <polyline fill="none" stroke={severity.high} strokeWidth="1.5" points={trend.medium} />
              <polyline fill="none" stroke={severity.critical} strokeWidth="2" points={trend.high} />
            </Box>
            <Box
              sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '.6875rem', color: ink.dim, mt: '6px' }}
            >
              {trend.labels.map((l) => (
                <Box component="span" key={l}>
                  {l}
                </Box>
              ))}
            </Box>
          </>
        )}
      </Panel>
    </Box>
  )
}

export default Dashboard
