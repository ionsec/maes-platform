import React from 'react'
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Divider,
  Box
} from '@mui/material'
import {
  Dashboard,
  CloudDownload,
  Analytics,
  Warning,
  Assessment,
  Settings,
  Security,
  Description,
  Search,
  Shield,
  Computer,
  Fingerprint,
  Timeline,
  BugReport,
  Visibility,
  Storage,
  ConnectedTv,
  TrendingUp,
  Memory,
  Speed,
  People
} from '@mui/icons-material'
import { useNavigate, useLocation } from 'react-router-dom'
import { getApiUrl } from '../config/api'

const drawerWidth = 240

const menuItems = [
  { 
    text: 'Command Center', 
    icon: <Shield />, 
    path: '/dashboard',
    description: 'Security Operations Dashboard'
  },
  { 
    text: 'Data Extraction', 
    icon: <Storage />, 
    path: '/extractions',
    description: 'M365 Evidence Collection'
  },
  { 
    text: 'Forensic Analysis', 
    icon: <Search />, 
    path: '/analysis',
    description: 'Threat Detection & Investigation'
  },
  { 
    text: 'Security Alerts', 
    icon: <Warning />, 
    path: '/alerts',
    description: 'Threat Intelligence & IOCs'
  },
  { 
    text: 'Investigation Reports', 
    icon: <Assessment />, 
    path: '/reports',
    description: 'DFIR Documentation'
  },
  { 
    text: 'SIEM Integration', 
    icon: <ConnectedTv />, 
    path: '/siem',
    description: 'External Security Systems'
  },
  { 
    text: 'System Configuration', 
    icon: <Settings />, 
    path: '/settings',
    description: 'Platform Settings'
  },
  { 
    text: 'User Management', 
    icon: <People />, 
    path: '/users',
    description: 'Manage Users & Permissions'
  }
]

const Sidebar = ({ open, onClose }) => {
  const navigate = useNavigate()
  const location = useLocation()

  const handleNavigation = (path) => {
    // Check if it's an external link or monitoring service
    if (path.startsWith('http') || 
        path.startsWith('/grafana/') || 
        path.startsWith('/prometheus/') || 
        path.startsWith('/loki/') || 
        path.startsWith('/cadvisor/')) {
      // External link or monitoring service - open in new tab
      window.open(path, '_blank')
    } else {
      navigate(path)
    }
    // Only close on mobile
    if (window.innerWidth < 900) {
      onClose()
    }
  }

  const drawer = (
    <Box>
      <Toolbar />
      <List>
        {menuItems.map((item) => (
          <ListItem key={item.text} disablePadding>
            <ListItemButton
              selected={location.pathname === item.path}
              onClick={() => handleNavigation(item.path)}
              sx={{
                minHeight: 56,
                px: 2.5,
                '&.Mui-selected': {
                  backgroundColor: 'rgba(0, 229, 255, 0.12)',
                  borderRight: '3px solid',
                  borderRightColor: 'primary.main',
                  '&:hover': {
                    backgroundColor: 'rgba(0, 229, 255, 0.16)',
                  },
                },
                '&:hover': {
                  backgroundColor: 'rgba(0, 229, 255, 0.08)',
                },
              }}
            >
              <ListItemIcon sx={{ 
                color: location.pathname === item.path ? 'primary.main' : 'inherit',
                minWidth: 40 
              }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText 
                primary={item.text}
                secondary={item.description}
                primaryTypographyProps={{
                  fontSize: '0.875rem',
                  fontWeight: location.pathname === item.path ? 600 : 500,
                  color: location.pathname === item.path ? 'primary.main' : 'inherit',
                }}
                secondaryTypographyProps={{
                  fontSize: '0.75rem',
                  color: 'text.secondary',
                }}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      <Divider />
      
      {/* Monitoring Services Section */}
      <List>
        <ListItem>
          <ListItemText 
            primary="System Monitoring"
            primaryTypographyProps={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: 'text.secondary',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}
          />
        </ListItem>
        <ListItem disablePadding>
          <ListItemButton
            onClick={() => handleNavigation('/grafana/')}
            sx={{ pl: 4 }}
          >
            <ListItemIcon sx={{ minWidth: 32 }}>
              <TrendingUp fontSize="small" />
            </ListItemIcon>
            <ListItemText 
              primary="Grafana"
              secondary="Dashboards & Visualization"
              primaryTypographyProps={{ fontSize: '0.875rem' }}
              secondaryTypographyProps={{ fontSize: '0.75rem' }}
            />
          </ListItemButton>
        </ListItem>
        <ListItem disablePadding>
          <ListItemButton
            onClick={() => handleNavigation('/prometheus/')}
            sx={{ pl: 4 }}
          >
            <ListItemIcon sx={{ minWidth: 32 }}>
              <Speed fontSize="small" />
            </ListItemIcon>
            <ListItemText 
              primary="Prometheus"
              secondary="Metrics Collection"
              primaryTypographyProps={{ fontSize: '0.875rem' }}
              secondaryTypographyProps={{ fontSize: '0.75rem' }}
            />
          </ListItemButton>
        </ListItem>
        <ListItem disablePadding>
          <ListItemButton
            onClick={() => handleNavigation('/loki/')}
            sx={{ pl: 4 }}
          >
            <ListItemIcon sx={{ minWidth: 32 }}>
              <Visibility fontSize="small" />
            </ListItemIcon>
            <ListItemText 
              primary="Loki"
              secondary="Log Aggregation"
              primaryTypographyProps={{ fontSize: '0.875rem' }}
              secondaryTypographyProps={{ fontSize: '0.75rem' }}
            />
          </ListItemButton>
        </ListItem>
        <ListItem disablePadding>
          <ListItemButton
            onClick={() => handleNavigation('/cadvisor/')}
            sx={{ pl: 4 }}
          >
            <ListItemIcon sx={{ minWidth: 32 }}>
              <Memory fontSize="small" />
            </ListItemIcon>
            <ListItemText 
              primary="cAdvisor"
              secondary="Container Metrics"
              primaryTypographyProps={{ fontSize: '0.875rem' }}
              secondaryTypographyProps={{ fontSize: '0.75rem' }}
            />
          </ListItemButton>
        </ListItem>
      </List>
      <Divider />
      
      <List>
        <ListItem disablePadding>
          <ListItemButton
            onClick={() => handleNavigation(`${getApiUrl()}/api/docs`)}
          >
            <ListItemIcon><Description /></ListItemIcon>
            <ListItemText primary="API Documentation" />
          </ListItemButton>
        </ListItem>
        <ListItem disablePadding>
          <ListItemButton
            onClick={() => handleNavigation('https://ionsec.io')}
          >
            <ListItemIcon><Security /></ListItemIcon>
            <ListItemText 
              primary="IONSEC.IO Services" 
              secondary="Incident Response & Forensics"
            />
          </ListItemButton>
        </ListItem>
      </List>
    </Box>
  )

  return (
    <Box>
      {/* Permanent drawer for desktop */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', sm: 'block' },
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: drawerWidth,
          },
        }}
        open
      >
        {drawer}
      </Drawer>
      
      {/* Temporary drawer for mobile */}
      <Drawer
        variant="temporary"
        open={open}
        onClose={onClose}
        ModalProps={{
          keepMounted: true,
        }}
        sx={{
          display: { xs: 'block', sm: 'none' },
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: drawerWidth,
          },
        }}
      >
        {drawer}
      </Drawer>
    </Box>
  )
}

export default Sidebar