import React from 'react'
import { Box, Collapse, Tooltip, Menu, MenuItem, ListItemIcon } from '@mui/material'
import {
  SpaceDashboard,
  NotificationsActive,
  FolderSpecial,
  CloudDownload,
  TravelExplore,
  Fingerprint,
  GppMaybe,
  Description,
  VerifiedUser,
  Group,
  Tune,
  ConnectedTv,
  BookmarkBorder,
  ChevronRight,
  UnfoldMore,
  TrendingUp,
  Speed,
  Visibility,
  Memory,
  MenuBook,
  Shield,
  Security,
  AccountCircle,
  ExitToApp,
} from '@mui/icons-material'
import { useNavigate, useLocation } from 'react-router-dom'
import { getApiUrl } from '../config/api'
import { useAuth } from '../contexts/AuthContext'
import { useAuthStore } from '../stores/authStore'
import { useAlerts } from '../hooks/useAlerts'
import { surface, line, ink, accent, severity, SIDEBAR_WIDTH, TOPBAR_HEIGHT, EASE, MONO } from '../theme/tokens'

// Baked in by the frontend image build (APP_VERSION build arg).
const APP_VERSION = `v${import.meta.env.VITE_APP_VERSION || '1.4.0'}`

// Compact role -> permission fallback mirroring api/src/middleware/auth.js
// ROLE_PERMISSIONS. Only the keys the sidebar gates on are included. A user's
// stored permissions (from /auth/me) take precedence over this fallback.
const ROLE_PERMISSIONS = {
  super_admin: {
    canManageExtractions: true,
    canRunAnalysis: true,
    canViewReports: true,
    canManageAlerts: true,
    canManageUsers: true,
    canUseAdvancedAnalytics: true,
    canAccessThreatIntel: true,
    canManageIntegrations: true,
    canExportData: true,
    canManageSystemSettings: true,
    canManageCompliance: true,
    canManageIncidents: true
  },
  admin: {
    canManageExtractions: true,
    canRunAnalysis: true,
    canViewReports: true,
    canManageAlerts: true,
    canManageUsers: true,
    canUseAdvancedAnalytics: true,
    canAccessThreatIntel: true,
    canManageIntegrations: true,
    canExportData: true,
    canManageSystemSettings: true,
    canManageCompliance: true,
    canManageIncidents: true
  },
  analyst: {
    canManageExtractions: true,
    canRunAnalysis: true,
    canViewReports: true,
    canManageAlerts: true,
    canUseAdvancedAnalytics: true,
    canAccessThreatIntel: true,
    canExportData: true,
    canManageCompliance: true,
    canManageIncidents: true
  },
  viewer: {
    canViewReports: true
  }
}

// Evaluate whether the current user holds a given permission, applying the same
// precedence as the backend middleware: stored permissions first, then role map.
function hasPermission(user, permission) {
  if (!permission) return true // unguarded items are visible to all
  if (!user) return false
  const stored = user.permissions
  if (stored && typeof stored === 'object' && permission in stored) {
    return !!stored[permission]
  }
  return !!(ROLE_PERMISSIONS[user.role] && ROLE_PERMISSIONS[user.role][permission])
}

/**
 * Navigation grouped Operate / Investigate / Govern, per the redesign. Grouping
 * follows the analyst's workflow rather than the feature list: what you watch,
 * what you dig into, what you administer.
 */
const NAV_GROUPS = [
  {
    label: 'Operate',
    items: [
      { text: 'Command Center', icon: <SpaceDashboard />, path: '/dashboard' },
      { text: 'Alerts', icon: <NotificationsActive />, path: '/alerts', badge: 'alerts', permission: 'canManageAlerts' },
      { text: 'Cases', icon: <FolderSpecial />, path: '/incidents', permission: 'canManageIncidents' },
    ],
  },
  {
    label: 'Investigate',
    items: [
      { text: 'Collection', icon: <CloudDownload />, path: '/extractions', permission: 'canManageExtractions' },
      { text: 'Analysis', icon: <TravelExplore />, path: '/analysis', permission: 'canRunAnalysis' },
      { text: 'Behavior Analytics', icon: <Fingerprint />, path: '/ueba', permission: 'canUseAdvancedAnalytics' },
      { text: 'Threat Intel', icon: <GppMaybe />, path: '/threat-intel', permission: 'canAccessThreatIntel' },
      { text: 'Saved IOCs', icon: <BookmarkBorder />, path: '/saved-iocs', permission: 'canAccessThreatIntel' },
      { text: 'Reports', icon: <Description />, path: '/reports', permission: 'canViewReports' },
    ],
  },
  {
    label: 'Govern',
    items: [
      { text: 'Compliance', icon: <VerifiedUser />, path: '/compliance', permission: 'canManageCompliance' },
      { text: 'Users & Access', icon: <Group />, path: '/users', permission: 'canManageUsers' },
      { text: 'SIEM Integration', icon: <ConnectedTv />, path: '/siem', permission: 'canManageIntegrations' },
      { text: 'Settings', icon: <Tune />, path: '/settings', permission: 'canManageSystemSettings' },
    ],
  },
]

