import React, { useState, useEffect } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  FormHelperText,
  Grid,
  IconButton,
  InputLabel,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import {
  Add as AddIcon,
  Refresh as RefreshIcon,
  Visibility as VisibilityIcon,
  Security as SecurityIcon,
  Gavel as GavelIcon,
  Route as RouteIcon,
  Description as DescriptionIcon,
  Download as DownloadIcon,
} from '@mui/icons-material'
import axios from 'axios'
import { useSnackbar } from 'notistack'
import { useOrganization } from '../contexts/OrganizationContext'

const PROFILES = [
  {
    value: 'passive',
    label: 'Passive',
    summary: 'Public records only',
    detail:
      'Public DNS, certificate transparency logs, and Microsoft\'s own documented discovery endpoints. '
      + 'Nothing is sent to the organisation\'s hosts and nothing is enumerated.',
  },
  {
    value: 'standard',
    label: 'Standard',
    summary: 'Bounded probing of their own surface',
    detail:
      'Adds read-only requests to hosts the organisation demonstrably owns: AD FS endpoints, discovered web '
      + 'hosts, their Azure storage and App Service names, and their SharePoint and Power Pages surface.',
  },
  {
    value: 'aggressive',
    label: 'Aggressive',
    summary: 'Enumeration and third-party probing — requires authorization',
    detail:
      'Adds account-existence testing and probes of third-party SaaS platforms. Refused unless a current '
      + 'scope authorization covers the seed domain with an "aggressive" ceiling.',
  },
]

const SEVERITY_COLORS = {
  critical: 'error',
  high: 'error',
  medium: 'warning',
  low: 'info',
  info: 'default',
}

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info']

