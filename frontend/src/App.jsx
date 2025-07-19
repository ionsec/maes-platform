import React, { useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { Container, Box } from '@mui/material'

// Component to handle external redirects
const ExternalRedirect = ({ url }) => {
  useEffect(() => {
    window.open(url, '_blank')
    // Redirect back to dashboard after opening external link
    window.location.href = '/dashboard'
  }, [url])
  
  return <div>Redirecting to monitoring service...</div>
}
import { useAuthStore } from './stores/authStore'
import { setNavigate } from './utils/axios'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import SOSButton from './components/SOSButton'
import Footer from './components/Footer'
import Dashboard from './pages/Dashboard'
import Extractions from './pages/Extractions'
import Analysis from './pages/Analysis'
import Alerts from './pages/Alerts'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import SIEMConfiguration from './pages/SIEMConfiguration'
import Login from './pages/Login'
import Register from './pages/Register'
import Onboarding from './pages/Onboarding'

function App() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  const isHydrated = useAuthStore((state) => state.isHydrated)
  const initializeAuth = useAuthStore((state) => state.initializeAuth)
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  const navigate = useNavigate()

  // Set navigate function for axios interceptor
  useEffect(() => {
    setNavigate(navigate)
  }, [navigate])
  
  // Debug logging
  console.log('App render - isAuthenticated:', isAuthenticated, 'token:', !!token, 'user:', !!user, 'isHydrated:', isHydrated)

  useEffect(() => {
    console.log('App mounted - auth state:', { isAuthenticated, token: !!token, user: !!user, isHydrated })
    // Initialize auth headers from stored token
    initializeAuth()
  }, [isAuthenticated, token, user, isHydrated, initializeAuth])

  // Handle hydration completion - run only once
  useEffect(() => {
    // Ensure hydration completes even if onRehydrateStorage doesn't fire
    const timer = setTimeout(() => {
      if (!useAuthStore.getState().isHydrated) {
        console.log('Marking app as hydrated (fallback)')
        useAuthStore.setState({ isHydrated: true })
      }
    }, 300)
    
    return () => clearTimeout(timer)
  }, [])

  // Wait for hydration before rendering
  if (!isHydrated) {
    return <div>Loading...</div>
  }

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  // Check if user needs onboarding
  if (user?.needsOnboarding) {
    return (
      <Routes>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      </Routes>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header onMenuClick={toggleSidebar} />
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <Container 
          maxWidth={false} 
          sx={{ 
            mt: 8, 
            ml: { xs: 0, sm: '240px' }, // Always account for sidebar on desktop
            transition: 'margin-left 0.3s',
            flex: 1,
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <Box sx={{ flex: 1 }}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/extractions" element={<Extractions />} />
              <Route path="/analysis" element={<Analysis />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/siem" element={<SIEMConfiguration />} />
              {/* Redirect monitoring service routes to external tabs */}
              <Route path="/grafana/*" element={<ExternalRedirect url="/grafana/" />} />
              <Route path="/prometheus/*" element={<ExternalRedirect url="/prometheus/" />} />
              <Route path="/loki/*" element={<ExternalRedirect url="/loki/" />} />
              <Route path="/cadvisor/*" element={<ExternalRedirect url="/cadvisor/" />} />
            </Routes>
          </Box>
          <Footer />
        </Container>
      </div>
      <SOSButton />
    </div>
  )
}

export default App