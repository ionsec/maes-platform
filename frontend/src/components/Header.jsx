import React from 'react'
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  Box,
  Tooltip,
  Chip,
  Badge,
  Popover,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Button
} from '@mui/material'
import {
  Menu as MenuIcon,
  AccountCircle,
  Notifications,
  Settings,
  ExitToApp,
  Security,
  Shield,
  Search,
  Computer,
  Warning,
  CheckCircle,
  Error as ErrorIcon,
  Info as InfoIcon,
  PriorityHigh,
  Close as CloseIcon
} from '@mui/icons-material'
import { useAuthStore } from '../stores/authStore'
import { useAlerts } from '../hooks/useAlerts'
import dayjs from 'dayjs'

const Header = ({ onMenuClick }) => {
  const { user, logout } = useAuthStore()
  const { alerts, alertStats, markAsRead, markAllAsRead, dismissAlert } = useAlerts()
  const [anchorEl, setAnchorEl] = React.useState(null)
  const [alertsAnchorEl, setAlertsAnchorEl] = React.useState(null)

  const handleMenu = (event) => {
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const handleAlertsClick = (event) => {
    setAlertsAnchorEl(event.currentTarget)
  }

  const handleAlertsClose = () => {
    setAlertsAnchorEl(null)
  }

  const handleLogout = () => {
    logout()
    handleClose()
  }

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'critical':
        return <ErrorIcon sx={{ color: 'error.main' }} />
      case 'high':
        return <PriorityHigh sx={{ color: 'error.main' }} />
      case 'medium':
        return <Warning sx={{ color: 'warning.main' }} />
      case 'low':
        return <InfoIcon sx={{ color: 'info.main' }} />
      default:
        return <InfoIcon sx={{ color: 'info.main' }} />
    }
  }

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical':
      case 'high':
        return 'error'
      case 'medium':
        return 'warning'
      case 'low':
      default:
        return 'info'
    }
  }

  return (
    <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
      <Toolbar>
        <IconButton
          edge="start"
          color="inherit"
          aria-label="menu"
          onClick={onMenuClick}
          sx={{ mr: 2 }}
        >
          <MenuIcon />
        </IconButton>

        <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mr: 2 }}>
            <Shield sx={{ color: 'primary.main', mr: 1, fontSize: '1.75rem' }} />
            <Box>
              <Typography variant="h6" component="div" sx={{ 
                fontWeight: 700,
                letterSpacing: '-0.5px',
                color: 'primary.main'
              }}>
                MAES
              </Typography>
              <Typography variant="caption" sx={{ 
                color: 'text.secondary',
                fontSize: '0.65rem',
                lineHeight: 1,
                display: 'block',
                mt: -0.5
              }}>
                M365 Analyzer & Extractor Suite
              </Typography>
            </Box>
          </Box>
          
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              icon={<Security />}
              label="DFIR"
              size="small"
              variant="outlined"
              sx={{
                borderColor: 'primary.main',
                color: 'primary.main',
                backgroundColor: 'rgba(0, 229, 255, 0.1)',
                fontWeight: 600,
                fontSize: '0.75rem'
              }}
            />
            <Chip
              icon={<Computer />}
              label="M365"
              size="small"
              variant="outlined"
              sx={{
                borderColor: 'success.main',
                color: 'success.main',
                backgroundColor: 'rgba(0, 230, 118, 0.1)',
                fontWeight: 600,
                fontSize: '0.75rem'
              }}
            />
            <Typography variant="caption" sx={{ 
              color: 'text.secondary',
              fontWeight: 'medium',
              px: 1,
              py: 0.5,
              backgroundColor: 'rgba(0, 229, 255, 0.05)',
              borderRadius: 1,
              border: '1px solid rgba(0, 229, 255, 0.2)'
            }}>
              Powered by IONSEC.IO
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Tooltip title={`Security Alerts (${alertStats.unread} unread)`}>
            <IconButton 
              color="inherit" 
              sx={{ mr: 1 }}
              onClick={handleAlertsClick}
            >
              <Badge 
                badgeContent={alertStats.unread} 
                color={alertStats.critical > 0 || alertStats.high > 0 ? "error" : "warning"}
                max={99}
              >
                <Warning />
              </Badge>
            </IconButton>
          </Tooltip>

          <Tooltip title="System Status">
            <IconButton color="inherit" sx={{ mr: 1 }}>
              <CheckCircle sx={{ color: 'success.main' }} />
            </IconButton>
          </Tooltip>

          <Tooltip title="Settings">
            <IconButton color="inherit" sx={{ mr: 1 }}>
              <Settings />
            </IconButton>
          </Tooltip>

          <IconButton
            size="large"
            aria-label="account of current user"
            aria-controls="menu-appbar"
            aria-haspopup="true"
            onClick={handleMenu}
            color="inherit"
          >
            <Avatar sx={{ width: 32, height: 32 }}>
              {user?.firstName?.[0] || user?.username?.[0] || 'U'}
            </Avatar>
          </IconButton>

          <Menu
            id="menu-appbar"
            anchorEl={anchorEl}
            anchorOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
            keepMounted
            transformOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
            open={Boolean(anchorEl)}
            onClose={handleClose}
          >
            <MenuItem onClick={handleClose}>
              <AccountCircle sx={{ mr: 1 }} />
              Profile
            </MenuItem>
            <MenuItem onClick={handleLogout}>
              <ExitToApp sx={{ mr: 1 }} />
              Logout
            </MenuItem>
          </Menu>

          {/* Alerts Popover */}
          <Popover
            open={Boolean(alertsAnchorEl)}
            anchorEl={alertsAnchorEl}
            onClose={handleAlertsClose}
            anchorOrigin={{
              vertical: 'bottom',
              horizontal: 'right',
            }}
            transformOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
            PaperProps={{
              sx: { width: 400, maxHeight: 500 }
            }}
          >
            <Box sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Security Alerts ({alertStats.total})
                </Typography>
                {alertStats.unread > 0 && (
                  <Button 
                    size="small" 
                    onClick={markAllAsRead}
                    sx={{ fontSize: '0.75rem' }}
                  >
                    Mark All Read
                  </Button>
                )}
              </Box>
              
              {alerts.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 3 }}>
                  <CheckCircle sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
                  <Typography variant="body2" color="text.secondary">
                    No security alerts
                  </Typography>
                </Box>
              ) : (
                <List sx={{ maxHeight: 350, overflow: 'auto', p: 0 }}>
                  {alerts.slice(0, 10).map((alert, index) => (
                    <React.Fragment key={alert.id}>
                      <ListItem
                        sx={{
                          px: 0,
                          py: 1,
                          backgroundColor: alert.read ? 'transparent' : 'action.hover',
                          borderRadius: 1,
                          mb: 0.5
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          <Badge
                            variant="dot"
                            color={getSeverityColor(alert.severity)}
                            invisible={alert.read}
                          >
                            {getSeverityIcon(alert.severity)}
                          </Badge>
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Typography 
                              variant="body2" 
                              sx={{ 
                                fontWeight: alert.read ? 400 : 600,
                                fontSize: '0.875rem'
                              }}
                            >
                              {alert.title || alert.message}
                            </Typography>
                          }
                          secondary={
                            <Box>
                              <Typography variant="caption" color="text.secondary">
                                {alert.source || 'MAES System'} • {dayjs(alert.createdAt).fromNow()}
                              </Typography>
                              {alert.description && (
                                <Typography 
                                  variant="caption" 
                                  sx={{ display: 'block', mt: 0.5 }}
                                  color="text.secondary"
                                >
                                  {alert.description.length > 80 
                                    ? `${alert.description.substring(0, 80)}...` 
                                    : alert.description
                                  }
                                </Typography>
                              )}
                            </Box>
                          }
                        />
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                          {!alert.read && (
                            <IconButton
                              size="small"
                              onClick={() => markAsRead(alert.id)}
                              sx={{ fontSize: '0.75rem' }}
                            >
                              <CheckCircle fontSize="small" />
                            </IconButton>
                          )}
                          <IconButton
                            size="small"
                            onClick={() => dismissAlert(alert.id)}
                            sx={{ fontSize: '0.75rem' }}
                          >
                            <CloseIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      </ListItem>
                      {index < alerts.slice(0, 10).length - 1 && <Divider />}
                    </React.Fragment>
                  ))}
                </List>
              )}
              
              {alerts.length > 10 && (
                <Box sx={{ textAlign: 'center', mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
                  <Button 
                    variant="outlined" 
                    size="small"
                    onClick={() => {
                      handleAlertsClose()
                      // Navigate to alerts page
                      window.location.href = '/alerts'
                    }}
                  >
                    View All Alerts ({alerts.length})
                  </Button>
                </Box>
              )}
            </Box>
          </Popover>
        </Box>
      </Toolbar>
    </AppBar>
  )
}

export default Header