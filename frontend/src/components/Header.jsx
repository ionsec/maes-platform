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
  Badge
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
  CheckCircle
} from '@mui/icons-material'
import { useAuthStore } from '../stores/authStore'

const Header = ({ onMenuClick }) => {
  const { user, logout } = useAuthStore()
  const [anchorEl, setAnchorEl] = React.useState(null)

  const handleMenu = (event) => {
    setAnchorEl(event.currentTarget)
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const handleLogout = () => {
    logout()
    handleClose()
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
          <Tooltip title="Security Alerts">
            <IconButton color="inherit" sx={{ mr: 1 }}>
              <Badge badgeContent={3} color="error">
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
        </Box>
      </Toolbar>
    </AppBar>
  )
}

export default Header