// External observability + docs links. Kept out of the primary groups so the
// analyst-facing nav stays the length the redesign calls for.
const UTILITY_LINKS = [
  { text: 'System Logs', icon: <Visibility />, path: '/system-logs' },
  { text: 'Grafana', icon: <TrendingUp />, path: '/grafana/' },
  { text: 'Prometheus', icon: <Speed />, path: '/prometheus/' },
  { text: 'cAdvisor', icon: <Memory />, path: '/cadvisor/' },
  { text: 'API Documentation', icon: <MenuBook />, external: () => `${getApiUrl()}/api/docs` },
  { text: 'IONSEC.IO Services', icon: <Security />, external: () => 'https://ionsec.io' },
]

const GROUP_LABEL_SX = {
  p: '12px 16px 4px',
  fontSize: '.625rem',
  fontWeight: 600,
  letterSpacing: '.1em',
  textTransform: 'uppercase',
  color: ink.dim,
}

const NavRow = ({ item, active, badge, onClick }) => (
  <Box
    onClick={onClick}
    sx={{
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      height: 32,
      m: '1px 8px',
      px: '10px',
      borderRadius: '6px',
      fontSize: '.8125rem',
      cursor: 'pointer',
      ...(active
        ? { background: accent.washSoft, color: accent.main, fontWeight: 600 }
        : { color: ink.muted, fontWeight: 500, '&:hover': { background: 'rgba(255,255,255,.05)' } }),
    }}
  >
    <Box
      sx={{
        flex: 'none',
        display: 'flex',
        color: active ? accent.main : ink.tertiary,
        '& svg': { fontSize: 18 },
      }}
    >
      {item.icon}
    </Box>
    <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {item.text}
    </Box>
    {badge ? (
      <Box
        component="span"
        sx={{
          flex: 'none',
          fontSize: '.625rem',
          fontWeight: 600,
          fontFamily: MONO,
          color: active ? accent.main : ink.faint,
        }}
      >
        {badge}
      </Box>
    ) : null}
  </Box>
)

/**
 * 224px chrome rail. Permanent on desktop, an overlay drawer under 900px —
 * both driven by the same markup, as in the design's `narrow` branch.
 */
