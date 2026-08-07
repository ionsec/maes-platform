import React from 'react'
import {
  Box,
  Typography,
  IconButton,
  Menu,
  MenuItem,
  Badge,
  Popover,
  List,
  ListItem,
  ListItemText,
  Divider,
  Button,
  Tooltip,
  ListItemIcon,
} from '@mui/material'
import {
  Menu as MenuIcon,
  Apartment,
  ExpandMore,
  Search as SearchIcon,
  Notifications,
  HelpOutline,
  CheckCircle,
  Close as CloseIcon,
  Refresh as RefreshIcon,
  MenuBook,
  Security,
  Tune,
  ExitToApp,
  AccountCircle,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { useAuthStore } from '../stores/authStore'
import { useAlerts } from '../hooks/useAlerts'
import { useOrganization } from '../contexts/OrganizationContext'
import { HEALTH_SERVICES } from '../hooks/useSystemHealth'
import { getApiUrl } from '../config/api'
import ThemeSelector from './ThemeSelector'
import { Segmented, SeverityPill, StatusDot, EmptyState } from './ui'
import { surface, line, ink, accent, severity, sev, TOPBAR_HEIGHT, MONO, MOTION } from '../theme/tokens'

const RANGES = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
]

const boxedControl = {
  width: 30,
  height: 30,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: `1px solid ${line.base}`,
  borderRadius: '6px',
  color: ink.strong,
  flex: 'none',
}

/**
 * 52px topbar per the redesign: org switcher, global search with ⌘K, the
 * shared time range, then notifications and help. System health and identity
 * live in the sidebar footer; the health detail popover is reachable from the
 * status dot here.
 */