const ExternalExposure = () => {
  const { enqueueSnackbar } = useSnackbar()
  const { selectedOrganizationId } = useOrganization()

  const [loading, setLoading] = useState(true)
  const [scans, setScans] = useState([])
  const [authorizations, setAuthorizations] = useState([])
  const [scanDialog, setScanDialog] = useState(false)
  const [authDialog, setAuthDialog] = useState(false)
  const [startingScan, setStartingScan] = useState(false)
  const [detail, setDetail] = useState(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [reportScan, setReportScan] = useState(null)

  useEffect(() => {
    if (selectedOrganizationId) fetchData()
  }, [selectedOrganizationId])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [scansResponse, authResponse] = await Promise.all([
        axios.get(`/api/recon/scans/${selectedOrganizationId}?limit=25`),
        axios.get(`/api/recon/authorizations/${selectedOrganizationId}`),
      ])
      if (scansResponse.data.success) setScans(scansResponse.data.scans || [])
      if (authResponse.data.success) setAuthorizations(authResponse.data.authorizations || [])
    } catch (error) {
      console.error('Error fetching external exposure data:', error)
      enqueueSnackbar('Failed to load external exposure data', { variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleStartScan = async (formData) => {
    try {
      setStartingScan(true)
      await axios.post(`/api/recon/scan/${selectedOrganizationId}`, formData)
      enqueueSnackbar('External exposure scan started', { variant: 'success' })
      setScanDialog(false)
      setTimeout(fetchData, 1500)
    } catch (error) {
      // The authorization gate returns 403 with an explanation; surface it
      // verbatim rather than replacing it with a generic failure message.
      const message = error.response?.data?.message
        || error.response?.data?.error
        || 'Failed to start scan'
      enqueueSnackbar(message, { variant: 'error', autoHideDuration: 12000 })
    } finally {
      setStartingScan(false)
    }
  }

  const handleRecordAuthorization = async (formData) => {
    try {
      await axios.post(`/api/recon/authorizations/${selectedOrganizationId}`, formData)
      enqueueSnackbar('Scope authorization recorded', { variant: 'success' })
      setAuthDialog(false)
      fetchData()
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to record authorization'
      enqueueSnackbar(message, { variant: 'error' })
    }
  }

  const handleRevokeAuthorization = async (authorizationId) => {
    try {
      await axios.delete(`/api/recon/authorizations/${selectedOrganizationId}/${authorizationId}`)
      enqueueSnackbar('Authorization revoked', { variant: 'success' })
      fetchData()
    } catch (error) {
      enqueueSnackbar('Failed to revoke authorization', { variant: 'error' })
    }
  }

  const openDetail = async (scanId) => {
    try {
      setLoadingDetail(true)
      setDetailOpen(true)
      const response = await axios.get(`/api/recon/scan/${scanId}?includeFindings=true`)
      setDetail(response.data)
    } catch (error) {
      enqueueSnackbar('Failed to load scan detail', { variant: 'error' })
      setDetailOpen(false)
    } finally {
      setLoadingDetail(false)
    }
  }

  if (!selectedOrganizationId) {
    return <Alert severity="info">Select an organization to view its external exposure.</Alert>
  }

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
  }

  const activeAuthorizations = authorizations.filter(
    a => !a.revoked_at && new Date(a.expires_at) > new Date()
  )

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4">External Exposure</Typography>
          <Typography variant="body2" color="textSecondary">
            What an unauthenticated attacker can see of this organization's Microsoft footprint.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Refresh">
            <IconButton onClick={fetchData}><RefreshIcon /></IconButton>
          </Tooltip>
          <Button startIcon={<GavelIcon />} onClick={() => setAuthDialog(true)}>
            Record authorization
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setScanDialog(true)}>
            New scan
          </Button>
        </Box>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }} icon={<SecurityIcon />}>
        Every request a scan makes is recorded in its probe log. Scans are confined to domains registered to
        this organization unless a scope authorization says otherwise, and the aggressive profile is refused
        without one.
      </Alert>

      <Card sx={{ mb: 3 }}>
        <CardHeader
          title="Scope authorizations"
          subheader={`${activeAuthorizations.length} active`}
        />
        <CardContent>
          {authorizations.length === 0 ? (
            <Typography variant="body2" color="textSecondary">
              No authorizations recorded. Passive and standard scans of this organization's own registered
              domains do not need one; aggressive scans always do.
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Domains</TableCell>
                    <TableCell>Ceiling</TableCell>
                    <TableCell>Authorized by</TableCell>
                    <TableCell>Reference</TableCell>
                    <TableCell>Expires</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {authorizations.map((auth) => {
                    const expired = new Date(auth.expires_at) <= new Date()
                    const status = auth.revoked_at ? 'Revoked' : expired ? 'Expired' : 'Active'
                    return (
                      <TableRow key={auth.id}>
                        <TableCell>{(auth.domains || []).join(', ')}</TableCell>
                        <TableCell>
                          <Chip size="small" label={auth.profile_ceiling} />
                        </TableCell>
                        <TableCell>{auth.authorized_by_name || '—'}</TableCell>
                        <TableCell>{auth.authorization_reference || '—'}</TableCell>
                        <TableCell>{new Date(auth.expires_at).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={status}
                            color={status === 'Active' ? 'success' : 'default'}
                          />
                        </TableCell>
                        <TableCell align="right">
                          {status === 'Active' && (
                            <Button size="small" color="error" onClick={() => handleRevokeAuthorization(auth.id)}>
                              Revoke
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Scans" />
        <CardContent>
          {scans.length === 0 ? (
            <Alert severity="info">No scans yet. Start one to see this organization's external surface.</Alert>
          ) : (
            <List>
              {scans.map((scan) => (
                <ListItem
                  key={scan.id}
                  divider
                  secondaryAction={
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Tooltip title="View findings">
                        <span>
                          <IconButton
                            onClick={() => openDetail(scan.id)}
                            disabled={scan.status !== 'completed'}
                          >
                            <VisibilityIcon />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Generate report">
                        <span>
                          <IconButton
                            onClick={() => setReportScan(scan)}
                            disabled={scan.status !== 'completed'}
                          >
                            <DescriptionIcon />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Box>
                  }
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography variant="subtitle1">{scan.seed_domain}</Typography>
                        <Chip size="small" label={scan.profile} />
                        <Chip
                          size="small"
                          label={scan.status}
                          color={
                            scan.status === 'completed' ? 'success'
                              : scan.status === 'failed' ? 'error'
                                : 'default'
                          }
                        />
                        {scan.status === 'completed' && (
                          <SeverityChips scan={scan} />
                        )}
                      </Box>
                    }
                    secondary={
                      <Box component="span">
                        <Typography variant="caption" color="textSecondary" component="span">
                          {new Date(scan.created_at).toLocaleString()}
                          {scan.total_probes > 0 && ` · ${scan.total_probes} probes`}
                          {scan.duration ? ` · ${scan.duration}s` : ''}
                        </Typography>
                        {(scan.status === 'running' || scan.status === 'pending') && (
                          <LinearProgress
                            variant="determinate"
                            value={scan.progress || 0}
                            sx={{ mt: 1, maxWidth: 400 }}
                          />
                        )}
                        {scan.status === 'failed' && scan.error_message && (
                          <Typography variant="caption" color="error" display="block">
                            {scan.error_message}
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>

      <StartScanDialog
        open={scanDialog}
        onClose={() => setScanDialog(false)}
        onSubmit={handleStartScan}
        loading={startingScan}
        hasAggressiveAuthorization={activeAuthorizations.some(a => a.profile_ceiling === 'aggressive')}
      />

      <RecordAuthorizationDialog
        open={authDialog}
        onClose={() => setAuthDialog(false)}
        onSubmit={handleRecordAuthorization}
      />

      <ScanDetailDialog
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setDetail(null) }}
        detail={detail}
        loading={loadingDetail}
      />

      <ReportDialog
        scan={reportScan}
        onClose={() => setReportScan(null)}
        enqueueSnackbar={enqueueSnackbar}
      />
    </Box>
  )
}

const SeverityChips = ({ scan }) => {
  const counts = {
    critical: scan.critical_findings,
    high: scan.high_findings,
    medium: scan.medium_findings,
    low: scan.low_findings,
    info: scan.info_findings,
  }

  const present = SEVERITY_ORDER.filter(s => counts[s] > 0)
  if (present.length === 0) {
    return <Chip size="small" label="No findings" color="success" variant="outlined" />
  }

  return (
    <>
      {present.map(severity => (
        <Chip
          key={severity}
          size="small"
          variant="outlined"
          color={SEVERITY_COLORS[severity]}
          label={`${counts[severity]} ${severity}`}
        />
      ))}
    </>
  )
}

const StartScanDialog = ({ open, onClose, onSubmit, loading, hasAggressiveAuthorization }) => {
  const [formData, setFormData] = useState({
    seedDomain: '',
    profile: 'passive',
    name: '',
    description: '',
    seedUser: '',
  })

  const selectedProfile = PROFILES.find(p => p.value === formData.profile)
  const aggressiveBlocked = formData.profile === 'aggressive' && !hasAggressiveAuthorization

  const handleSubmit = (event) => {
    event.preventDefault()
    const payload = { ...formData }
    if (!payload.seedUser) delete payload.seedUser
    if (!payload.name) delete payload.name
    if (!payload.description) delete payload.description
    onSubmit(payload)
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>Start external exposure scan</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            required
            label="Seed domain"
            placeholder="contoso.com"
            value={formData.seedDomain}
            onChange={(e) => setFormData({ ...formData, seedDomain: e.target.value })}
            sx={{ mt: 1, mb: 3 }}
            helperText="The scan starts from this domain and works outward from what it discovers."
          />

          <FormControl fullWidth sx={{ mb: 3 }}>
            <InputLabel>Profile</InputLabel>
            <Select
              value={formData.profile}
              label="Profile"
              onChange={(e) => setFormData({ ...formData, profile: e.target.value })}
            >
              {PROFILES.map(profile => (
                <MenuItem key={profile.value} value={profile.value}>
                  {profile.label} — {profile.summary}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>{selectedProfile?.detail}</FormHelperText>
          </FormControl>

          {aggressiveBlocked && (
            <Alert severity="warning" sx={{ mb: 3 }}>
              No active authorization permits the aggressive profile. Record one covering this domain first,
              or the scan will be refused.
            </Alert>
          )}

          {formData.profile === 'aggressive' && (
            <TextField
              fullWidth
              label="Seed account (optional)"
              placeholder="someone@contoso.com"
              value={formData.seedUser}
              onChange={(e) => setFormData({ ...formData, seedUser: e.target.value })}
              sx={{ mb: 3 }}
              helperText="A known-valid account improves the account-enumeration check. No password is ever submitted."
            />
          )}

          <TextField
            fullWidth
            label="Scan name (optional)"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            sx={{ mb: 3 }}
          />

          <TextField
            fullWidth
            multiline
            rows={2}
            label="Description (optional)"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            variant="contained"
            disabled={loading || !formData.seedDomain}
          >
            {loading ? 'Starting…' : 'Start scan'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

const RecordAuthorizationDialog = ({ open, onClose, onSubmit }) => {
  const [formData, setFormData] = useState({
    domains: '',
    profileCeiling: 'standard',
    expiresAt: '',
    authorizationReference: '',
    notes: '',
  })
  const [attested, setAttested] = useState(false)

  const handleSubmit = (event) => {
    event.preventDefault()
    onSubmit({
      domains: formData.domains.split(',').map(d => d.trim()).filter(Boolean),
      profileCeiling: formData.profileCeiling,
      expiresAt: new Date(formData.expiresAt).toISOString(),
      authorizationReference: formData.authorizationReference || undefined,
      notes: formData.notes || undefined,
    })
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>Record scope authorization</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 3, mt: 1 }}>
            This record is what permits MAES to scan the named domains. It is attributed to you and retained
            with the scans it authorizes.
          </Alert>

          <TextField
            fullWidth
            required
            label="Domains"
            placeholder="contoso.com, contoso.co.uk"
            value={formData.domains}
            onChange={(e) => setFormData({ ...formData, domains: e.target.value })}
            sx={{ mb: 3 }}
            helperText="Comma-separated. Subdomains of each entry are covered."
          />

          <FormControl fullWidth sx={{ mb: 3 }}>
            <InputLabel>Profile ceiling</InputLabel>
            <Select
              value={formData.profileCeiling}
              label="Profile ceiling"
              onChange={(e) => setFormData({ ...formData, profileCeiling: e.target.value })}
            >
              {PROFILES.map(profile => (
                <MenuItem key={profile.value} value={profile.value}>{profile.label}</MenuItem>
              ))}
            </Select>
            <FormHelperText>The most aggressive profile this authorization permits.</FormHelperText>
          </FormControl>

          <TextField
            fullWidth
            required
            type="date"
            label="Expires"
            value={formData.expiresAt}
            onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
            InputLabelProps={{ shrink: true }}
            sx={{ mb: 3 }}
          />

          <TextField
            fullWidth
            label="Engagement or ticket reference"
            value={formData.authorizationReference}
            onChange={(e) => setFormData({ ...formData, authorizationReference: e.target.value })}
            sx={{ mb: 3 }}
          />

          <TextField
            fullWidth
            multiline
            rows={2}
            label="Notes"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            sx={{ mb: 2 }}
          />

          <FormControlLabel
            control={<Checkbox checked={attested} onChange={(e) => setAttested(e.target.checked)} />}
            label="I confirm this organization has authorized security testing of these domains."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            variant="contained"
            disabled={!attested || !formData.domains || !formData.expiresAt}
          >
            Record authorization
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

const ScanDetailDialog = ({ open, onClose, detail, loading }) => {
  const [tab, setTab] = useState(0)
  const [severityFilter, setSeverityFilter] = useState('all')

  const findings = detail?.findings || []
  const attackPaths = detail?.attackPaths || []
  const scan = detail?.scan

  const visibleFindings = severityFilter === 'all'
    ? findings
    : findings.filter(f => f.severity === severityFilter)

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        {scan ? `${scan.seed_domain} — ${scan.profile} scan` : 'Scan detail'}
      </DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
        ) : !detail ? (
          <Alert severity="warning">No detail available.</Alert>
        ) : (
          <>
            <Tabs value={tab} onChange={(e, value) => setTab(value)} sx={{ mb: 2 }}>
              <Tab label={`Findings (${findings.length})`} />
              <Tab label={`Attack paths (${attackPaths.length})`} icon={<RouteIcon />} iconPosition="start" />
              <Tab label="Scan info" />
            </Tabs>

            {tab === 0 && (
              <>
                <FormControl size="small" sx={{ mb: 2, minWidth: 180 }}>
                  <InputLabel>Severity</InputLabel>
                  <Select
                    value={severityFilter}
                    label="Severity"
                    onChange={(e) => setSeverityFilter(e.target.value)}
                  >
                    <MenuItem value="all">All</MenuItem>
                    {SEVERITY_ORDER.map(s => (
                      <MenuItem key={s} value={s}>{s}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {visibleFindings.length === 0 ? (
                  <Alert severity="success">No findings at this severity.</Alert>
                ) : (
                  visibleFindings.map(finding => (
                    <FindingCard key={finding.id} finding={finding} />
                  ))
                )}
              </>
            )}

            {tab === 1 && (
              attackPaths.length === 0 ? (
                <Alert severity="success">
                  No attack chains assembled. Individual findings may still warrant attention.
                </Alert>
              ) : (
                attackPaths.map(path => (
                  <Paper key={path.id} sx={{ p: 2, mb: 2 }} variant="outlined">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
                      <Typography variant="h6">{path.name}</Typography>
                      <Chip size="small" color={SEVERITY_COLORS[path.severity]} label={path.severity} />
                      <Chip size="small" variant="outlined" label={`effort: ${path.effort}`} />
                    </Box>
                    <Typography variant="body2" sx={{ mb: 1 }}>{path.narrative}</Typography>
                    <Typography variant="caption" color="textSecondary" display="block">
                      Blast radius: {path.blast_radius}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, mt: 1, flexWrap: 'wrap' }}>
                      {(path.mitre_techniques || []).map(t => (
                        <Chip key={t} size="small" variant="outlined" label={t} />
                      ))}
                    </Box>
                  </Paper>
                ))
              )
            )}

            {tab === 2 && scan && (
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <List dense>
                    <ListItem><ListItemText primary="Seed domain" secondary={scan.seed_domain} /></ListItem>
                    <ListItem><ListItemText primary="Profile" secondary={scan.profile} /></ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Authorization basis"
                        secondary={scan.metadata?.authorizationBasis || '—'}
                      />
                    </ListItem>
                    <ListItem><ListItemText primary="Probes issued" secondary={scan.total_probes} /></ListItem>
                    <ListItem>
                      <ListItemText primary="Duration" secondary={scan.duration ? `${scan.duration}s` : '—'} />
                    </ListItem>
                  </List>
                </Grid>
                <Grid item xs={12} md={6}>
                  <Typography variant="subtitle2" gutterBottom>Phases run</Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 2 }}>
                    {(scan.metadata?.phasesRun || []).map(p => (
                      <Chip key={p} size="small" label={p} />
                    ))}
                  </Box>

                  {scan.metadata?.probeBudgetExhausted && (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                      The probe budget was exhausted before every phase completed. Coverage is partial.
                    </Alert>
                  )}

                  {scan.metadata?.certTransparencyFailed && (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                      The certificate transparency lookup failed, so no additional hostnames were discovered.
                      Every later phase worked from the seed domain alone — coverage is much narrower than a
                      normal scan. Re-run before treating this result as complete.
                    </Alert>
                  )}

                  {scan.metadata?.truncation?.certTransparency && (
                    <Alert severity="info" sx={{ mb: 2 }}>
                      Certificate transparency returned {scan.metadata.truncation.certTransparency.found} hostnames;
                      the first {scan.metadata.truncation.certTransparency.kept} were carried forward.
                    </Alert>
                  )}

                  {(scan.metadata?.phaseErrors || []).length > 0 && (
                    <Alert severity="warning">
                      {scan.metadata.phaseErrors.length} phase(s) failed:{' '}
                      {scan.metadata.phaseErrors.map(e => e.phase).join(', ')}
                    </Alert>
                  )}
                </Grid>
              </Grid>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}

const ReportDialog = ({ scan, onClose, enqueueSnackbar }) => {
  const [format, setFormat] = useState('html')
  const [includeProbeLog, setIncludeProbeLog] = useState(false)
  const [includeEvidence, setIncludeEvidence] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [reports, setReports] = useState([])

  useEffect(() => {
    if (scan) fetchReports()
    else setReports([])
  }, [scan])

  const fetchReports = async () => {
    try {
      const response = await axios.get(`/api/recon/scan/${scan.id}/reports`)
      if (response.data.success) setReports(response.data.reports || [])
    } catch (error) {
      console.error('Error listing reports:', error)
    }
  }

  const handleGenerate = async () => {
    try {
      setGenerating(true)
      const response = await axios.post(`/api/recon/scan/${scan.id}/report`, {
        format,
        includeProbeLog,
        includeEvidence,
      })
      // The service falls back to HTML when Puppeteer is unavailable; say so
      // rather than letting the user think they have a PDF.
      if (response.data.report?.note) {
        enqueueSnackbar(response.data.report.note, { variant: 'warning', autoHideDuration: 10000 })
      } else {
        enqueueSnackbar('Report generated', { variant: 'success' })
      }
      fetchReports()
    } catch (error) {
      enqueueSnackbar(error.response?.data?.message || 'Failed to generate report', { variant: 'error' })
    } finally {
      setGenerating(false)
    }
  }

  const handleDownload = async (fileName) => {
    try {
      const response = await axios.get(
        `/api/recon/scan/${scan.id}/report/${encodeURIComponent(fileName)}/download`,
        { responseType: 'blob' }
      )
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      enqueueSnackbar('Failed to download report', { variant: 'error' })
    }
  }

  return (
    <Dialog open={Boolean(scan)} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Generate report{scan ? ` — ${scan.seed_domain}` : ''}</DialogTitle>
      <DialogContent>
        <FormControl fullWidth sx={{ mt: 1, mb: 2 }}>
          <InputLabel>Format</InputLabel>
          <Select value={format} label="Format" onChange={(e) => setFormat(e.target.value)}>
            <MenuItem value="html">HTML</MenuItem>
            <MenuItem value="pdf">PDF</MenuItem>
            <MenuItem value="json">JSON</MenuItem>
            <MenuItem value="csv">CSV (findings only)</MenuItem>
          </Select>
        </FormControl>

        <FormControlLabel
          control={<Checkbox checked={includeEvidence} onChange={(e) => setIncludeEvidence(e.target.checked)} />}
          label="Include evidence"
        />
        <FormControlLabel
          control={<Checkbox checked={includeProbeLog} onChange={(e) => setIncludeProbeLog(e.target.checked)} />}
          label="Include the full probe audit trail"
        />
        {includeProbeLog && (
          <Alert severity="info" sx={{ mt: 1, mb: 2 }}>
            The probe log lists every request the scan made. Useful for an internal review or to answer a
            third party asking what MAES sent them; usually left out of a customer-facing deliverable.
          </Alert>
        )}

        {reports.length > 0 && (
          <>
            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>Previously generated</Typography>
            <List dense>
              {reports.map((report) => (
                <ListItem
                  key={report.id}
                  disableGutters
                  secondaryAction={
                    <IconButton edge="end" onClick={() => handleDownload(report.file_name)}>
                      <DownloadIcon />
                    </IconButton>
                  }
                >
                  <ListItemText
                    primary={`${report.format.toUpperCase()}${report.includes_probe_log ? ' · with probe log' : ''}`}
                    secondary={new Date(report.created_at).toLocaleString()}
                  />
                </ListItem>
              ))}
            </List>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" onClick={handleGenerate} disabled={generating}>
          {generating ? 'Generating…' : 'Generate'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

const FindingCard = ({ finding }) => (
  <Paper sx={{ p: 2, mb: 2 }} variant="outlined">
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
      <Chip size="small" color={SEVERITY_COLORS[finding.severity]} label={finding.severity} />
      <Typography variant="subtitle1">{finding.title}</Typography>
      {finding.is_lead && <Chip size="small" variant="outlined" label="lead" />}
      {finding.mitre_technique && (
        <Chip size="small" variant="outlined" label={finding.mitre_technique} />
      )}
    </Box>

    <Typography variant="body2" sx={{ mb: 1 }}>{finding.description}</Typography>

    {finding.impact && (
      <>
        <Typography variant="caption" color="textSecondary">Why it matters</Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>{finding.impact}</Typography>
      </>
    )}

    {finding.remediation && (
      <>
        <Typography variant="caption" color="textSecondary">Remediation</Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>{finding.remediation}</Typography>
      </>
    )}

    <Divider sx={{ my: 1 }} />

    <Typography variant="caption" color="textSecondary" display="block">
      {finding.phase} · {finding.finding_id}
      {finding.target ? ` · ${finding.target}` : ''}
    </Typography>

    {finding.evidence && Object.keys(finding.evidence).length > 0 && (
      <Box
        component="pre"
        sx={{
          mt: 1,
          p: 1,
          bgcolor: 'action.hover',
          borderRadius: 1,
          fontSize: '0.75rem',
          overflowX: 'auto',
          maxHeight: 220,
        }}
      >
        {JSON.stringify(finding.evidence, null, 2)}
      </Box>
    )}
  </Paper>
)

export default ExternalExposure