const Sidebar = ({ open, onClose, narrow, health = {} }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const storeUser = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const { alertStats } = useAlerts()
  const [utilOpen, setUtilOpen] = React.useState(false)
  const [userAnchor, setUserAnchor] = React.useState(null)

  const identity = user || storeUser
  const badges = { alerts: alertStats?.unread ? String(alertStats.unread) : '' }

  const groups = NAV_GROUPS
    .map((g) => ({ ...g, items: g.items.filter((it) => hasPermission(identity, it.permission)) }))
    .filter((g) => g.items.length > 0)

  const go = (path) => {
    if (path.startsWith('http') || /^\/(grafana|prometheus|loki|cadvisor)\//.test(path)) {
      window.open(path, '_blank', 'noopener')
    } else {
      navigate(path)
    }
    if (narrow) onClose?.()
  }

  const initials =
    `${identity?.firstName?.[0] || ''}${identity?.lastName?.[0] || ''}`.trim() ||
    identity?.username?.[0]?.toUpperCase() ||
    'U'
  const displayName =
    [identity?.firstName, identity?.lastName].filter(Boolean).join(' ') ||
    identity?.username ||
    identity?.email ||
    'Signed in'
  const roleLabel = (identity?.role || 'user').replace(/_/g, ' ')

  const healthy = health.overallStatus ? health.overallStatus === 'healthy' : true
  const healthLabel = health.overallStatus
    ? healthy
      ? 'All services healthy'
      : `Service ${health.overallStatus}`
    : 'Checking services…'

  return (
    <Box
      component="nav"
      sx={{
        width: SIDEBAR_WIDTH,
        flex: 'none',
        background: surface.chrome,
        borderRight: `1px solid ${line.base}`,
        display: 'flex',
        flexDirection: 'column',
        ...(narrow
          ? {
              position: 'fixed',
              top: 0,
              bottom: 0,
              left: 0,
              zIndex: 50,
              transition: `transform .16s ${EASE}`,
              transform: `translateX(${open ? '0' : '-100%'})`,
            }
          : { position: 'sticky', top: 0, height: '100vh' }),
      }}
    >
      {/* Brand */}
      <Box
        onClick={() => go('/dashboard')}
        sx={{
          height: TOPBAR_HEIGHT,
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          borderBottom: `1px solid ${line.base}`,
          cursor: 'pointer',
        }}
      >
        <Shield sx={{ fontSize: 22, color: accent.main }} />
        <Box component="span" sx={{ fontSize: '.9375rem', fontWeight: 700, letterSpacing: '-.3px' }}>
          MAES
        </Box>
        <Box
          component="span"
          sx={{
            ml: 'auto',
            fontSize: '.625rem',
            fontWeight: 600,
            letterSpacing: '.06em',
            color: ink.faint,
            border: `1px solid ${line.strong}`,
            borderRadius: '3px',
            p: '1px 5px',
          }}
        >
          {APP_VERSION}
        </Box>
      </Box>

      {/* Grouped navigation */}
      <Box sx={{ flex: 1, overflow: 'auto', py: 1 }}>
        {groups.map((g) => (
          <Box key={g.label}>
            <Box sx={GROUP_LABEL_SX}>{g.label}</Box>
            {g.items.map((it) => (
              <NavRow
                key={it.path}
                item={it}
                active={location.pathname === it.path}
                badge={it.badge ? badges[it.badge] : ''}
                onClick={() => go(it.path)}
              />
            ))}
          </Box>
        ))}

        <Box
          onClick={() => setUtilOpen((v) => !v)}
          sx={{ ...GROUP_LABEL_SX, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
        >
          Platform
          <ChevronRight
            sx={{ fontSize: 14, transition: `transform .16s ${EASE}`, transform: utilOpen ? 'rotate(90deg)' : 'none' }}
          />
        </Box>
        <Collapse in={utilOpen} unmountOnExit>
          {UTILITY_LINKS.map((it) => (
            <NavRow
              key={it.text}
              item={it}
              active={location.pathname === it.path}
              onClick={() => go(it.external ? it.external() : it.path)}
            />
          ))}
        </Collapse>
      </Box>

      {/* Health + identity footer */}
      <Box sx={{ flex: 'none', borderTop: `1px solid ${line.base}`, p: '8px 12px 12px' }}>
        <Tooltip title="Open system logs">
          <Box
            onClick={() => go('/system-logs')}
            sx={{ display: 'flex', alignItems: 'center', gap: 1, p: '6px 4px', cursor: 'pointer', borderRadius: '4px' }}
          >
            <Box
              component="span"
              sx={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                flex: 'none',
                background: healthy ? severity.ok : severity.critical,
              }}
            />
            <Box component="span" sx={{ fontSize: '.75rem', color: ink.secondary, flex: 1 }}>
              {healthLabel}
            </Box>
            <ChevronRight sx={{ fontSize: 16, color: ink.dim }} />
          </Box>
        </Tooltip>
        <Box
          onClick={(e) => setUserAnchor(e.currentTarget)}
          sx={{ display: 'flex', alignItems: 'center', gap: 1, p: '6px 4px', cursor: 'pointer', borderRadius: '4px' }}
        >
          <Box
            sx={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              background: surface.knob,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '.6875rem',
              fontWeight: 600,
              flex: 'none',
            }}
          >
            {initials}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box
              sx={{
                fontSize: '.75rem',
                fontWeight: 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {displayName}
            </Box>
            <Box sx={{ fontSize: '.6875rem', color: ink.faint, textTransform: 'capitalize' }}>{roleLabel}</Box>
          </Box>
          <UnfoldMore sx={{ fontSize: 18, color: ink.dim }} />
        </Box>
        <Menu
          anchorEl={userAnchor}
          open={Boolean(userAnchor)}
          onClose={() => setUserAnchor(null)}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        >
          <MenuItem
            onClick={() => {
              setUserAnchor(null)
              go('/profile')
            }}
          >
            <ListItemIcon>
              <AccountCircle sx={{ fontSize: 17 }} />
            </ListItemIcon>
            Profile
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
      </Box>
    </Box>
  )
}

export default Sidebar
