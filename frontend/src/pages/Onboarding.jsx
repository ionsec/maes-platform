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
  Download,
  AdminPanelSettings
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import axios from '../utils/axios'
import { useAuth } from '../contexts/AuthContext'
import { useAuthStore } from '../stores/authStore'
import { useOrganization } from '../contexts/OrganizationContext'

const Onboarding = () => {
  const [activeStep, setActiveStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [testConnectionResult, setTestConnectionResult] = useState(null)
  const [showDocumentation, setShowDocumentation] = useState(false)
  const navigate = useNavigate()
  const { user } = useAuth()
  const { 
    organizations, 
    selectedOrganizationId, 
    selectOrganization, 
    refreshOrganizations 
  } = useOrganization()

  // Form data
  const [organizationData, setOrganizationData] = useState({
    name: '',
    fqdn: '',
    tenantId: ''
  })
  
  const [currentOrgIndex, setCurrentOrgIndex] = useState(0)
  const [isAddingMultipleOrgs, setIsAddingMultipleOrgs] = useState(false)
  
  const [credentialsData, setCredentialsData] = useState({
    applicationId: '',
    clientSecret: '',
    certificateThumbprint: '',
    certificateFile: null,
    certificatePassword: '',
    authMethod: 'client_secret'
  })

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })

  useEffect(() => {
    // Check if user has any real organizations and completed onboarding
    if (organizations && organizations.length > 0 && !user?.needsOnboarding) {
      // User has organizations and completed onboarding, redirect to dashboard
      navigate('/dashboard')
    }
    // Otherwise stay in onboarding to create first organization
  }, [organizations, user, navigate])

  // Check if this is the first time setup (no organizations exist)
  const isFirstTimeSetup = !organizations || organizations.length === 0;
  
  // All users must create an organization - no individual user flow
  const steps = [
    {
      label: 'Welcome & Security',
      description: 'Change default password and learn about MAES'
    },
    {
      label: 'Create Your Organization',
      description: 'Set up your Microsoft 365 organization (Required)'
    },
    {
      label: 'Azure App Registration',
      description: 'Set up authentication credentials for M365 access'
    },
    {
      label: 'Tenant Consent',
      description: 'Grant admin consent for application permissions'
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
    setTestConnectionResult(null) // Clear any previous test results
  }

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1)
    setError('')
    setSuccess('')
    setTestConnectionResult(null)
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
      const orgData = {
        name: organizationData.name,
        fqdn: organizationData.fqdn
      }
      
      // Only include tenantId if it's provided and looks like a UUID
      if (organizationData.tenantId && organizationData.tenantId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        orgData.tenantId = organizationData.tenantId
      }
      
      // Always create a new organization (not update)
      const response = await axios.post('/api/organizations', orgData)
      
      // Refresh the organizations list in the global context
      await refreshOrganizations()
      
      // Select the newly created organization
      if (response.data.organization) {
        await selectOrganization(response.data.organization.id)
      }
      
      setSuccess('Organization created successfully!')
      setTimeout(() => handleNext(), 2000)
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to create organization')
    } finally {
      setLoading(false)
    }
  }

  const handleAddAnotherOrg = () => {
    setIsAddingMultipleOrgs(true)
    setOrganizationData({ name: '', fqdn: '', tenantId: '' })
    setError('')
    setSuccess('')
  }

  const handleFinishAddingOrgs = () => {
    if (!organizations || organizations.length === 0) {
      setError('Please add at least one organization')
      return
    }
    setSuccess(`${organizations.length} organization(s) configured successfully!`)
    setTimeout(() => handleNext(), 2000)
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

    if (!selectedOrganizationId) {
      setError('No organization selected. Please complete organization setup first.')
      return
    }

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

      // Save credentials to the selected organization
      await axios.put('/api/organizations/current/credentials', credentials, {
        headers: {
          'x-organization-id': selectedOrganizationId
        }
      })
      
      // Refresh organization data to ensure Settings sees the changes
      await refreshOrganizations()
      
      setSuccess('Credentials configured successfully!')
      setTimeout(() => handleNext(), 2000)
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to save credentials')
    } finally {
      setLoading(false)
    }
  }

  const handleTestConnection = async () => {
    if (!selectedOrganizationId) {
      setError('No organization selected. Please complete organization setup first.')
      return
    }
    
    setLoading(true)
    setTestConnectionResult(null)
    try {
      // Get current organization data to test with
      const orgResponse = await axios.get('/api/organizations/current?showCredentials=true', {
        headers: {
          'x-organization-id': selectedOrganizationId
        }
      })
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
    if (loading) return; // Prevent multiple calls
    
    setLoading(true)
    setError('')
    setSuccess('')
    
    let timeoutId;
    try {
      // Set a safety timeout
      timeoutId = setTimeout(() => {
        setError('API call is taking too long. Proceeding to dashboard anyway...');
        setLoading(false);
        // Still navigate to dashboard even if API fails
        setTimeout(() => {
          useAuthStore.getState().updateUser({ needsOnboarding: false });
          navigate('/dashboard');
        }, 2000);
      }, 15000); // 15 second timeout
      
      // Call API to mark onboarding as complete
      await axios.post('/api/auth/complete-onboarding', {}, {
        timeout: 10000 // 10 second timeout for this API call
      })
      
      // Clear safety timeout
      if (timeoutId) clearTimeout(timeoutId);
      
      // Update the auth store to reflect the change
      useAuthStore.getState().updateUser({ needsOnboarding: false })
      
      setSuccess('Onboarding skipped! You can configure settings later in the Settings page.')
      setTimeout(() => navigate('/dashboard'), 2000)
    } catch (error) {
      console.error('Error skipping onboarding:', error);
      
      // Clear safety timeout
      if (timeoutId) clearTimeout(timeoutId);
      
      // If API fails, still allow user to proceed to dashboard
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout') || error.message?.includes('Network error')) {
        setSuccess('API unavailable, but proceeding to dashboard. You can complete setup later in Settings.')
        useAuthStore.getState().updateUser({ needsOnboarding: false })
        setTimeout(() => navigate('/dashboard'), 2000)
      } else {
        setError(error.response?.data?.error || 'Failed to complete onboarding. Please try again or refresh the page.')
      }
    } finally {
      setLoading(false)
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  const handleCompleteOnboarding = async () => {
    if (loading) return; // Prevent multiple calls
    
    setLoading(true)
    setError('')
    setSuccess('')
    
    let timeoutId;
    try {
      // Set a safety timeout
      timeoutId = setTimeout(() => {
        setError('API call is taking too long. Proceeding to dashboard anyway...');
        setLoading(false);
        // Still navigate to dashboard even if API fails
        setTimeout(() => {
          useAuthStore.getState().updateUser({ needsOnboarding: false });
          navigate('/dashboard');
        }, 2000);
      }, 15000); // 15 second timeout
      
      // Call API to mark onboarding as complete
      await axios.post('/api/auth/complete-onboarding', {}, {
        timeout: 10000 // 10 second timeout for this API call
      })
      
      // Clear safety timeout
      if (timeoutId) clearTimeout(timeoutId);
      
      // Update the auth store to reflect the change
      useAuthStore.getState().updateUser({ needsOnboarding: false })
      
      setSuccess('Onboarding completed! Redirecting to dashboard...')
      setTimeout(() => navigate('/dashboard'), 2000)
    } catch (error) {
      console.error('Error completing onboarding:', error);
      
      // Clear safety timeout
      if (timeoutId) clearTimeout(timeoutId);
      
      // If API fails, still allow user to proceed to dashboard
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout') || error.message?.includes('Network error')) {
        setSuccess('API unavailable, but proceeding to dashboard. You can complete setup later in Settings.')
        useAuthStore.getState().updateUser({ needsOnboarding: false })
        setTimeout(() => navigate('/dashboard'), 2000)
      } else {
        setError(error.response?.data?.error || 'Failed to complete onboarding. Please try again or refresh the page.')
      }
    } finally {
      setLoading(false)
      if (timeoutId) clearTimeout(timeoutId);
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
    // Organization-based flow (all users must create organizations)
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
                      You can configure credentials for multiple Microsoft 365 organizations to enable comprehensive data extraction and monitoring.
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
                  onClick={() => {
                    setError('');
                    handleSkipOnboarding();
                  }}
                  startIcon={<SkipNext />}
                  color="secondary"
                  disabled={loading}
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
                <Box>
                  <Alert severity="info" sx={{ mb: 2 }}>
                    <strong>Certificate Options:</strong> You can upload your own .pfx certificate or use the default certificate. 
                    If uploading, provide both the certificate file and password.
                  </Alert>
                  
                  <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                    <Button
                      variant="outlined"
                      component="label"
                      fullWidth
                      sx={{ py: 1.5 }}
                    >
                      {credentialsData.certificateFile ? 
                        `Selected: ${credentialsData.certificateFile.name}` : 
                        'Upload Certificate (.pfx)'
                      }
                      <input
                        type="file"
                        hidden
                        accept=".pfx,.p12"
                        onChange={(e) => {
                          const file = e.target.files[0];
                          setCredentialsData({...credentialsData, certificateFile: file});
                        }}
                      />
                    </Button>
                    {credentialsData.certificateFile && (
                      <Button
                        variant="outlined"
                        color="error"
                        onClick={() => setCredentialsData({
                          ...credentialsData, 
                          certificateFile: null, 
                          certificatePassword: ''
                        })}
                      >
                        Remove
                      </Button>
                    )}
                  </Box>

                  {credentialsData.certificateFile && (
                    <TextField
                      label="Certificate Password"
                      fullWidth
                      margin="normal"
                      type="password"
                      value={credentialsData.certificatePassword}
                      onChange={(e) => setCredentialsData({...credentialsData, certificatePassword: e.target.value})}
                      placeholder="Enter certificate password"
                      helperText="Password for the uploaded .pfx certificate"
                      required
                    />
                  )}

                  <TextField
                    label="Certificate Thumbprint (Optional)"
                    fullWidth
                    margin="normal"
                    value={credentialsData.certificateThumbprint}
                    onChange={(e) => setCredentialsData({...credentialsData, certificateThumbprint: e.target.value})}
                    placeholder="Leave empty to use default certificate"
                    helperText="Optional: Only provide if using a custom certificate"
                  />
                </Box>
              )}

              <Box sx={{ mt: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Button
                  variant="contained"
                  onClick={async () => {
                    if (loading) return; // Prevent multiple clicks
                    
                    setError(''); // Clear any previous errors
                    setSuccess('');
                    
                    if (credentialsData.applicationId || organizationData.tenantId || organizationData.fqdn) {
                      // Save credentials to user preferences
                      let timeoutId;
                      try {
                        setLoading(true)
                        
                        // Set a safety timeout to prevent infinite loading
                        timeoutId = setTimeout(() => {
                          setError('Operation is taking too long. Please try again or use "Save Without Certificate".');
                          setLoading(false);
                        }, 150000); // 2.5 minutes safety timeout
                        
                        // Upload certificate first if provided
                        let certificateUploadResult = null;
                        let certificateUploadFailed = false;
                        if (credentialsData.certificateFile && credentialsData.certificatePassword) {
                          try {
                            setSuccess('Uploading certificate...')
                            const formData = new FormData();
                            formData.append('certificate', credentialsData.certificateFile);
                            formData.append('password', credentialsData.certificatePassword);
                            
                            // Use longer timeout for certificate uploads
                            certificateUploadResult = await axios.post('/api/user/certificate', formData, {
                              headers: { 'Content-Type': 'multipart/form-data' },
                              timeout: 120000 // 2 minutes timeout for certificate upload
                            });
                            setSuccess('Certificate uploaded, saving preferences...')
                          } catch (certError) {
                            console.error('Certificate upload failed:', certError);
                            certificateUploadFailed = true;
                            if (certError.code === 'ECONNABORTED' || certError.message?.includes('timeout')) {
                              setSuccess('Certificate upload timed out, saving other preferences without certificate...')
                            } else {
                              setSuccess('Certificate upload failed, saving other preferences without certificate...')
                            }
                          }
                        }
                        
                        // Prepare user preferences object
                        const preferences = {
                          tenantId: organizationData.tenantId,
                          fqdn: organizationData.fqdn,
                          applicationId: credentialsData.applicationId || '574cfe92-60a1-4271-9c80-8aba00070e67',
                          authMethod: credentialsData.authMethod,
                          ...(credentialsData.clientSecret && { clientSecret: credentialsData.clientSecret }),
                          ...(credentialsData.certificateThumbprint && { certificateThumbprint: credentialsData.certificateThumbprint }),
                          ...(certificateUploadResult && { 
                            certificateFilePath: certificateUploadResult.data.certificate?.filePath || certificateUploadResult.data.filePath,
                            certificateThumbprint: certificateUploadResult.data.certificate?.thumbprint,
                            certificatePassword: credentialsData.certificatePassword
                          }),
                          credentialsConfiguredAt: new Date().toISOString()
                        }
                        
                        // Save to user preferences
                        setSuccess('Saving preferences...');
                        await axios.put('/api/user/preferences', { preferences }, {
                          timeout: 30000 // 30 second timeout for preferences save
                        });
                        
                        // Clear safety timeout since operation completed
                        if (timeoutId) clearTimeout(timeoutId);
                        
                        if (certificateUploadFailed) {
                          setSuccess('Credentials saved successfully! Note: Certificate upload failed and was skipped. You can upload it later in Settings.')
                        } else {
                          setSuccess('Credentials saved successfully!')
                        }
                        setTimeout(() => handleNext(), 2000)
                      } catch (error) {
                        console.error('Error saving credentials:', error);
                        
                        // Clear safety timeout
                        if (timeoutId) clearTimeout(timeoutId);
                        
                        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
                          setError('Operation timed out. Please try again or use "Save Without Certificate".')
                        } else if (error.code === 'ERR_NETWORK') {
                          setError('Network error. Please check your connection and try again.')
                        } else {
                          setError(error.response?.data?.error || error.message || 'Failed to save credentials')
                        }
                      } finally {
                        // Ensure loading is always reset
                        setLoading(false)
                        if (timeoutId) clearTimeout(timeoutId);
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
                  onClick={async () => {
                    if (loading) return; // Prevent multiple clicks
                    
                    setError('');
                    setSuccess('');
                    
                    if (credentialsData.applicationId || organizationData.tenantId || organizationData.fqdn) {
                      let timeoutId;
                      try {
                        setLoading(true)
                        
                        // Set a safety timeout
                        timeoutId = setTimeout(() => {
                          setError('Operation is taking too long. Please try again.');
                          setLoading(false);
                        }, 60000); // 1 minute safety timeout
                        
                        setSuccess('Saving credentials without certificate...')
                        
                        const preferences = {
                          tenantId: organizationData.tenantId,
                          fqdn: organizationData.fqdn,
                          applicationId: credentialsData.applicationId || '574cfe92-60a1-4271-9c80-8aba00070e67',
                          authMethod: credentialsData.authMethod,
                          ...(credentialsData.clientSecret && { clientSecret: credentialsData.clientSecret }),
                          ...(credentialsData.certificateThumbprint && { certificateThumbprint: credentialsData.certificateThumbprint }),
                          credentialsConfiguredAt: new Date().toISOString()
                        }
                        
                        await axios.put('/api/user/preferences', { preferences }, {
                          timeout: 30000 // 30 second timeout
                        });
                        
                        // Clear safety timeout
                        if (timeoutId) clearTimeout(timeoutId);
                        
                        setSuccess('Credentials saved successfully (certificate skipped)!')
                        setTimeout(() => handleNext(), 1500)
                      } catch (error) {
                        console.error('Error saving credentials:', error);
                        
                        // Clear safety timeout
                        if (timeoutId) clearTimeout(timeoutId);
                        
                        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
                          setError('Operation timed out. Please try again.')
                        } else if (error.code === 'ERR_NETWORK') {
                          setError('Network error. Please check your connection and try again.')
                        } else {
                          setError(error.response?.data?.error || error.message || 'Failed to save credentials')
                        }
                      } finally {
                        // Ensure loading is always reset
                        setLoading(false)
                        if (timeoutId) clearTimeout(timeoutId);
                      }
                    } else {
                      handleNext()
                    }
                  }}
                  disabled={loading}
                  startIcon={<VpnKey />}
                  color="secondary"
                >
                  Save Without Certificate
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
            <Alert severity="warning" sx={{ mb: 3 }}>
              <Typography variant="body2">
                <strong>Required:</strong> You must create an organization to use MAES. This will be your primary organization for Microsoft 365 data extraction and analysis.
              </Typography>
            </Alert>

            {/* Show added organizations */}
            {organizations.length > 0 && (
              <Card sx={{ mb: 3 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>Added Organizations ({organizations.length})</Typography>
                  <List>
                    {organizations.map((org, index) => (
                      <ListItem key={index}>
                        <ListItemIcon><Business /></ListItemIcon>
                        <ListItemText 
                          primary={org.name}
                          secondary={`${org.fqdn}${org.tenantId ? ` (${org.tenantId})` : ''}`}
                        />
                      </ListItem>
                    ))}
                  </List>
                </CardContent>
              </Card>
            )}

            <TextField
              label="Organization Name"
              fullWidth
              margin="normal"
              value={organizationData.name}
              onChange={(e) => setOrganizationData({...organizationData, name: e.target.value})}
              placeholder="Your Client Organization Name"
              required
            />
            <TextField
              label="Tenant FQDN"
              fullWidth
              margin="normal"
              value={organizationData.fqdn}
              onChange={(e) => setOrganizationData({...organizationData, fqdn: e.target.value})}
              placeholder="clientcompany.onmicrosoft.com"
              required
              helperText="Microsoft 365 tenant domain (FQDN)"
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

            <Box sx={{ mt: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                onClick={handleOrganizationSetup}
                disabled={loading || !organizationData.name || !organizationData.fqdn}
                startIcon={loading ? <CircularProgress size={20} /> : <Business />}
              >
                {loading ? 'Creating Organization...' : 'Create Organization'}
              </Button>
              
              {/* Organization creation is mandatory - no skip button */}
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
                    <strong>Certificate Options:</strong> You can upload your own .pfx certificate or use the default certificate. 
                    Upload option allows for organization-specific certificates.
                  </Typography>
                </Alert>
                
                <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                  <Button
                    variant="outlined"
                    component="label"
                    fullWidth
                    sx={{ py: 1.5 }}
                  >
                    {credentialsData.certificateFile ? 
                      `Selected: ${credentialsData.certificateFile.name}` : 
                      'Upload Certificate (.pfx)'
                    }
                    <input
                      type="file"
                      hidden
                      accept=".pfx,.p12"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        setCredentialsData({...credentialsData, certificateFile: file});
                      }}
                    />
                  </Button>
                  {credentialsData.certificateFile && (
                    <Button
                      variant="outlined"
                      color="error"
                      onClick={() => setCredentialsData({
                        ...credentialsData, 
                        certificateFile: null, 
                        certificatePassword: ''
                      })}
                    >
                      Remove
                    </Button>
                  )}
                </Box>

                {credentialsData.certificateFile && (
                  <TextField
                    label="Certificate Password"
                    fullWidth
                    margin="normal"
                    type="password"
                    value={credentialsData.certificatePassword}
                    onChange={(e) => setCredentialsData({...credentialsData, certificatePassword: e.target.value})}
                    placeholder="Enter certificate password"
                    helperText="Password for the uploaded .pfx certificate"
                    required
                  />
                )}
                
                <Box sx={{ mb: 2 }}>
                  <Button
                    variant="outlined"
                    onClick={handleDownloadCertificate}
                    startIcon={<Download />}
                    size="small"
                    color="primary"
                  >
                    Download Default Certificate (app.crt)
                  </Button>
                  <Typography variant="caption" display="block" sx={{ mt: 1, color: 'text.secondary' }}>
                    Download the default certificate to upload to your Azure App Registration (if not using custom certificate)
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
            <Alert severity="warning" sx={{ mb: 3 }}>
              <Typography variant="body2">
                <strong>Admin Consent Required:</strong> The application needs admin consent to access your Microsoft 365 tenant. 
                This step grants the necessary permissions for MAES to extract audit logs and security data.
              </Typography>
            </Alert>

            <Card sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  <AdminPanelSettings sx={{ mr: 1, verticalAlign: 'middle' }} />
                  Tenant Consent Process
                </Typography>
                <Typography variant="body2" paragraph>
                  Click the button below to open the Microsoft Azure consent page. You'll need to:
                </Typography>
                <List dense>
                  <ListItem>
                    <ListItemIcon><CheckCircle fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Sign in with a Global Administrator account" />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><CheckCircle fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Review the requested permissions" />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><CheckCircle fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Click 'Accept' to grant consent" />
                  </ListItem>
                  <ListItem>
                    <ListItemIcon><CheckCircle fontSize="small" /></ListItemIcon>
                    <ListItemText primary="Return to this page to continue" />
                  </ListItem>
                </List>
                
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                  <strong>Required Permissions:</strong> Directory.Read.All, AuditLog.Read.All, Exchange.ManageAsApp
                </Typography>
              </CardContent>
            </Card>

            <Box sx={{ mb: 3 }}>
              <Button
                variant="contained"
                size="large"
                onClick={async () => {
                  try {
                    // Get the current organization data to construct the consent URL
                    const orgResponse = await axios.get('/api/organizations/current?showCredentials=true')
                    const org = orgResponse.data.organization
                    
                    if (!org.credentials?.applicationId) {
                      setError('Application ID not found. Please complete the previous step first.')
                      return
                    }
                    
                    // Construct the admin consent URL
                    const consentUrl = `https://login.microsoftonline.com/${org.tenantId || 'common'}/adminconsent?client_id=${org.credentials.applicationId}&redirect_uri=${encodeURIComponent(window.location.origin + '/onboarding')}`
                    
                    // Open in new tab
                    window.open(consentUrl, '_blank', 'width=600,height=600')
                    
                    setSuccess('Consent page opened in new tab. Please complete the consent process and return here.')
                  } catch (error) {
                    setError('Failed to open consent page. Please ensure you have completed the previous steps.')
                  }
                }}
                startIcon={<AdminPanelSettings />}
                fullWidth
              >
                Open Azure Admin Consent Page
              </Button>
            </Box>

            <Alert severity="info" sx={{ mb: 3 }}>
              <Typography variant="body2">
                <strong>Note:</strong> This step opens a new tab. After granting consent, you can return here and continue with the setup.
                The consent process is required only once per tenant.
              </Typography>
            </Alert>

            <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
              <Button
                variant="outlined"
                onClick={handleNext}
                startIcon={<CheckCircle />}
                size="large"
              >
                I've Completed Consent
              </Button>
              <Button
                variant="outlined"
                onClick={handleNext}
                disabled={loading}
                startIcon={<SkipNext />}
                color="secondary"
                size="large"
              >
                Skip for Now
              </Button>
            </Box>
          </Box>
        )

      case 4:
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

      case 5:
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
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                onClick={() => {
                  setError('');
                  setSuccess('');
                  handleSkipOnboarding();
                }}
                startIcon={<SkipNext />}
                size="small"
                color="secondary"
                disabled={loading}
              >
                Skip Setup & Go to Dashboard
              </Button>
              {error && (
                <Button
                  variant="outlined"
                  onClick={() => {
                    // Force skip - bypass all API calls
                    useAuthStore.getState().updateUser({ needsOnboarding: false });
                    navigate('/dashboard');
                  }}
                  startIcon={<Launch />}
                  size="small"
                  color="warning"
                >
                  Force Skip (Emergency)
                </Button>
              )}
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
                          onClick={() => {
                            setError('');
                            setSuccess('');
                            handleSkipOnboarding();
                          }}
                          sx={{ mt: 1, mr: 1 }}
                          color="secondary"
                          startIcon={<SkipNext />}
                        >
                          Skip Setup
                        </Button>
                      )}
                      {error && (
                        <Button
                          variant="outlined"
                          onClick={() => {
                            // Force skip - bypass all API calls
                            useAuthStore.getState().updateUser({ needsOnboarding: false });
                            navigate('/dashboard');
                          }}
                          sx={{ mt: 1, mr: 1 }}
                          color="warning"
                          startIcon={<Launch />}
                          size="small"
                        >
                          Force Skip
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