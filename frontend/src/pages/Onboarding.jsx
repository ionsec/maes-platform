import React, { useState, useEffect } from 'react'
import {
  Box,
  Container,
  Paper,
  Typography,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Button,
  TextField,
  Card,
  CardContent,
  Alert,
  CircularProgress,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Link
} from '@mui/material'
import {
  Security,
  CheckCircle,
  Warning,
  Info,
  CloudUpload,
  Settings,
  VpnKey,
  Business,
  Launch,
  Close,
  SkipNext,
  Download
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import axios from '../utils/axios'
import { useAuth } from '../contexts/AuthContext'
import { useAuthStore } from '../stores/authStore'

const Onboarding = () => {
  const [activeStep, setActiveStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [testConnectionResult, setTestConnectionResult] = useState(null)
  const [showDocumentation, setShowDocumentation] = useState(false)
  const navigate = useNavigate()
  const { user } = useAuth()

  // Form data
  const [organizationData, setOrganizationData] = useState({
    name: '',
    fqdn: '',
    tenantId: ''
  })
  
  const [credentialsData, setCredentialsData] = useState({
    applicationId: '',
    clientSecret: '',
    certificateThumbprint: '',
    authMethod: 'client_secret'
  })

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })

  useEffect(() => {
    // For individual users or users with default organization, allow onboarding
    // Only redirect if user has a properly configured organization and completed onboarding
    if (user?.organization?.name && 
        user.organization.name !== 'MAES Default Organization' &&
        !user.needsOnboarding) {
      // User already has organization setup and completed onboarding, redirect to dashboard
      navigate('/dashboard')
    }
  }, [user, navigate])

  const isIndividualUser = !user?.organization || user?.organization?.name === 'MAES Default Organization';
  
  const steps = isIndividualUser ? [
    {
      label: 'Welcome to MAES',
      description: 'Get started with your individual MAES account'
    },
    {
      label: 'Microsoft 365 Setup (Optional)',
      description: 'Configure Microsoft 365 credentials for data extraction'
    },
    {
      label: 'Complete Setup',
      description: 'Finalize configuration and start using MAES'
    }
  ] : [
    {
      label: 'Welcome & Security',
      description: 'Change default password and learn about MAES'
    },
    {
      label: 'Organization Setup',
      description: 'Configure your Microsoft 365 organization details'
    },
    {
      label: 'Azure App Registration',
      description: 'Set up authentication credentials for M365 access'
    },
    {
      label: 'Test Connection',
      description: 'Verify connectivity to Microsoft 365 services'
    },
    {
      label: 'Complete Setup',
      description: 'Finalize configuration and start using MAES'
    }
  ]

  const handleNext = () => {
    setActiveStep((prevActiveStep) => prevActiveStep + 1)
    setError('')
    setSuccess('')
  }

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1)
    setError('')
    setSuccess('')
  }

  const handlePasswordChange = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError('New passwords do not match')
      return
    }

    if (passwordData.newPassword.length < 8) {
      setError('Password must be at least 8 characters long')
      return
    }

    setLoading(true)
    try {
      await axios.put('/api/auth/change-password', {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword
      })
      setSuccess('Password changed successfully!')
      setTimeout(() => handleNext(), 2000)
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  const handleOrganizationSetup = async () => {
    if (!organizationData.name || !organizationData.fqdn) {
      setError('Please fill in all required fields')
      return
    }

    setLoading(true)
    try {
      const updateData = {
        name: organizationData.name,
        fqdn: organizationData.fqdn
      }
      
      // Only include tenantId if it's provided and looks like a UUID
      if (organizationData.tenantId && organizationData.tenantId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        updateData.tenantId = organizationData.tenantId
      }
      
      await axios.put('/api/organizations/current', updateData)
      setSuccess('Organization details updated successfully!')
      setTimeout(() => handleNext(), 2000)
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to update organization')
    } finally {
      setLoading(false)
    }
  }

  const handleCredentialsSetup = async () => {
    if (!credentialsData.applicationId) {
      setError('Application ID is required')
      return
    }

    if (credentialsData.authMethod === 'client_secret' && !credentialsData.clientSecret) {
      setError('Client Secret is required for this authentication method')
      return
    }

    // Certificate thumbprint is optional since we have hardcoded certificates
    // if (credentialsData.authMethod === 'certificate' && !credentialsData.certificateThumbprint) {
    //   setError('Certificate Thumbprint is required for this authentication method')
    //   return
    // }

    setLoading(true)
    try {
      const credentials = {
        applicationId: credentialsData.applicationId
      }

      if (credentialsData.authMethod === 'client_secret') {
        credentials.clientSecret = credentialsData.clientSecret
      } else {
        // Only add certificate thumbprint if provided, otherwise use hardcoded certificates
        if (credentialsData.certificateThumbprint) {
          credentials.certificateThumbprint = credentialsData.certificateThumbprint
        }
      }

      await axios.put('/api/organizations/current/credentials', credentials)
      setSuccess('Credentials configured successfully!')
      setTimeout(() => handleNext(), 2000)
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to save credentials')
    } finally {
      setLoading(false)
    }
  }

  const handleTestConnection = async () => {
    setLoading(true)
    setTestConnectionResult(null)
    try {
      // Get current organization data to test with
      const orgResponse = await axios.get('/api/organizations/current?showCredentials=true')
      const org = orgResponse.data.organization
      
      const testParams = {
        applicationId: org.credentials?.applicationId,
        fqdn: org.fqdn
      }
      
      if (org.credentials?.clientSecret) {
        testParams.clientSecret = org.credentials.clientSecret
      } else if (org.credentials?.certificateThumbprint) {
        testParams.certificateThumbprint = org.credentials.certificateThumbprint
      }
      
      const response = await axios.post('/api/organizations/test-connection', testParams)
      setTestConnectionResult(response.data)
      if (response.data.success) {
        setSuccess('Connection test successful!')
        setTimeout(() => handleNext(), 2000)
      } else {
        setError('Connection test failed. Please check your credentials.')
      }
    } catch (error) {
      setError(error.response?.data?.error || 'Connection test failed')
      setTestConnectionResult({ success: false, error: error.response?.data?.error })
    } finally {
      setLoading(false)
    }
  }

  const handleSkipOnboarding = async () => {
    setLoading(true)
    try {
      // Call API to mark onboarding as complete
      await axios.post('/api/auth/complete-onboarding')
      
      // Update the auth store to reflect the change
      useAuthStore.getState().updateUser({ needsOnboarding: false })
      
      setSuccess('Onboarding skipped! You can configure settings later in the Settings page.')
      setTimeout(() => navigate('/dashboard'), 2000)
    } catch (error) {
      setError('Failed to complete onboarding. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleCompleteOnboarding = async () => {
    setLoading(true)
    try {
      // Call API to mark onboarding as complete
      await axios.post('/api/auth/complete-onboarding')
      
      // Update the auth store to reflect the change
      useAuthStore.getState().updateUser({ needsOnboarding: false })
      
      setSuccess('Onboarding completed! Redirecting to dashboard...')
      setTimeout(() => navigate('/dashboard'), 2000)
    } catch (error) {
      setError('Failed to complete onboarding. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadCertificate = async () => {
    try {
      const response = await axios.get('/api/certificates/app.crt', {
        responseType: 'blob'
      })
      
      // Create blob link to download
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', 'app.crt')
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      
      setSuccess('Certificate downloaded successfully!')
    } catch (error) {
      setError('Failed to download certificate. Please try again.')
    }
  }

  const renderStepContent = (step) => {
    if (isIndividualUser) {
      switch (step) {
        case 0:
          return (
            <Box>
              <Card sx={{ mb: 3 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom color="primary.main">
                    Welcome to MAES Platform
                  </Typography>
                  <Typography variant="body2" color="text.secondary" paragraph>
                    The M365 Analyzer & Extractor Suite - A comprehensive platform for Microsoft 365 forensic analysis and incident response.
                  </Typography>
                  
                  <Box sx={{ 
                    display: 'flex', 
                    alignItems: 'center',
                    justifyContent: 'center',
                    mt: 2, mb: 2
                  }}>
                    <Chip 
                      label="Powered by IONSEC.IO" 
                      color="primary" 
                      variant="outlined"
                      sx={{ fontWeight: 'bold' }}
                    />
                  </Box>

                  <Alert severity="info" sx={{ mt: 2 }}>
                    <Typography variant="body2">
                      As an individual user, you can use MAES for analysis and reporting. 
                      You can optionally configure Microsoft 365 credentials later to enable data extraction.
                    </Typography>
                  </Alert>
                </CardContent>
              </Card>

              <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
                <Button
                  variant="contained"
                  onClick={handleNext}
                  startIcon={<CheckCircle />}
                >
                  Continue Setup
                </Button>
                <Button
                  variant="outlined"
                  onClick={handleCompleteOnboarding}
                  startIcon={<SkipNext />}
                  color="secondary"
                >
                  Skip to Dashboard
                </Button>
              </Box>
            </Box>
          )

        case 1:
          return (
            <Box>
              <Alert severity="info" sx={{ mb: 3 }}>
                <Typography variant="body2">
                  <strong>Optional:</strong> Configure Microsoft 365 credentials to enable data extraction. 
                  You can always set this up later in the Settings page.
                </Typography>
              </Alert>

              <Typography variant="h6" gutterBottom>Authentication Method</Typography>
              <Box sx={{ mb: 2 }}>
                <Button
                  variant={credentialsData.authMethod === 'client_secret' ? 'contained' : 'outlined'}
                  onClick={() => setCredentialsData({...credentialsData, authMethod: 'client_secret'})}
                  sx={{ mr: 1 }}
                >
                  Client Secret
                </Button>
                <Button
                  variant={credentialsData.authMethod === 'certificate' ? 'contained' : 'outlined'}
                  onClick={() => setCredentialsData({...credentialsData, authMethod: 'certificate'})}
                >
                  Certificate
                </Button>
              </Box>

              <TextField
                label="Application (Client) ID"
                fullWidth
                margin="normal"
                value={credentialsData.applicationId}
                onChange={(e) => setCredentialsData({...credentialsData, applicationId: e.target.value})}
                placeholder="574cfe92-60a1-4271-9c80-8aba00070e67 (Default MAES App ID)"
                helperText="Leave empty to use default MAES application ID"
              />

              <TextField
                label="Tenant ID"
                fullWidth
                margin="normal"
                value={organizationData.tenantId}
                onChange={(e) => setOrganizationData({...organizationData, tenantId: e.target.value})}
                placeholder="Your Microsoft 365 Tenant ID"
                helperText="Your Azure AD Tenant ID (GUID)"
              />

              <TextField
                label="Tenant FQDN"
                fullWidth
                margin="normal"
                value={organizationData.fqdn}
                onChange={(e) => setOrganizationData({...organizationData, fqdn: e.target.value})}
                placeholder="yourcompany.onmicrosoft.com"
                helperText="Your Microsoft 365 tenant domain"
              />

              {credentialsData.authMethod === 'client_secret' && (
                <TextField
                  label="Client Secret"
                  type="password"
                  fullWidth
                  margin="normal"
                  value={credentialsData.clientSecret}
                  onChange={(e) => setCredentialsData({...credentialsData, clientSecret: e.target.value})}
                  placeholder="Your client secret value"
                />
              )}

              {credentialsData.authMethod === 'certificate' && (
                <TextField
                  label="Certificate Thumbprint (Optional)"
                  fullWidth
                  margin="normal"
                  value={credentialsData.certificateThumbprint}
                  onChange={(e) => setCredentialsData({...credentialsData, certificateThumbprint: e.target.value})}
                  placeholder="Leave empty to use default certificate"
                  helperText="Optional: Only provide if using a custom certificate"
                />
              )}

              <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
                <Button
                  variant="contained"
                  onClick={async () => {
                    if (credentialsData.applicationId || organizationData.tenantId || organizationData.fqdn) {
                      // Save credentials to user preferences
                      try {
                        setLoading(true)
                        const preferences = {
                          tenantId: organizationData.tenantId,
                          fqdn: organizationData.fqdn,
                          applicationId: credentialsData.applicationId || '574cfe92-60a1-4271-9c80-8aba00070e67',
                          ...(credentialsData.clientSecret && { clientSecret: credentialsData.clientSecret }),
                          ...(credentialsData.certificateThumbprint && { certificateThumbprint: credentialsData.certificateThumbprint }),
                          credentialsConfiguredAt: new Date().toISOString()
                        }
                        
                        await axios.put('/api/users/profile', { preferences })
                        setSuccess('Credentials saved successfully!')
                        setTimeout(() => handleNext(), 1500)
                      } catch (error) {
                        setError('Failed to save credentials')
                      } finally {
                        setLoading(false)
                      }
                    } else {
                      handleNext()
                    }
                  }}
                  disabled={loading}
                  startIcon={loading ? <CircularProgress size={20} /> : <VpnKey />}
                >
                  {loading ? 'Saving...' : 'Save & Continue'}
                </Button>
                <Button
                  variant="outlined"
                  onClick={handleNext}
                  disabled={loading}
                  startIcon={<SkipNext />}
                  color="secondary"
                >
                  Skip for Now
                </Button>
              </Box>
            </Box>
          )

        case 2:
          return (
            <Box>
              <Alert severity="success" sx={{ mb: 3 }}>
                <Typography variant="h6" gutterBottom>🎉 Setup Complete!</Typography>
                <Typography variant="body2">
                  Your MAES individual account is now ready to use. You can start analyzing data and configure additional settings as needed.
                </Typography>
              </Alert>

              <Card sx={{ mb: 3 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>What you can do now:</Typography>
                  <List>
                    <ListItem>
                      <ListItemIcon><Settings /></ListItemIcon>
                      <ListItemText 
                        primary="Configure Settings" 
                        secondary="Set up Microsoft 365 credentials and preferences in Settings"
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon><CloudUpload /></ListItemIcon>
                      <ListItemText 
                        primary="Data Analysis" 
                        secondary="Upload and analyze Microsoft 365 data files"
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemIcon><Security /></ListItemIcon>
                      <ListItemText 
                        primary="Security Reports" 
                        secondary="Generate security analysis reports"
                      />
                    </ListItem>
                  </List>
                </CardContent>
              </Card>

              <Box sx={{ mt: 2 }}>
                <Button
                  variant="contained"
                  onClick={handleCompleteOnboarding}
                  size="large"
                  fullWidth
                  disabled={loading}
                  startIcon={loading ? <CircularProgress size={20} /> : <CheckCircle />}
                >
                  {loading ? 'Completing Setup...' : 'Go to Dashboard'}
                </Button>
              </Box>
            </Box>
          )

        default:
          return 'Unknown step'
      }
    }
    
    // Original organization-based flow
    switch (step) {
      case 0:
        return (
          <Box>
            <Alert severity="warning" sx={{ mb: 3 }}>
              <Typography variant="h6" gutterBottom>Security First!</Typography>
              <Typography>
                You're currently using the default password. For security reasons, please change it immediately.
              </Typography>
            </Alert>

            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom color="primary.main">
                  Welcome to MAES Platform
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  The M365 Analyzer & Extractor Suite - A comprehensive platform for Microsoft 365 forensic analysis and incident response.
                </Typography>
                
                <Box sx={{ 
                  display: 'flex', 
                  alignItems: 'center',
                  justifyContent: 'center',
                  mt: 2, mb: 2
                }}>
                  <Chip 
                    label="Powered by IONSEC.IO" 
                    color="primary" 
                    variant="outlined"
                    sx={{ fontWeight: 'bold' }}
                  />
                </Box>

                <Typography variant="body2" color="text.secondary">
                  This onboarding will guide you through:
                </Typography>
                <List dense>
                  <ListItem>
                    <ListItemIcon><Security fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Securing your account" />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><Business fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Setting up your organization" />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><VpnKey fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Configuring M365 authentication" />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><CheckCircle fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Testing the connection" />
                  </ListItem>
                </List>
              </CardContent>
            </Card>

            <Typography variant="h6" gutterBottom>Change Your Password</Typography>
            <TextField
              label="Current Password"
              type="password"
              fullWidth
              margin="normal"
              value={passwordData.currentPassword}
              onChange={(e) => setPasswordData({...passwordData, currentPassword: e.target.value})}
            />
            <TextField
              label="New Password"
              type="password"
              fullWidth
              margin="normal"
              value={passwordData.newPassword}
              onChange={(e) => setPasswordData({...passwordData, newPassword: e.target.value})}
            />
            <TextField
              label="Confirm New Password"
              type="password"
              fullWidth
              margin="normal"
              value={passwordData.confirmPassword}
              onChange={(e) => setPasswordData({...passwordData, confirmPassword: e.target.value})}
            />
            
            <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
              <Button
                variant="contained"
                onClick={handlePasswordChange}
                disabled={loading || !passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword}
                startIcon={loading ? <CircularProgress size={20} /> : <Security />}
              >
                {loading ? 'Changing Password...' : 'Change Password'}
              </Button>
              <Button
                variant="outlined"
                onClick={handleNext}
                disabled={loading}
                startIcon={<SkipNext />}
                color="secondary"
              >
                Skip for Now
              </Button>
            </Box>
          </Box>
        )

      case 1:
        return (
          <Box>
            <Alert severity="info" sx={{ mb: 3 }}>
              <Typography variant="body2">
                Configure your organization details to connect to Microsoft 365. The FQDN is typically your tenant domain (e.g., yourcompany.onmicrosoft.com).
              </Typography>
            </Alert>

            <TextField
              label="Organization Name"
              fullWidth
              margin="normal"
              value={organizationData.name}
              onChange={(e) => setOrganizationData({...organizationData, name: e.target.value})}
              placeholder="Your Company Name"
              required
            />
            <TextField
              label="Tenant FQDN"
              fullWidth
              margin="normal"
              value={organizationData.fqdn}
              onChange={(e) => setOrganizationData({...organizationData, fqdn: e.target.value})}
              placeholder="yourcompany.onmicrosoft.com"
              required
              helperText="Your Microsoft 365 tenant domain (FQDN)"
            />
            <TextField
              label="Tenant ID (Optional)"
              fullWidth
              margin="normal"
              value={organizationData.tenantId}
              onChange={(e) => setOrganizationData({...organizationData, tenantId: e.target.value})}
              placeholder="12345678-1234-1234-1234-123456789012"
              helperText="Azure AD Tenant ID (GUID) - Optional if FQDN is provided"
            />

            <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
              <Button
                variant="contained"
                onClick={handleOrganizationSetup}
                disabled={loading || !organizationData.name || !organizationData.fqdn}
                startIcon={loading ? <CircularProgress size={20} /> : <Business />}
              >
                {loading ? 'Saving...' : 'Save Organization Details'}
              </Button>
              <Button
                variant="outlined"
                onClick={handleNext}
                disabled={loading}
                startIcon={<SkipNext />}
                color="secondary"
              >
                Skip for Now
              </Button>
            </Box>
          </Box>
        )

      case 2:
        return (
          <Box>
            <Alert severity="warning" sx={{ mb: 3 }}>
              <Typography variant="body2">
                You need to register an application in Azure AD and grant it the necessary permissions. 
                <Link 
                  href="#" 
                  onClick={() => setShowDocumentation(true)}
                  sx={{ ml: 1 }}
                >
                  View setup guide
                </Link>
              </Typography>
            </Alert>

            <Typography variant="h6" gutterBottom>Authentication Method</Typography>
            <Box sx={{ mb: 2 }}>
              <Button
                variant={credentialsData.authMethod === 'client_secret' ? 'contained' : 'outlined'}
                onClick={() => setCredentialsData({...credentialsData, authMethod: 'client_secret'})}
                sx={{ mr: 1 }}
              >
                Client Secret
              </Button>
              <Button
                variant={credentialsData.authMethod === 'certificate' ? 'contained' : 'outlined'}
                onClick={() => setCredentialsData({...credentialsData, authMethod: 'certificate'})}
              >
                Certificate
              </Button>
            </Box>

            <TextField
              label="Application (Client) ID"
              fullWidth
              margin="normal"
              value={credentialsData.applicationId}
              onChange={(e) => setCredentialsData({...credentialsData, applicationId: e.target.value})}
              placeholder="12345678-1234-1234-1234-123456789012"
              required
            />

            {credentialsData.authMethod === 'client_secret' && (
              <TextField
                label="Client Secret"
                type="password"
                fullWidth
                margin="normal"
                value={credentialsData.clientSecret}
                onChange={(e) => setCredentialsData({...credentialsData, clientSecret: e.target.value})}
                placeholder="Your client secret value"
                required
              />
            )}

            {credentialsData.authMethod === 'certificate' && (
              <Box>
                <Alert severity="info" sx={{ mb: 2 }}>
                  <Typography variant="body2">
                    <strong>Certificate Thumbprint is Optional!</strong> The extractor service includes pre-configured certificates (app.pfx, app.crt). 
                    You can leave this field empty to use the default certificate, or provide your own certificate thumbprint.
                  </Typography>
                </Alert>
                
                <Box sx={{ mb: 2 }}>
                  <Button
                    variant="outlined"
                    onClick={handleDownloadCertificate}
                    startIcon={<Download />}
                    size="small"
                    color="primary"
                  >
                    Download Certificate (app.crt)
                  </Button>
                  <Typography variant="caption" display="block" sx={{ mt: 1, color: 'text.secondary' }}>
                    Download this certificate to upload to your Azure App Registration
                  </Typography>
                </Box>
                
                <TextField
                  label="Certificate Thumbprint (Optional)"
                  fullWidth
                  margin="normal"
                  value={credentialsData.certificateThumbprint}
                  onChange={(e) => setCredentialsData({...credentialsData, certificateThumbprint: e.target.value})}
                  placeholder="Leave empty to use default certificate"
                  helperText="Optional: Only provide if you want to use a custom certificate instead of the default one"
                />
              </Box>
            )}

            <Typography variant="body2" color="text.secondary" sx={{ mt: 2, mb: 2 }}>
              Required API Permissions:
            </Typography>
            <List dense>
              <ListItem>
                <ListItemIcon><CheckCircle fontSize="small" color="success" /></ListItemIcon>
                <ListItemText primary="Exchange.ManageAsApp" secondary="For Exchange Online access" />
              </ListItem>
              <ListItem>
                <ListItemIcon><CheckCircle fontSize="small" color="success" /></ListItemIcon>
                <ListItemText primary="Directory.Read.All" secondary="For Azure AD access" />
              </ListItem>
              <ListItem>
                <ListItemIcon><CheckCircle fontSize="small" color="success" /></ListItemIcon>
                <ListItemText primary="AuditLog.Read.All" secondary="For audit log access" />
              </ListItem>
            </List>

            <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
              <Button
                variant="contained"
                onClick={handleCredentialsSetup}
                disabled={loading || !credentialsData.applicationId || 
                  (credentialsData.authMethod === 'client_secret' && !credentialsData.clientSecret)
                }
                startIcon={loading ? <CircularProgress size={20} /> : <VpnKey />}
              >
                {loading ? 'Saving...' : 'Save Credentials'}
              </Button>
              <Button
                variant="outlined"
                onClick={handleNext}
                disabled={loading}
                startIcon={<SkipNext />}
                color="secondary"
              >
                Skip for Now
              </Button>
            </Box>
          </Box>
        )

      case 3:
        return (
          <Box>
            <Alert severity="info" sx={{ mb: 3 }}>
              <Typography variant="body2">
                Let's test the connection to Microsoft 365 to ensure everything is configured correctly.
              </Typography>
            </Alert>

            {testConnectionResult && (
              <Card sx={{ mb: 3 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Connection Test Results
                  </Typography>
                  {testConnectionResult.success ? (
                    <Alert severity="success">
                      <Typography variant="body2">
                        ✅ Successfully connected to Microsoft 365
                      </Typography>
                      {testConnectionResult.ualStatus && (
                        <Typography variant="body2" sx={{ mt: 1 }}>
                          UAL Status: {testConnectionResult.ualStatus}
                        </Typography>
                      )}
                    </Alert>
                  ) : (
                    <Alert severity="error">
                      <Typography variant="body2">
                        ❌ Connection failed: {testConnectionResult.error}
                      </Typography>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            )}

            <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
              <Button
                variant="contained"
                onClick={handleTestConnection}
                disabled={loading}
                startIcon={loading ? <CircularProgress size={20} /> : <Launch />}
                size="large"
              >
                {loading ? 'Testing Connection...' : 'Test M365 Connection'}
              </Button>
              <Button
                variant="outlined"
                onClick={handleNext}
                disabled={loading}
                startIcon={<SkipNext />}
                color="secondary"
                size="large"
              >
                Skip Test
              </Button>
            </Box>
          </Box>
        )

      case 4:
        return (
          <Box>
            <Alert severity="success" sx={{ mb: 3 }}>
              <Typography variant="h6" gutterBottom>🎉 Setup Complete!</Typography>
              <Typography variant="body2">
                Your MAES platform is now configured and ready to use. You can start extracting and analyzing Microsoft 365 data.
              </Typography>
            </Alert>

            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>Next Steps:</Typography>
                <List>
                  <ListItem>
                    <ListItemIcon><CloudUpload /></ListItemIcon>
                    <ListItemText 
                      primary="Start Data Extraction" 
                      secondary="Go to Extractions page to begin collecting M365 audit logs"
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><Settings /></ListItemIcon>
                    <ListItemText 
                      primary="Configure Analysis Rules" 
                      secondary="Customize security detection rules for your organization"
                    />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><Security /></ListItemIcon>
                    <ListItemText 
                      primary="Monitor Alerts" 
                      secondary="Review security alerts and findings from your analysis"
                    />
                  </ListItem>
                </List>
              </CardContent>
            </Card>

            <Box sx={{ mt: 2 }}>
              <Button
                variant="contained"
                onClick={handleCompleteOnboarding}
                size="large"
                fullWidth
                disabled={loading}
                startIcon={loading ? <CircularProgress size={20} /> : <CheckCircle />}
              >
                {loading ? 'Completing Setup...' : 'Go to Dashboard'}
              </Button>
            </Box>
          </Box>
        )

      default:
        return 'Unknown step'
    }
  }

  return (
    <Container maxWidth="md">
      <Box sx={{ py: 4 }}>
        <Paper sx={{ p: 4 }}>
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Box sx={{ mb: 3 }}>
              <img 
                src="/MAES_Logo.png" 
                alt="MAES Platform Logo" 
                style={{ 
                  height: '80px', 
                  width: 'auto',
                  objectFit: 'contain'
                }} 
              />
            </Box>
            <Typography variant="h4" gutterBottom>
              Welcome to MAES Platform
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
              Let's get your Microsoft 365 Analyzer & Extractor Suite set up
            </Typography>
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              mb: 2
            }}>
              <Typography variant="caption" color="text.secondary">
                Powered by
              </Typography>
              <Box sx={{ 
                padding: '4px 8px',
                backgroundColor: 'rgba(25, 118, 210, 0.1)',
                borderRadius: 1,
                border: '1px solid rgba(25, 118, 210, 0.3)'
              }}>
                <Typography variant="caption" sx={{ 
                  color: 'primary.main',
                  fontWeight: 'bold',
                  letterSpacing: 0.5
                }}>
                  IONSEC.IO
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2 }}>
              <Button
                variant="outlined"
                onClick={handleSkipOnboarding}
                startIcon={<SkipNext />}
                size="small"
                color="secondary"
              >
                Skip Setup & Go to Dashboard
              </Button>
            </Box>
          </Box>

          <Stepper activeStep={activeStep} orientation="vertical">
            {steps.map((step, index) => (
              <Step key={step.label}>
                <StepLabel>
                  <Typography variant="h6">{step.label}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {step.description}
                  </Typography>
                </StepLabel>
                <StepContent>
                  {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                      {error}
                    </Alert>
                  )}
                  {success && (
                    <Alert severity="success" sx={{ mb: 2 }}>
                      {success}
                    </Alert>
                  )}
                  
                  {renderStepContent(index)}
                  
                  <Box sx={{ mb: 2, mt: 2 }}>
                    <div>
                      {index > 0 && !loading && (
                        <Button
                          onClick={handleBack}
                          sx={{ mt: 1, mr: 1 }}
                        >
                          Back
                        </Button>
                      )}
                      {index < steps.length - 1 && !loading && (
                        <Button
                          variant="outlined"
                          onClick={handleSkipOnboarding}
                          sx={{ mt: 1, mr: 1 }}
                          color="secondary"
                          startIcon={<SkipNext />}
                        >
                          Skip Setup
                        </Button>
                      )}
                    </div>
                  </Box>
                </StepContent>
              </Step>
            ))}
          </Stepper>
        </Paper>
      </Box>

      {/* Documentation Dialog */}
      <Dialog 
        open={showDocumentation} 
        onClose={() => setShowDocumentation(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Azure App Registration Setup Guide
          <Button
            onClick={() => setShowDocumentation(false)}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <Close />
          </Button>
        </DialogTitle>
        <DialogContent>
          <Typography variant="h6" gutterBottom>Step 1: Register Application</Typography>
          <Typography variant="body2" paragraph>
            1. Go to Azure Portal → Azure Active Directory → App registrations<br/>
            2. Click "New registration"<br/>
            3. Enter a name like "MAES Platform"<br/>
            4. Select "Accounts in this organizational directory only"<br/>
            5. Click "Register"
          </Typography>

          <Typography variant="h6" gutterBottom>Step 2: Configure API Permissions</Typography>
          <Typography variant="body2" paragraph>
            1. Go to "API permissions" → "Add a permission"<br/>
            2. Select "Microsoft Graph" → "Application permissions"<br/>
            3. Add: Directory.Read.All, AuditLog.Read.All<br/>
            4. Select "Office 365 Exchange Online" → "Application permissions"<br/>
            5. Add: Exchange.ManageAsApp<br/>
            6. Click "Grant admin consent"
          </Typography>

          <Typography variant="h6" gutterBottom>Step 3: Get Credentials</Typography>
          <Typography variant="body2" paragraph>
            For Client Secret:<br/>
            1. Go to "Certificates & secrets"<br/>
            2. Click "New client secret"<br/>
            3. Copy the secret value (not the ID)<br/><br/>
            
            For Certificate (Optional):<br/>
            1. Upload your certificate in "Certificates & secrets"<br/>
            2. Copy the certificate thumbprint<br/>
            3. <strong>Note:</strong> Certificate thumbprint is optional - MAES includes pre-configured certificates
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDocumentation(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Container>
  )
}

export default Onboarding