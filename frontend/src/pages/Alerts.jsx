import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Box,
  Button,
  IconButton,
  Typography,
  Menu,
  MenuItem,
  ListItemIcon,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Pagination,
  Select,
  FormControl,
  InputLabel,
} from '@mui/material'
import {
  MoreHoriz,
  Bolt,
  CheckCircle,
  PersonAdd,
  FolderSpecial,
  DeleteOutline,
  DoneAll,
  Refresh as RefreshIcon,
} from '@mui/icons-material'
import { useSearchParams } from 'react-router-dom'
import { useSnackbar } from 'notistack'
import dayjs from 'dayjs'
import axios from '../utils/axios'
import { useAuthStore } from '../stores/authStore'
import { useOrganization } from '../contexts/OrganizationContext'
import { useShell } from '../contexts/ShellContext'
import {
  SeverityPill,
  FilterChips,
  Eyebrow,
  FactRow,
  TimelineRow,
  EmptyState,
  BoxIconButton,
} from '../components/ui'
import {
  surface,
  line,
  ink,
  accent,
  severity,
  sev,
  MONO,
  MOTION,
  TOPBAR_HEIGHT,
  DETAIL_PANE_WIDTH,
} from '../theme/tokens'
import { alertEntity, alertCategory, isUnassigned, isOpen, shortAge, bySeverityThenAge } from '../utils/alerts'

const PAGE_SIZE = 20

/**
 * Named filters over the alert queue. `open` is the default because the queue
 * exists to answer "what still needs a human", not "what has ever fired".
 */
const FILTERS = [
  { value: 'open', label: 'Open' },
  { value: 'unassigned', label: 'Unassigned' },
  { value: 'severe', label: 'Critical & high' },
  { value: 'mine', label: 'Assigned to me' },
  { value: 'all', label: 'All' },
]

/**
 * Alerts — the redesign's two-pane triage screen. The list is the queue; the
 * 400px pane on the right carries everything needed to decide without leaving:
 * evidence, lifecycle timeline, and the recommended playbook.
 */
