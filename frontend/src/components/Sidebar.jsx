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
  Description
} from '@mui/icons-material'
import { useNavigate, useLocation } from 'react-router-dom'
import { getApiUrl } from '../config/api'

const drawerWidth = 240

const menuItems = [
  { text: 'Dashboard', icon: <Dashboard />, path: '/dashboard' },
  { text: 'Extractions', icon: <CloudDownload />, path: '/extractions' },
  { text: 'Analysis', icon: <Analytics />, path: '/analysis' },
  { text: 'Alerts', icon: <Warning />, path: '/alerts' },
  { text: 'Reports', icon: <Assessment />, path: '/reports' },
  { text: 'Settings', icon: <Settings />, path: '/settings' }
]

const Sidebar = ({ open, onClose }) => {
  const navigate = useNavigate()
  const location = useLocation()

  const handleNavigation = (path) => {
    if (path.startsWith('http')) {
      // External link - open in new tab
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
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.text} />
            </ListItemButton>
          </ListItem>
        ))}
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