const Header = ({ onMenuClick, narrow, range, onRangeChange, health, onRefreshHealth }) => {
  const { user, logout } = useAuthStore()
  const { alerts, alertStats, markAsRead, markAllAsRead, dismissAlert } = useAlerts()
  const { organizations, selectedOrganization, selectOrganization } = useOrganization()
  const navigate = useNavigate()

  const [orgAnchor, setOrgAnchor] = React.useState(null)
  const [alertsAnchor, setAlertsAnchor] = React.useState(null)
  const [helpAnchor, setHelpAnchor] = React.useState(null)
  const [healthAnchor, setHealthAnchor] = React.useState(null)
  const [userAnchor, setUserAnchor] = React.useState(null)

  // ⌘K / Ctrl-K focuses the search field the design advertises.
  const searchRef = React.useRef(null)
  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const [query, setQuery] = React.useState('')
  const submitSearch = (e) => {
    e.preventDefault()
    const q = query.trim()
    if (q) navigate(`/threat-intel?q=${encodeURIComponent(q)}`)
  }

  const orgName = selectedOrganization?.organization_name || 'No organization'
  const overall = health?.overallStatus
  const healthColor = !overall ? ink.dim : overall === 'healthy' ? severity.ok : severity.critical

  const openExternal = (url) => window.open(url, '_blank', 'noopener')

  return (
    <Box
      component="header"
      sx={{
        height: TOPBAR_HEIGHT,
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        px: '20px',
        background: surface.chrome,
        borderBottom: `1px solid ${line.base}`,
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}
    >
      {narrow && (
        <IconButton onClick={onMenuClick} sx={boxedControl} aria-label="Open navigation">
          <MenuIcon sx={{ fontSize: 20 }} />
        </IconButton>
      )}

      {/* Organization switcher */}
      <Box
        onClick={(e) => organizations.length > 1 && setOrgAnchor(e.currentTarget)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          height: 30,
          px: '10px',
          border: `1px solid ${line.strong}`,
          borderRadius: '6px',
          background: surface.page,
          cursor: organizations.length > 1 ? 'pointer' : 'default',
          flex: 'none',
          maxWidth: 220,
        }}
      >
        <Apartment sx={{ fontSize: 16, color: ink.secondary }} />
        <Box
          component="span"
          sx={{
            fontSize: '.8125rem',
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {orgName}
        </Box>
        {organizations.length > 1 && <ExpandMore sx={{ fontSize: 16, color: ink.faint }} />}
      </Box>
      <Menu anchorEl={orgAnchor} open={Boolean(orgAnchor)} onClose={() => setOrgAnchor(null)}>
        {organizations.map((org) => (
          <MenuItem
            key={org.organization_id}
            selected={org.organization_id === selectedOrganization?.organization_id}
            onClick={() => {
              selectOrganization(org.organization_id)
              setOrgAnchor(null)
            }}
          >
            <Box>
              <Typography sx={{ fontSize: '.8125rem' }}>{org.organization_name}</Typography>
              {org.organization_fqdn && (
                <Typography sx={{ fontSize: '.6875rem', color: ink.faint }}>{org.organization_fqdn}</Typography>
              )}
            </Box>
          </MenuItem>
        ))}
      </Menu>

      {/* Global search */}
      {!narrow && (
        <Box
          component="form"
          onSubmit={submitSearch}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            height: 30,
            flex: 1,
            maxWidth: 420,
            px: '10px',
            border: `1px solid ${line.base}`,
            borderRadius: '6px',
            background: surface.page,
            color: ink.secondary,
            transition: `border-color ${MOTION}`,
            '&:hover': { borderColor: '#3A3A3A' },
            '&:focus-within': { borderColor: accent.main },
          }}
        >
          <SearchIcon sx={{ fontSize: 16 }} />
          <Box
            component="input"
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search users, IPs, hashes, cases…"
            sx={{
              flex: 1,
              minWidth: 0,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: ink.primary,
              fontFamily: 'inherit',
              fontSize: '.8125rem',
              '&::placeholder': { color: ink.secondary },
            }}
          />
          <Box
            component="span"
            sx={{
              fontSize: '.6875rem',
              fontFamily: MONO,
              color: ink.secondary,
              border: `1px solid ${line.strong}`,
              borderRadius: '3px',
              p: '1px 4px',
              flex: 'none',
            }}
          >
            ⌘K
          </Box>
        </Box>
      )}

      <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
        {!narrow && <Segmented options={RANGES} value={range} onChange={onRangeChange} />}

        {/* System health */}
        <Tooltip title={`Platform: ${overall ? overall : 'checking…'}`}>
          <IconButton onClick={(e) => setHealthAnchor(e.currentTarget)} sx={boxedControl} aria-label="System status">
            <StatusDot color={healthColor} size={8} />
          </IconButton>
        </Tooltip>

        {/* Alerts */}
        <Tooltip title={`Alerts (${alertStats?.unread || 0} unread)`}>
          <IconButton
            onClick={(e) => setAlertsAnchor(e.currentTarget)}
            sx={{ ...boxedControl, position: 'relative' }}
            aria-label="Alerts"
          >
            <Badge
              badgeContent={alertStats?.unread || 0}
              max={99}
              color={alertStats?.critical || alertStats?.high ? 'error' : 'warning'}
            >
              <Notifications sx={{ fontSize: 17 }} />
            </Badge>
          </IconButton>
        </Tooltip>

        <ThemeSelector variant="icon" />

        <Tooltip title="Help & resources">
          <IconButton onClick={(e) => setHelpAnchor(e.currentTarget)} sx={boxedControl} aria-label="Help">
            <HelpOutline sx={{ fontSize: 17 }} />
          </IconButton>
        </Tooltip>

        {narrow && (
          <IconButton onClick={(e) => setUserAnchor(e.currentTarget)} sx={boxedControl} aria-label="Account">
            <AccountCircle sx={{ fontSize: 18 }} />
          </IconButton>
        )}
      </Box>

      {/* Help menu */}
      <Menu anchorEl={helpAnchor} open={Boolean(helpAnchor)} onClose={() => setHelpAnchor(null)}>
        <MenuItem
          onClick={() => {
            setHelpAnchor(null)
            openExternal(`${getApiUrl()}/api/docs`)
          }}
        >
          <ListItemIcon>
            <MenuBook sx={{ fontSize: 17 }} />
          </ListItemIcon>
          API documentation
        </MenuItem>
        <MenuItem
          onClick={() => {
            setHelpAnchor(null)
            navigate('/settings')
          }}
        >
          <ListItemIcon>
            <Tune sx={{ fontSize: 17 }} />
          </ListItemIcon>
          Settings
        </MenuItem>
        <MenuItem
          onClick={() => {
            setHelpAnchor(null)
            openExternal('https://ionsec.io')
          }}
        >
          <ListItemIcon>
            <Security sx={{ fontSize: 17 }} />
          </ListItemIcon>
          IONSEC.IO incident response
        </MenuItem>
      </Menu>

      {/* Account menu (narrow only — the sidebar footer owns this on desktop) */}
      <Menu anchorEl={userAnchor} open={Boolean(userAnchor)} onClose={() => setUserAnchor(null)}>
        <MenuItem
          onClick={() => {
            setUserAnchor(null)
            navigate('/profile')
          }}
        >
          <ListItemIcon>
            <AccountCircle sx={{ fontSize: 17 }} />
          </ListItemIcon>
          {user?.username || 'Profile'}
        </MenuItem>
        <MenuItem
          onClick={() => {
            setUserAnchor(null)
            logout()
          }}
        >
          <ListItemIcon>
            <ExitToApp sx={{ fontSize: 17 }} />
          </ListItemIcon>
          Log out
        </MenuItem>
      </Menu>

      {/* Alerts popover */}
      <Popover
        open={Boolean(alertsAnchor)}
        anchorEl={alertsAnchor}
        onClose={() => setAlertsAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 400, maxHeight: 520, background: surface.chrome } } }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            p: '12px 16px',
            borderBottom: `1px solid ${line.base}`,
          }}
        >
          <Box sx={{ fontSize: '.8125rem', fontWeight: 600 }}>Alerts</Box>
          <Box sx={{ fontSize: '.6875rem', color: ink.secondary }}>
            {alertStats?.total || 0} total · {alertStats?.unread || 0} unread
          </Box>
          {alertStats?.unread > 0 && (
            <Button size="small" variant="text" sx={{ ml: 'auto' }} onClick={markAllAsRead}>
              Mark all read
            </Button>
          )}
        </Box>

        {alerts.length === 0 ? (
          <EmptyState icon={<CheckCircle />} title="No open alerts" hint="The queue is clear." />
        ) : (
          <List sx={{ maxHeight: 380, overflow: 'auto', p: 0 }}>
            {alerts.slice(0, 10).map((alert) => (
              <ListItem
                key={alert.id}
                sx={{
                  display: 'flex',
                  gap: 0,
                  p: 0,
                  borderBottom: `1px solid ${line.soft}`,
                  background: alert.read ? 'transparent' : 'rgba(255,255,255,.02)',
                }}
              >
                <Box sx={{ width: 3, alignSelf: 'stretch', flex: 'none', background: sev(alert.severity) }} />
                <Box sx={{ flex: 1, minWidth: 0, p: '10px 12px' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <SeverityPill level={alert.severity} />
                    <Box
                      sx={{
                        fontSize: '.8125rem',
                        fontWeight: alert.read ? 400 : 500,
                        flex: 1,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {alert.title || alert.message}
                    </Box>
                  </Box>
                  <Box sx={{ fontSize: '.6875rem', color: ink.faint, mt: '3px' }}>
                    {alert.source || 'MAES'} · {alert.createdAt ? dayjs(alert.createdAt).format('MMM D, HH:mm') : '—'}
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', p: '6px', flex: 'none' }}>
                  {!alert.read && (
                    <IconButton size="small" onClick={() => markAsRead(alert.id)} aria-label="Mark read">
                      <CheckCircle sx={{ fontSize: 15 }} />
                    </IconButton>
                  )}
                  <IconButton size="small" onClick={() => dismissAlert(alert.id)} aria-label="Dismiss">
                    <CloseIcon sx={{ fontSize: 15 }} />
                  </IconButton>
                </Box>
              </ListItem>
            ))}
          </List>
        )}

        <Box sx={{ p: '10px 16px', borderTop: `1px solid ${line.base}` }}>
          <Button
            fullWidth
            variant="outlined"
            size="small"
            onClick={() => {
              setAlertsAnchor(null)
              navigate('/alerts')
            }}
          >
            Open all alerts
          </Button>
        </Box>
      </Popover>

      {/* System health popover */}
      <Popover
        open={Boolean(healthAnchor)}
        anchorEl={healthAnchor}
        onClose={() => setHealthAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 340, background: surface.chrome } } }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            p: '12px 16px',
            borderBottom: `1px solid ${line.base}`,
          }}
        >
          <Box sx={{ fontSize: '.8125rem', fontWeight: 600 }}>Platform health</Box>
          <Box sx={{ ml: 'auto' }}>
            <SeverityPill level={overall || 'info'} label={overall || 'checking'} />
          </Box>
        </Box>
        <Box sx={{ p: '6px 16px 12px' }}>
          {HEALTH_SERVICES.map((s) => (
            <Box
              key={s.key}
              sx={{ display: 'flex', alignItems: 'center', gap: 1, py: '7px', borderBottom: `1px solid ${line.soft}` }}
            >
              <StatusDot level={health?.[s.key] || 'unknown'} size={8} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ fontSize: '.8125rem' }}>{s.label}</Box>
                <Box sx={{ fontSize: '.6875rem', color: ink.faint }}>{s.description}</Box>
              </Box>
              <Box sx={{ fontSize: '.6875rem', fontFamily: MONO, color: ink.secondary }}>
                {health?.[s.key] || 'unknown'}
              </Box>
            </Box>
          ))}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: '12px' }}>
            <Box sx={{ fontSize: '.6875rem', color: ink.dim, flex: 1 }}>
              {health?.lastCheck ? `Checked ${dayjs(health.lastCheck).format('HH:mm:ss')}` : 'Not checked yet'}
            </Box>
            <Button size="small" variant="text" startIcon={<RefreshIcon sx={{ fontSize: 15 }} />} onClick={onRefreshHealth}>
              Refresh
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                setHealthAnchor(null)
                navigate('/system-logs')
              }}
            >
              Logs
            </Button>
          </Box>
        </Box>
      </Popover>
      <Divider sx={{ display: 'none' }} />
    </Box>
  )
}

export default Header