const Alerts = () => {
  const { enqueueSnackbar } = useSnackbar()
  const { selectedOrganizationId } = useOrganization()
  const currentUser = useAuthStore((s) => s.user)
  const { narrow } = useShell()
  const [searchParams, setSearchParams] = useSearchParams()

  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('open')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ total: 0, pages: 1 })
  const [selectedId, setSelectedId] = useState(searchParams.get('alert') || null)

  const [menuAnchor, setMenuAnchor] = useState(null)
  const [bulkAnchor, setBulkAnchor] = useState(null)
  const [resolveTarget, setResolveTarget] = useState(null)
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [assignTarget, setAssignTarget] = useState(null)
  const [assignee, setAssignee] = useState('')
  const [orgUsers, setOrgUsers] = useState([])
  const [escalateTarget, setEscalateTarget] = useState(null)

  const fetchAlerts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      // Only server-side filters go on the wire; the rest are client predicates
      // over the returned page.
      if (filter === 'severe') params.append('severity', 'critical')
      if (selectedOrganizationId) params.append('organizationId', selectedOrganizationId)
      params.append('limit', String(PAGE_SIZE))
      params.append('page', String(page))

      const res = await axios.get(`/api/alerts?${params}`)
      setAlerts(res.data.alerts || [])
      setPagination(res.data.pagination || { total: 0, pages: 1 })
    } catch (error) {
      enqueueSnackbar('Failed to fetch alerts', { variant: 'error' })
    } finally {
      setLoading(false)
    }
  }, [filter, selectedOrganizationId, page, enqueueSnackbar])

  useEffect(() => {
    fetchAlerts()
  }, [fetchAlerts])

  useEffect(() => {
    const id = setInterval(fetchAlerts, 15000)
    return () => clearInterval(id)
  }, [fetchAlerts])

  // Users are only needed once the assign dialog opens.
  useEffect(() => {
    if (!assignTarget || orgUsers.length) return
    axios
      .get('/api/users')
      .then((r) => setOrgUsers(r.data.users || []))
      .catch(() => setOrgUsers([]))
  }, [assignTarget, orgUsers.length])

  const visible = useMemo(() => {
    const mine = (a) => (a.assignedTo || a.assigned_to) === currentUser?.id
    const pred = {
      open: isOpen,
      unassigned: (a) => isOpen(a) && isUnassigned(a),
      severe: (a) => ['critical', 'high'].includes(a.severity),
      mine,
      all: () => true,
    }[filter]
    return alerts.filter(pred).sort(bySeverityThenAge)
  }, [alerts, filter, currentUser?.id])

  // Keep a selection alive across refreshes and filter changes.
  const selected = useMemo(
    () => visible.find((a) => a.id === selectedId) || visible[0] || null,
    [visible, selectedId]
  )

  useEffect(() => {
    if (selected?.id && selected.id !== searchParams.get('alert')) {
      const next = new URLSearchParams(searchParams)
      next.set('alert', selected.id)
      setSearchParams(next, { replace: true })
    }
  }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const openCount = alerts.filter(isOpen).length
  const criticalCount = alerts.filter((a) => a.severity === 'critical' && isOpen(a)).length

  /** Run a mutation, report it, and refresh the queue. */
  const act = async (fn, okMessage, failMessage) => {
    try {
      await fn()
      enqueueSnackbar(okMessage, { variant: 'success' })
      fetchAlerts()
      return true
    } catch (error) {
      enqueueSnackbar(error?.response?.data?.error || failMessage, { variant: 'error' })
      return false
    }
  }

  const acknowledge = (a) =>
    act(() => axios.put(`/api/alerts/${a.id}/acknowledge`), 'Alert acknowledged', 'Failed to acknowledge alert')

  const assignToMe = (a) => {
    if (!currentUser?.id) {
      enqueueSnackbar('Cannot resolve your user id — sign in again', { variant: 'error' })
      return
    }
    return act(
      () => axios.put(`/api/alerts/${a.id}/assign`, { assignedTo: currentUser.id }),
      'Alert assigned to you',
      'Failed to assign alert'
    )
  }

  const submitAssign = async () => {
    if (!assignee) return
    const ok = await act(
      () => axios.put(`/api/alerts/${assignTarget.id}/assign`, { assignedTo: assignee }),
      'Alert assigned',
      'Failed to assign alert'
    )
    if (ok) {
      setAssignTarget(null)
      setAssignee('')
    }
  }

  const submitResolve = async () => {
    const ok = await act(
      () => axios.put(`/api/alerts/${resolveTarget.id}/resolve`, { resolutionNotes }),
      'Alert resolved',
      'Failed to resolve alert'
    )
    if (ok) {
      setResolveTarget(null)
      setResolutionNotes('')
    }
  }

  const submitDelete = async () => {
    const ok = await act(() => axios.delete(`/api/alerts/${deleteTarget.id}`), 'Alert deleted', 'Failed to delete alert')
    if (ok) setDeleteTarget(null)
  }

  const submitEscalate = async () => {
    const a = escalateTarget
    const ok = await act(
      () =>
        axios.post('/api/incidents', {
          title: a.title,
          description: a.description || a.title,
          severity: a.severity,
          alertIds: [a.id],
        }),
      'Case opened from alert',
      'Failed to open a case'
    )
    if (ok) setEscalateTarget(null)
  }

  const bulkOnVisible = async (fn, verb) => {
    setBulkAnchor(null)
    const targets = visible.filter(isOpen)
    if (!targets.length) return
    await act(() => Promise.all(targets.map(fn)), `${targets.length} alerts ${verb}`, `Failed to ${verb} some alerts`)
  }

  /** Lifecycle timeline assembled from the alert's own timestamps. */
  const timeline = useMemo(() => {
    if (!selected) return []
    const rows = [
      {
        text: `Detection raised${selected.source?.type ? ` by ${selected.source.type}` : ''}`,
        time: dayjs(selected.createdAt || selected.created_at).format('MMM D, HH:mm:ss'),
        level: selected.severity,
      },
    ]
    const acked = selected.acknowledgedAt || selected.acknowledged_at
    if (acked) {
      rows.push({ text: 'Acknowledged by analyst', time: dayjs(acked).format('MMM D, HH:mm:ss'), level: 'high' })
    }
    if (selected.assignedTo || selected.assigned_to) {
      rows.push({ text: 'Assigned to an owner', time: 'ownership taken', level: 'low' })
    }
    const resolved = selected.resolvedAt || selected.resolved_at
    if (resolved) {
      rows.push({
        text: selected.resolutionNotes || selected.resolution_notes || 'Resolved',
        time: dayjs(resolved).format('MMM D, HH:mm:ss'),
        level: 'ok',
      })
    } else {
      rows.push({
        text: isUnassigned(selected) ? 'Awaiting analyst assignment' : 'Open with an owner',
        time: 'now',
        color: line.muted,
      })
    }
    return rows
  }, [selected])

  const recommendations = useMemo(() => {
    const r = selected?.recommendations
    if (!Array.isArray(r)) return []
    return r.map((step) => (typeof step === 'string' ? { text: step } : step))
  }, [selected])

  const facts = useMemo(() => {
    if (!selected) return []
    const src = selected.source || {}
    return [
      { k: 'Principal', v: alertEntity(selected) },
      { k: 'Category', v: alertCategory(selected) },
      { k: 'Type', v: selected.type || '—' },
      { k: 'Source', v: src.type || src.name || 'MAES analysis' },
      { k: 'First seen', v: dayjs(selected.createdAt || selected.created_at).toISOString() },
      {
        k: 'Last seen',
        v: dayjs(selected.updatedAt || selected.updated_at || selected.createdAt || selected.created_at).toISOString(),
      },
      { k: 'Status', v: selected.status },
      ...(selected.description ? [{ k: 'Detail', v: selected.description }] : []),
    ]
  }, [selected])

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: narrow ? 'column' : 'row',
        ...(narrow ? null : { height: `calc(100vh - ${TOPBAR_HEIGHT}px)` }),
      }}
    >
      {/* Queue */}
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRight: narrow ? 'none' : `1px solid ${line.base}`,
        }}
      >
        <Box sx={{ flex: 'none', p: '16px 20px 12px', borderBottom: `1px solid ${line.base}` }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px', mb: '12px', flexWrap: 'wrap' }}>
            <Typography variant="h1" data-tour="alerts-title">
              Alerts
            </Typography>
            <Box component="span" sx={{ fontSize: '.75rem', color: ink.secondary, whiteSpace: 'nowrap' }}>
              {openCount} open · {criticalCount} critical
            </Box>
            <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
              <BoxIconButton title="Refresh" onClick={fetchAlerts}>
                <RefreshIcon sx={{ fontSize: 16 }} />
              </BoxIconButton>
              <Button variant="contained" onClick={(e) => setBulkAnchor(e.currentTarget)} data-tour="bulk-triage">
                Bulk triage
              </Button>
            </Box>
          </Box>
          <FilterChips
            options={FILTERS}
            value={filter}
            onChange={(v) => {
              setFilter(v)
              setPage(1)
            }}
          />
        </Box>

        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {loading && !visible.length ? (
            <EmptyState title="Loading alerts…" />
          ) : !visible.length ? (
            <EmptyState
              icon={<CheckCircle />}
              title="Nothing matches this filter"
              hint={filter === 'open' ? 'Every alert has been resolved.' : 'Try a different filter.'}
            />
          ) : (
            visible.map((a) => {
              const active = a.id === selected?.id
              return (
                <Box
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  sx={{
                    display: 'flex',
                    cursor: 'pointer',
                    borderBottom: `1px solid ${line.faint}`,
                    background: active ? surface.raised : 'transparent',
                    transition: `background ${MOTION}`,
                    '&:hover': { background: active ? surface.raised : '#1A1A1A' },
                  }}
                >
                  <Box sx={{ width: 3, flex: 'none', background: sev(a.severity) }} />
                  <Box sx={{ flex: 1, minWidth: 0, p: '10px 16px' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <SeverityPill level={a.severity} />
                      <Box
                        sx={{
                          fontSize: '.8125rem',
                          fontWeight: 500,
                          flex: 1,
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {a.title}
                      </Box>
                      <Box component="span" sx={{ fontSize: '.6875rem', color: ink.faint, flex: 'none' }}>
                        {shortAge(a.createdAt || a.created_at)}
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', mt: '4px', minWidth: 0 }}>
                      <Box
                        component="span"
                        sx={{
                          fontSize: '.6875rem',
                          color: ink.secondary,
                          fontFamily: MONO,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: 190,
                          minWidth: 0,
                        }}
                      >
                        {alertEntity(a)}
                      </Box>
                      <Box
                        component="span"
                        sx={{
                          fontSize: '.6875rem',
                          color: ink.faint,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {alertCategory(a)}
                      </Box>
                      <Box
                        component="span"
                        sx={{
                          ml: 'auto',
                          flex: 'none',
                          whiteSpace: 'nowrap',
                          fontSize: '.625rem',
                          fontWeight: 600,
                          letterSpacing: '.04em',
                          textTransform: 'uppercase',
                          color: isUnassigned(a)
                            ? severity.high
                            : a.status === 'resolved'
                              ? severity.ok
                              : ink.quiet,
                        }}
                      >
                        {isUnassigned(a) && isOpen(a) ? 'unassigned' : a.status}
                      </Box>
                    </Box>
                  </Box>
                </Box>
              )
            })
          )}
        </Box>

        {pagination.pages > 1 && (
          <Box sx={{ flex: 'none', p: '10px 16px', borderTop: `1px solid ${line.base}`, display: 'flex' }}>
            <Pagination
              size="small"
              count={pagination.pages}
              page={page}
              onChange={(_, v) => setPage(v)}
              sx={{ mx: 'auto' }}
            />
          </Box>
        )}
      </Box>

      {/* Detail pane */}
      <Box
        sx={{
          width: narrow ? '100%' : DETAIL_PANE_WIDTH,
          flex: 'none',
          overflow: narrow ? 'visible' : 'auto',
          background: surface.chrome,
          ...(narrow ? { borderTop: `1px solid ${line.base}` } : null),
        }}
      >
        {!selected ? (
          <EmptyState title="No alert selected" hint="Pick an alert from the queue." />
        ) : (
          <>
            <Box sx={{ p: '16px 20px', borderBottom: `1px solid ${line.base}` }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <SeverityPill level={selected.severity} />
                <Box component="span" sx={{ fontSize: '.6875rem', color: ink.faint, fontFamily: MONO }}>
                  {String(selected.id).slice(0, 8)}
                </Box>
              </Box>
              <Box sx={{ fontSize: '.9375rem', fontWeight: 600, lineHeight: 1.35, textWrap: 'pretty' }}>
                {selected.title}
              </Box>
              <Box sx={{ display: 'flex', gap: 1, mt: '12px' }}>
                {isUnassigned(selected) ? (
                  <Button variant="contained" sx={{ flex: 1 }} onClick={() => assignToMe(selected)}>
                    Assign to me
                  </Button>
                ) : (
                  <Button variant="contained" sx={{ flex: 1 }} onClick={() => setResolveTarget(selected)}>
                    Resolve
                  </Button>
                )}
                <Button variant="outlined" sx={{ flex: 1 }} onClick={() => setEscalateTarget(selected)}>
                  Escalate to case
                </Button>
                <IconButton
                  onClick={(e) => setMenuAnchor(e.currentTarget)}
                  sx={{ width: 30, height: 30, border: `1px solid ${line.strong}`, borderRadius: '6px' }}
                  aria-label="More actions"
                >
                  <MoreHoriz sx={{ fontSize: 16 }} />
                </IconButton>
              </Box>
            </Box>

            <Box sx={{ p: '16px 20px', borderBottom: `1px solid ${line.base}` }}>
              <Eyebrow>Evidence</Eyebrow>
              {facts.map((f) => (
                <FactRow key={f.k} label={f.k} value={f.v} />
              ))}
            </Box>

            <Box sx={{ p: '16px 20px', borderBottom: `1px solid ${line.base}` }}>
              <Eyebrow>Timeline</Eyebrow>
              {timeline.map((e, i) => (
                <TimelineRow
                  key={`${e.text}-${i}`}
                  text={e.text}
                  time={e.time}
                  level={e.level}
                  color={e.color}
                  last={i === timeline.length - 1}
                />
              ))}
            </Box>

            <Box sx={{ p: '16px 20px' }}>
              <Eyebrow>Recommended actions</Eyebrow>
              {!recommendations.length ? (
                <Box sx={{ fontSize: '.75rem', color: ink.faint }}>
                  No playbook is attached to this detection type yet.
                </Box>
              ) : (
                <Box sx={{ border: `1px solid ${line.base}`, borderRadius: '6px', p: '12px' }}>
                  {recommendations.map((step, i) => (
                    <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center', py: '4px' }}>
                      <Bolt sx={{ fontSize: 15, color: accent.main, flex: 'none' }} />
                      <Box sx={{ fontSize: '.75rem', color: ink.muted, flex: 1 }}>{step.text || step.action}</Box>
                      {step.priority && (
                        <Box component="span" sx={{ fontSize: '.6875rem', color: ink.dim }}>
                          {step.priority}
                        </Box>
                      )}
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </>
        )}
      </Box>

      {/* Per-alert overflow menu */}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null)
            acknowledge(selected)
          }}
        >
          <ListItemIcon>
            <CheckCircle sx={{ fontSize: 17 }} />
          </ListItemIcon>
          Acknowledge
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null)
            setAssignTarget(selected)
          }}
        >
          <ListItemIcon>
            <PersonAdd sx={{ fontSize: 17 }} />
          </ListItemIcon>
          Assign to analyst…
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null)
            setResolveTarget(selected)
          }}
        >
          <ListItemIcon>
            <DoneAll sx={{ fontSize: 17 }} />
          </ListItemIcon>
          Resolve…
        </MenuItem>
        <MenuItem
          onClick={() => {
            setMenuAnchor(null)
            setDeleteTarget(selected)
          }}
        >
          <ListItemIcon>
            <DeleteOutline sx={{ fontSize: 17, color: severity.critical }} />
          </ListItemIcon>
          Delete
        </MenuItem>
      </Menu>

      {/* Bulk triage over the filtered queue */}
      <Menu anchorEl={bulkAnchor} open={Boolean(bulkAnchor)} onClose={() => setBulkAnchor(null)}>
        <MenuItem onClick={() => bulkOnVisible((a) => axios.put(`/api/alerts/${a.id}/acknowledge`), 'acknowledged')}>
          <ListItemIcon>
            <CheckCircle sx={{ fontSize: 17 }} />
          </ListItemIcon>
          Acknowledge all shown
        </MenuItem>
        <MenuItem
          onClick={() =>
            currentUser?.id
              ? bulkOnVisible((a) => axios.put(`/api/alerts/${a.id}/assign`, { assignedTo: currentUser.id }), 'assigned')
              : setBulkAnchor(null)
          }
        >
          <ListItemIcon>
            <PersonAdd sx={{ fontSize: 17 }} />
          </ListItemIcon>
          Assign all shown to me
        </MenuItem>
        <MenuItem
          onClick={() =>
            bulkOnVisible(
              (a) => axios.put(`/api/alerts/${a.id}/resolve`, { resolutionNotes: 'Bulk resolved from triage' }),
              'resolved'
            )
          }
        >
          <ListItemIcon>
            <DoneAll sx={{ fontSize: 17 }} />
          </ListItemIcon>
          Resolve all shown
        </MenuItem>
      </Menu>

      {/* Assign dialog */}
      <Dialog open={Boolean(assignTarget)} onClose={() => setAssignTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>Assign alert</DialogTitle>
        <DialogContent>
          <FormControl fullWidth size="small" sx={{ mt: 1 }}>
            <InputLabel id="assignee-label">Analyst</InputLabel>
            <Select
              labelId="assignee-label"
              label="Analyst"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            >
              {orgUsers.map((u) => (
                <MenuItem key={u.id} value={u.id}>
                  {[u.firstName || u.first_name, u.lastName || u.last_name].filter(Boolean).join(' ') || u.username}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setAssignTarget(null)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={submitAssign} disabled={!assignee}>
            Assign
          </Button>
        </DialogActions>
      </Dialog>

      {/* Resolve dialog */}
      <Dialog open={Boolean(resolveTarget)} onClose={() => setResolveTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>Resolve alert</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '.8125rem', color: ink.secondary, mb: 2 }}>
            {resolveTarget?.title}
          </Typography>
          <TextField
            fullWidth
            multiline
            minRows={3}
            label="Resolution notes"
            value={resolutionNotes}
            onChange={(e) => setResolutionNotes(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setResolveTarget(null)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={submitResolve}>
            Resolve
          </Button>
        </DialogActions>
      </Dialog>

      {/* Escalate dialog */}
      <Dialog open={Boolean(escalateTarget)} onClose={() => setEscalateTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>Open a case from this alert</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '.8125rem', color: ink.secondary }}>
            A new {escalateTarget?.severity} case will be created with this alert attached as its first piece of
            evidence.
          </Typography>
          <Box sx={{ mt: 2, p: '12px', border: `1px solid ${line.base}`, borderRadius: '6px' }}>
            <Box sx={{ fontSize: '.8125rem', fontWeight: 500 }}>{escalateTarget?.title}</Box>
            <Box sx={{ fontSize: '.75rem', color: ink.faint, mt: '4px' }}>
              {escalateTarget && alertEntity(escalateTarget)}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setEscalateTarget(null)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={submitEscalate} startIcon={<FolderSpecial sx={{ fontSize: 16 }} />}>
            Open case
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>Delete alert</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '.8125rem', color: ink.secondary }}>
            This removes the alert and its triage history. Evidence collected by the underlying analysis run is not
            affected.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button variant="contained" color="error" onClick={submitDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default Alerts
