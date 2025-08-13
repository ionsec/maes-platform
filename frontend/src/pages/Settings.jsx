import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Grid,
  TextField,
  Typography,
  Switch,
  FormControlLabel,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  Alert,
  Tabs,
  Tab,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Chip
} from '@mui/material';
import {
  Save as SaveIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  CloudSync as CloudSyncIcon
} from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { useSnackbar } from 'notistack';
import axios from '../utils/axios';
import ThemeSelector from '../components/ThemeSelector';
import { useTheme } from '../theme/ThemeProvider';
import { useAuth } from '../contexts/AuthContext';

const Settings = () => {
  const [loading, setLoading] = useState(false);
  const [organization, setOrganization] = useState(null);
  const [userOrganizations, setUserOrganizations] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState(null);
  const { currentTheme } = useTheme();
  const { user } = useAuth();
  const [tabValue, setTabValue] = useState(0);
  const [credentialsDialogOpen, setCredentialsDialogOpen] = useState(false);
  const [showCredentials, setShowCredentials] = useState({});
  const [credentialsLoading, setCredentialsLoading] = useState(false);
  const [actualCredentials, setActualCredentials] = useState({});
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState(null);
  const [certificateFile, setCertificateFile] = useState(null);
  const [certificatePassword, setCertificatePassword] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [certificateUploadLoading, setCertificateUploadLoading] = useState(false);
  const [userCertificates, setUserCertificates] = useState([]);
  const [addOrgDialogOpen, setAddOrgDialogOpen] = useState(false);
  const [addOrgLoading, setAddOrgLoading] = useState(false);
  const { control, handleSubmit, reset, setValue } = useForm();
  const { control: credentialsControl, handleSubmit: handleCredentialsSubmit, reset: resetCredentials, watch: watchCredentials } = useForm();
  const { control: addOrgControl, handleSubmit: handleAddOrgSubmit, reset: resetAddOrg } = useForm();
  const { enqueueSnackbar } = useSnackbar();
  
  const watchedApplicationId = watchCredentials('applicationId');
  const watchedFqdn = watchCredentials('fqdn');
  const watchedClientSecret = watchCredentials('clientSecret');
  const watchedCertificateThumbprint = watchCredentials('certificateThumbprint');

  const fetchUserOrganizations = async () => {
    try {
      const response = await axios.get('/api/user/organizations');
      setUserOrganizations(response.data.organizations || []);
      
      // Set the first organization as selected if none is selected
      if (!selectedOrgId && response.data.organizations?.length > 0) {
        setSelectedOrgId(response.data.organizations[0].organization_id);
      }
    } catch (error) {
      // Only show error for non-auth errors
      if (error.response?.status !== 401 && error.response?.status !== 403) {
        enqueueSnackbar('Failed to fetch user organizations', { variant: 'error' });
      }
      setUserOrganizations([]);
    }
  };

  const fetchOrganization = async (orgId = selectedOrgId) => {
    if (!orgId) return;
    
    setLoading(true);
    try {
      const response = await axios.get('/api/organizations/current', {
        headers: {
          'x-organization-id': orgId
        }
      });
      setOrganization(response.data.organization);
      
      // Set form values
      setValue('organizationName', response.data.organization.name);
      setValue('tenantId', response.data.organization.tenantId);
      setValue('fqdn', response.data.organization.fqdn || '');
      setValue('extractionScheduleEnabled', response.data.organization.settings?.extractionSchedule?.enabled || false);
      setValue('extractionInterval', response.data.organization.settings?.extractionSchedule?.interval || 'daily');
      setValue('extractionTime', response.data.organization.settings?.extractionSchedule?.time || '02:00');
      setValue('autoAnalyze', response.data.organization.settings?.analysisSettings?.autoAnalyze || true);
      setValue('enableThreatIntel', response.data.organization.settings?.analysisSettings?.enableThreatIntel || false);
      setValue('emailNotifications', response.data.organization.settings?.alertingSettings?.emailNotifications || true);
      setValue('severityThreshold', response.data.organization.settings?.alertingSettings?.severityThreshold || 'medium');
      setValue('webhookUrl', response.data.organization.settings?.alertingSettings?.webhookUrl || '');
      setValue('retentionDays', response.data.organization.settings?.retentionDays || 90);
    } catch (error) {
      enqueueSnackbar('Failed to fetch organization settings', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteOrganization = async () => {
    if (deleteConfirmation !== organization?.name) {
      enqueueSnackbar('Organization name does not match', { variant: 'error' });
      return;
    }

    setDeleteLoading(true);
    try {
      await axios.delete(`/api/organizations/${selectedOrgId}`);
      enqueueSnackbar('Organization deleted successfully', { variant: 'success' });
      setDeleteDialogOpen(false);
      setDeleteConfirmation('');
      // Refresh organizations and select a different one
      await fetchUserOrganizations();
      const remainingOrgs = userOrganizations.filter(org => org.organization_id !== selectedOrgId);
      if (remainingOrgs.length > 0) {
        setSelectedOrgId(remainingOrgs[0].organization_id);
      }
    } catch (error) {
      enqueueSnackbar(error.response?.data?.error || 'Failed to delete organization', { variant: 'error' });
    } finally {
      setDeleteLoading(false);
    }
  };

  useEffect(() => {
    fetchUserOrganizations();
  }, []);

  useEffect(() => {
    if (selectedOrgId) {
      fetchOrganization(selectedOrgId);
    }
  }, [selectedOrgId]);

  const onSubmit = async (data) => {
    try {
      const payload = {
        name: data.organizationName,
        tenantId: data.tenantId,
        fqdn: data.fqdn,
        settings: {
          extractionSchedule: {
            enabled: data.extractionScheduleEnabled,
            interval: data.extractionInterval,
            time: data.extractionTime
          },
          analysisSettings: {
            autoAnalyze: data.autoAnalyze,
            enableThreatIntel: data.enableThreatIntel,
            enableMachineLearning: false
          },
          alertingSettings: {
            emailNotifications: data.emailNotifications,
            webhookUrl: data.webhookUrl,
            severityThreshold: data.severityThreshold
          },
          retentionDays: parseInt(data.retentionDays)
        }
      };

      await axios.put('/api/organizations/current', payload, {
        headers: {
          'x-organization-id': selectedOrgId
        }
      });
      enqueueSnackbar('Settings saved successfully', { variant: 'success' });
      fetchOrganization(selectedOrgId);
    } catch (error) {
      enqueueSnackbar(error.response?.data?.error || 'Failed to save settings', { variant: 'error' });
    }
  };

  const toggleCredentialVisibility = async (key) => {
    const newShowState = !showCredentials[key];
    
    setShowCredentials(prev => ({
      ...prev,
      [key]: newShowState
    }));

    // If we're showing credentials and don't have them cached, fetch them
    if (newShowState && !actualCredentials[key]) {
      try {
        const response = await axios.get('/api/organizations/current?showCredentials=true', {
          headers: {
            'x-organization-id': selectedOrgId
          }
        });
        setActualCredentials(response.data.organization.credentials || {});
      } catch (error) {
        console.error('Failed to fetch actual credentials:', error);
        enqueueSnackbar('Failed to fetch credential details', { variant: 'error' });
      }
    }
  };

  const renderCredentialValue = (value, key) => {
    if (!value) return 'Not configured';
    
    if (showCredentials[key]) {
      // Return actual credential if available, otherwise the masked value
      return actualCredentials[key] || value;
    }
    
    return '••••••••••••••••';
  };

  const testConnection = async () => {
    setTestingConnection(true);
    setConnectionTestResult(null);
    
    try {
      const payload = {
        applicationId: watchedApplicationId,
        fqdn: watchedFqdn,
        clientSecret: watchedClientSecret || undefined,
        certificateThumbprint: watchedCertificateThumbprint || undefined
      };
      
      // Remove undefined values to avoid sending them
      Object.keys(payload).forEach(key => {
        if (payload[key] === undefined || payload[key] === null || payload[key] === '') {
          delete payload[key];
        }
      });
      
      const response = await axios.post('/api/organizations/test-connection', payload);
      
      setConnectionTestResult({
        success: true,
        message: response.data.message,
        details: response.data.details,
        ualStatus: response.data.ualStatus,
        graphStatus: response.data.graphStatus
      });
      
      enqueueSnackbar('Connection test successful!', { variant: 'success' });
    } catch (error) {
      const errorData = error.response?.data;
      setConnectionTestResult({
        success: false,
        message: errorData?.error || 'Connection test failed',
        details: errorData?.details || {}
      });
      
      enqueueSnackbar(errorData?.error || 'Connection test failed', { variant: 'error' });
    } finally {
      setTestingConnection(false);
    }
  };

  const onCredentialsSubmit = async (data) => {
    setCredentialsLoading(true);
    try {
      // Save credentials
      const credentialsPayload = {
        applicationId: data.applicationId,
        clientSecret: data.clientSecret || undefined,
        certificateThumbprint: data.certificateThumbprint || undefined
      };

      // Remove undefined values to avoid sending them
      Object.keys(credentialsPayload).forEach(key => {
        if (credentialsPayload[key] === undefined || credentialsPayload[key] === null || credentialsPayload[key] === '') {
          delete credentialsPayload[key];
        }
      });

      await axios.put('/api/organizations/current/credentials', credentialsPayload, {
        headers: {
          'x-organization-id': selectedOrgId
        }
      });

      // Update tenant ID and FQDN if they were changed
      if ((data.credentialsTenantId && data.credentialsTenantId !== organization?.tenantId) || 
          (data.fqdn && data.fqdn !== organization?.fqdn)) {
        const orgPayload = {
          tenantId: data.credentialsTenantId,
          fqdn: data.fqdn
        };
        await axios.put('/api/organizations/current', orgPayload, {
          headers: {
            'x-organization-id': selectedOrgId
          }
        });
      }

      enqueueSnackbar('Credentials and tenant information saved successfully', { variant: 'success' });
      setCredentialsDialogOpen(false);
      resetCredentials();
      setActualCredentials({}); // Clear cached credentials
      setShowCredentials({}); // Reset visibility state
      fetchOrganization(); // Refresh organization data
    } catch (error) {
      enqueueSnackbar(error.response?.data?.error || 'Failed to save credentials', { variant: 'error' });
    } finally {
      setCredentialsLoading(false);
    }
  };

  const fetchUserCertificates = async () => {
    try {
      const response = await axios.get('/api/user/certificates');
      setUserCertificates(response.data.certificates || []);
    } catch (error) {
      console.error('Failed to fetch certificates:', error);
    }
  };

  const handleCertificateUpload = async () => {
    if (!certificateFile || !certificatePassword) {
      enqueueSnackbar('Please select a certificate file and enter password', { variant: 'error' });
      return;
    }

    setCertificateUploadLoading(true);
    try {
      const formData = new FormData();
      formData.append('certificate', certificateFile);
      formData.append('password', certificatePassword);
      formData.append('organizationId', organization?.tenantId || 'default');

      await axios.post('/api/user/certificate', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      enqueueSnackbar('Certificate uploaded successfully', { variant: 'success' });
      setCertificateFile(null);
      setCertificatePassword('');
      fetchUserCertificates();
    } catch (error) {
      enqueueSnackbar(error.response?.data?.error || 'Failed to upload certificate', { variant: 'error' });
    } finally {
      setCertificateUploadLoading(false);
    }
  };

  const handleDeleteCertificate = async (certificateId) => {
    try {
      await axios.delete(`/api/user/certificates/${certificateId}`);
      enqueueSnackbar('Certificate deleted successfully', { variant: 'success' });
      fetchUserCertificates();
    } catch (error) {
      enqueueSnackbar('Failed to delete certificate', { variant: 'error' });
    }
  };

  React.useEffect(() => {
    fetchUserCertificates();
  }, []);

  const onAddOrganization = async (data) => {
    setAddOrgLoading(true);
    try {
      // Create the new organization
      const response = await axios.post('/api/user/organizations', {
        name: data.organizationName,
        tenantId: data.tenantId,
        fqdn: data.fqdn
      });

      enqueueSnackbar('Organization added successfully', { variant: 'success' });
      setAddOrgDialogOpen(false);
      resetAddOrg();
      
      // Refresh the organizations list
      await fetchUserOrganizations();
      
      // Select the newly added organization
      if (response.data.organizationId) {
        setSelectedOrgId(response.data.organizationId);
      }
    } catch (error) {
      enqueueSnackbar(error.response?.data?.error || 'Failed to add organization', { variant: 'error' });
    } finally {
      setAddOrgLoading(false);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Organization Settings
      </Typography>

      {/* Organization Selector */}
      <Paper sx={{ p: 2, mb: 3 }}>
        {userOrganizations.length > 0 && (
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Select Organization</InputLabel>
            <Select
              value={selectedOrgId || ''}
              label="Select Organization"
              onChange={(e) => setSelectedOrgId(e.target.value)}
              disabled={userOrganizations.length === 1}
            >
              {userOrganizations.map((org) => (
                <MenuItem key={org.organization_id} value={org.organization_id}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography>{org.organization_name}</Typography>
                    {org.organization_fqdn && (
                      <Chip 
                        label={org.organization_fqdn} 
                        size="small" 
                        variant="outlined" 
                        sx={{ ml: 1 }}
                      />
                    )}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        
        {/* Add New Organization Button - Show for admins and super_admins */}
        {(user?.role === 'admin' || user?.role === 'super_admin') && (
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => {
                setAddOrgDialogOpen(true);
                resetAddOrg({
                  organizationName: '',
                  tenantId: '',
                  fqdn: ''
                });
              }}
            >
              Add New Organization
            </Button>
          </Box>
        )}
        
        {/* Show message if no organizations */}
        {userOrganizations.length === 0 && (
          <Alert severity="info">
            No organizations available. Please ensure you are properly authenticated.
          </Alert>
        )}
      </Paper>

      <Paper sx={{ mb: 3 }}>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
          <Tab label="General" />
          <Tab label="Appearance" />
          <Tab label="Extraction" />
          <Tab label="Analysis" />
          <Tab label="Alerting" />
          <Tab label="Credentials" />
          <Tab label="Certificates" />
        </Tabs>
      </Paper>

      <form onSubmit={handleSubmit(onSubmit)}>
        {/* General Settings */}
        {tabValue === 0 && (
          <Grid container spacing={3}>
            <Grid item xs={12} md={8}>
              <Card>
                <CardHeader 
                  title={organization?.id === 'individual' ? 'User Information' : 'Organization Information'}
                  action={
                    user?.role === 'admin' && selectedOrgId !== '00000000-0000-0000-0000-000000000001' && (
                      <IconButton
                        color="error"
                        onClick={() => setDeleteDialogOpen(true)}
                        disabled={loading}
                      >
                        <DeleteIcon />
                      </IconButton>
                    )
                  }
                />
                <CardContent>
                  <Grid container spacing={3}>
                    <Grid item xs={12}>
                      <Controller
                        name="organizationName"
                        control={control}
                        rules={{ required: organization?.id === 'individual' ? 'Display name is required' : 'Organization name is required' }}
                        render={({ field, fieldState }) => (
                          <TextField
                            {...field}
                            fullWidth
                            label={organization?.id === 'individual' ? 'Display Name' : 'Organization Name'}
                            error={fieldState.invalid}
                            helperText={fieldState.error?.message}
                            disabled={organization?.id === 'individual'}
                          />
                        )}
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <Controller
                        name="tenantId"
                        control={control}
                        rules={{ 
                          required: 'Tenant ID is required',
                          pattern: {
                            value: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
                            message: 'Invalid Tenant ID format (must be a valid UUID)'
                          }
                        }}
                        render={({ field, fieldState }) => (
                          <TextField
                            {...field}
                            fullWidth
                            label="Tenant ID"
                            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                            helperText={fieldState.error?.message || "Microsoft 365 tenant identifier"}
                            error={fieldState.invalid}
                          />
                        )}
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <Controller
                        name="fqdn"
                        control={control}
                        rules={{ 
                          required: 'FQDN is required',
                          pattern: {
                            value: /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$/,
                            message: 'Invalid FQDN format (e.g., contoso.onmicrosoft.com)'
                          }
                        }}
                        render={({ field, fieldState }) => (
                          <TextField
                            {...field}
                            fullWidth
                            label="Organization FQDN"
                            placeholder="contoso.onmicrosoft.com"
                            helperText={fieldState.error?.message || "Your Microsoft 365 organization domain (used for PowerShell connections)"}
                            error={fieldState.invalid}
                          />
                        )}
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <Controller
                        name="retentionDays"
                        control={control}
                        render={({ field }) => (
                          <TextField
                            {...field}
                            fullWidth
                            type="number"
                            label="Data Retention (Days)"
                            helperText="How long to keep extracted data"
                            inputProps={{ min: 1, max: 365 }}
                          />
                        )}
                      />
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card>
                <CardHeader title="Quick Stats" />
                <CardContent>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Organization Status: Active
                  </Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Created: {organization && new Date(organization.createdAt).toLocaleDateString()}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Last Updated: {organization && new Date(organization.updatedAt).toLocaleDateString()}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        )}

        {/* Appearance Settings */}
        {tabValue === 1 && (
          <Card>
            <CardHeader title="Theme & Appearance" />
            <CardContent>
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <Typography variant="h6" gutterBottom>
                    Theme Selection
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Choose a theme that matches your workflow and preference. Themes are automatically saved and applied across all sessions.
                  </Typography>
                  
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                    <ThemeSelector variant="compact" />
                    <Typography variant="caption" color="text.secondary">
                      Click to browse all available themes
                    </Typography>
                  </Box>

                  <Alert severity="info" sx={{ mb: 2 }}>
                    <Typography variant="body2">
                      <strong>Professional Tip:</strong> Dark themes are recommended for prolonged use and reduce eye strain during incident response operations.
                    </Typography>
                  </Alert>

                  <Card variant="outlined" sx={{ mt: 3 }}>
                    <CardContent>
                      <Typography variant="subtitle2" gutterBottom>
                        Current Theme Information
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Chip 
                          label={currentTheme.category} 
                          size="small" 
                          color="primary" 
                          variant="outlined" 
                        />
                        <Typography variant="body2">
                          {currentTheme.description}
                        </Typography>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        )}

        {/* Extraction Settings */}
        {tabValue === 2 && (
          <Card>
            <CardHeader title="Data Extraction Settings" />
            <CardContent>
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <Controller
                    name="extractionScheduleEnabled"
                    control={control}
                    render={({ field }) => (
                      <FormControlLabel
                        control={<Switch {...field} checked={field.value} />}
                        label="Enable Automatic Extraction"
                      />
                    )}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <Controller
                    name="extractionInterval"
                    control={control}
                    render={({ field }) => (
                      <FormControl fullWidth>
                        <InputLabel>Extraction Frequency</InputLabel>
                        <Select {...field} label="Extraction Frequency">
                          <MenuItem value="hourly">Hourly</MenuItem>
                          <MenuItem value="daily">Daily</MenuItem>
                          <MenuItem value="weekly">Weekly</MenuItem>
                        </Select>
                      </FormControl>
                    )}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <Controller
                    name="extractionTime"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        fullWidth
                        type="time"
                        label="Extraction Time"
                        InputLabelProps={{ shrink: true }}
                        helperText="Time to run automatic extractions"
                      />
                    )}
                  />
                </Grid>
                <Grid item xs={12}>
                  <Alert severity="info">
                    Automatic extractions will collect data from the last 24 hours for daily schedules,
                    or the last 7 days for weekly schedules.
                  </Alert>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        )}

        {/* Analysis Settings */}
        {tabValue === 3 && (
          <Card>
            <CardHeader title="Security Analysis Settings" />
            <CardContent>
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <Controller
                    name="autoAnalyze"
                    control={control}
                    render={({ field }) => (
                      <FormControlLabel
                        control={<Switch {...field} checked={field.value} />}
                        label="Automatically analyze extracted data"
                      />
                    )}
                  />
                </Grid>
                <Grid item xs={12}>
                  <Controller
                    name="enableThreatIntel"
                    control={control}
                    render={({ field }) => (
                      <FormControlLabel
                        control={<Switch {...field} checked={field.value} />}
                        label="Enable threat intelligence integration"
                      />
                    )}
                  />
                </Grid>
                <Grid item xs={12}>
                  <Alert severity="info">
                    Automatic analysis will run immediately after each successful data extraction.
                    Threat intelligence integration requires additional configuration.
                  </Alert>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        )}

        {/* Alerting Settings */}
        {tabValue === 4 && (
          <Card>
            <CardHeader title="Alert and Notification Settings" />
            <CardContent>
              <Grid container spacing={3}>
                <Grid item xs={12}>
                  <Controller
                    name="emailNotifications"
                    control={control}
                    render={({ field }) => (
                      <FormControlLabel
                        control={<Switch {...field} checked={field.value} />}
                        label="Enable email notifications"
                      />
                    )}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <Controller
                    name="severityThreshold"
                    control={control}
                    render={({ field }) => (
                      <FormControl fullWidth>
                        <InputLabel>Minimum Alert Severity</InputLabel>
                        <Select {...field} label="Minimum Alert Severity">
                          <MenuItem value="low">Low</MenuItem>
                          <MenuItem value="medium">Medium</MenuItem>
                          <MenuItem value="high">High</MenuItem>
                          <MenuItem value="critical">Critical</MenuItem>
                        </Select>
                      </FormControl>
                    )}
                  />
                </Grid>
                <Grid item xs={12}>
                  <Controller
                    name="webhookUrl"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        fullWidth
                        label="Webhook URL"
                        placeholder="https://your-webhook-endpoint.com/alerts"
                        helperText="Optional: Send alerts to external webhook"
                      />
                    )}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        )}

        {/* Credentials Settings */}
        {tabValue === 5 && (
          <Card>
            <CardHeader 
              title="Microsoft 365 & Azure Credentials" 
              action={
                <Button
                  startIcon={<AddIcon />}
                  onClick={() => {
                    setCredentialsDialogOpen(true);
                    // Pre-populate fields based on organization type and existing data
                    setTimeout(() => {
                      if (organization) {
                        if (organization.id === 'individual') {
                          // For individual users, try to populate from user preferences if available
                          resetCredentials({
                            credentialsTenantId: organization.tenantId || '',
                            fqdn: organization.fqdn || '',
                            applicationId: '574cfe92-60a1-4271-9c80-8aba00070e67', // Default MAES app ID
                            clientSecret: '',
                            certificateThumbprint: ''
                          });
                        } else {
                          resetCredentials({
                            credentialsTenantId: organization.tenantId || '',
                            fqdn: organization.fqdn || '',
                            applicationId: '',
                            clientSecret: '',
                            certificateThumbprint: ''
                          });
                        }
                      }
                    }, 100);
                  }}
                >
                  Configure
                </Button>
              }
            />
            <CardContent>
              {organization?.credentials && Object.keys(organization.credentials).length > 0 ? (
                <List>
                  <ListItem>
                    <ListItemText 
                      primary="Application ID" 
                      secondary={renderCredentialValue(organization.credentials.applicationId, 'applicationId')}
                    />
                    <ListItemSecondaryAction>
                      <IconButton 
                        edge="end" 
                        onClick={() => toggleCredentialVisibility('applicationId')}
                      >
                        {showCredentials.applicationId ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                  <Divider />
                  <ListItem>
                    <ListItemText 
                      primary="Client Secret" 
                      secondary={renderCredentialValue(organization.credentials.clientSecret, 'clientSecret')}
                    />
                    <ListItemSecondaryAction>
                      <IconButton 
                        edge="end" 
                        onClick={() => toggleCredentialVisibility('clientSecret')}
                      >
                        {showCredentials.clientSecret ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                  <Divider />
                  <ListItem>
                    <ListItemText 
                      primary="Certificate Thumbprint" 
                      secondary={renderCredentialValue(organization.credentials.certificateThumbprint, 'certificateThumbprint')}
                    />
                    <ListItemSecondaryAction>
                      <IconButton 
                        edge="end" 
                        onClick={() => toggleCredentialVisibility('certificateThumbprint')}
                      >
                        {showCredentials.certificateThumbprint ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                </List>
              ) : (
                <Alert severity="warning">
                  {organization?.id === 'individual' ? (
                    <>No credentials configured. Configure Microsoft 365 and Azure credentials to enable data extraction from your tenant.</>
                  ) : (
                    <>No credentials configured. You need to configure Microsoft 365 and Azure credentials to enable data extraction.</>
                  )}
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {/* Certificate Management */}
        {tabValue === 6 && (
          <Grid container spacing={3}>
            <Grid item xs={12} md={8}>
              <Card>
                <CardHeader title="Certificate Upload" />
                <CardContent>
                  <Grid container spacing={3}>
                    <Grid item xs={12}>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Upload your own .pfx certificate file for Microsoft 365 authentication. 
                        This certificate will be used instead of the default certificate for data extraction.
                      </Typography>
                    </Grid>
                    <Grid item xs={12}>
                      <input
                        accept=".pfx,.p12"
                        style={{ display: 'none' }}
                        id="certificate-file-input"
                        type="file"
                        onChange={(e) => setCertificateFile(e.target.files[0])}
                      />
                      <label htmlFor="certificate-file-input">
                        <Button
                          variant="outlined"
                          component="span"
                          startIcon={<AddIcon />}
                          fullWidth
                        >
                          Select Certificate File (.pfx)
                        </Button>
                      </label>
                      {certificateFile && (
                        <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                          Selected: {certificateFile.name}
                        </Typography>
                      )}
                    </Grid>
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        type="password"
                        label="Certificate Password"
                        value={certificatePassword}
                        onChange={(e) => setCertificatePassword(e.target.value)}
                        placeholder="Enter certificate password"
                        helperText="Password for the .pfx certificate file"
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <Button
                        variant="contained"
                        onClick={handleCertificateUpload}
                        disabled={!certificateFile || !certificatePassword || certificateUploadLoading}
                        startIcon={certificateUploadLoading ? <CircularProgress size={16} /> : <SaveIcon />}
                      >
                        {certificateUploadLoading ? 'Uploading...' : 'Upload Certificate'}
                      </Button>
                    </Grid>
                    <Grid item xs={12}>
                      <Alert severity="info">
                        <Typography variant="body2">
                          <strong>Certificate Requirements:</strong>
                        </Typography>
                        <ul style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
                          <li>Must be a .pfx (PKCS#12) format</li>
                          <li>Must include the private key</li>
                          <li>Certificate must be configured in your Azure application</li>
                          <li>If not provided, system will fallback to default certificate</li>
                        </ul>
                      </Alert>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card>
                <CardHeader title="Uploaded Certificates" />
                <CardContent>
                  {userCertificates.length > 0 ? (
                    <List>
                      {userCertificates.map((cert) => (
                        <React.Fragment key={cert.id}>
                          <ListItem>
                            <ListItemText 
                              primary={cert.filename}
                              secondary={
                                <Box>
                                  <Typography variant="caption" display="block">
                                    Uploaded: {new Date(cert.uploadedAt).toLocaleDateString()}
                                  </Typography>
                                  <Typography variant="caption" display="block">
                                    Thumbprint: {cert.thumbprint}
                                  </Typography>
                                  <Chip 
                                    label={cert.isActive ? 'Active' : 'Inactive'} 
                                    size="small" 
                                    color={cert.isActive ? 'success' : 'default'}
                                    sx={{ mt: 0.5 }}
                                  />
                                </Box>
                              }
                            />
                            <ListItemSecondaryAction>
                              <IconButton 
                                edge="end" 
                                color="error"
                                onClick={() => handleDeleteCertificate(cert.id)}
                                title="Delete Certificate"
                              >
                                <DeleteIcon />
                              </IconButton>
                            </ListItemSecondaryAction>
                          </ListItem>
                          <Divider />
                        </React.Fragment>
                      ))}
                    </List>
                  ) : (
                    <Alert severity="info">
                      No certificates uploaded yet. Upload a certificate to use custom authentication for data extraction.
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12}>
              <Card>
                <CardHeader title="Default Certificate Information" />
                <CardContent>
                  <Alert severity="warning">
                    <Typography variant="body2">
                      <strong>Fallback Behavior:</strong> If no user certificate is uploaded or if the uploaded certificate fails, 
                      the system will automatically fallback to the default certificate located at <code>/certs/app.pfx</code>.
                      While this provides basic functionality, using your own certificate is recommended for production environments.
                    </Typography>
                  </Alert>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        )}

        {/* Save Button */}
        {tabValue !== 5 && tabValue !== 6 && (
          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              type="submit"
              variant="contained"
              startIcon={<SaveIcon />}
              disabled={loading}
            >
              Save Settings
            </Button>
          </Box>
        )}
      </form>

      {/* Credentials Configuration Dialog */}
      <Dialog open={credentialsDialogOpen} onClose={() => setCredentialsDialogOpen(false)} maxWidth="md" fullWidth>
        <form onSubmit={handleCredentialsSubmit(onCredentialsSubmit)}>
          <DialogTitle>Configure Microsoft 365 & Azure Credentials</DialogTitle>
          <DialogContent>
            <Alert severity="info" sx={{ mb: 3 }}>
              To extract data from Microsoft 365 and Azure, you need to configure application credentials.
              These credentials are stored encrypted and used only for data extraction. Follow the 
              <a href="https://learn.microsoft.com/en-us/powershell/exchange/app-only-auth-powershell-v2?view=exchange-ps" target="_blank" rel="noopener" style={{ marginLeft: '4px' }}>
                Microsoft documentation
              </a> to set up your Azure application.
            </Alert>
            
            {connectionTestResult && (
              <Alert 
                severity={connectionTestResult.success ? 'success' : 'error'} 
                sx={{ mb: 3 }}
                onClose={() => setConnectionTestResult(null)}
              >
                <Typography variant="subtitle2" gutterBottom>{connectionTestResult.message}</Typography>
                
                {(connectionTestResult.ualStatus || connectionTestResult.graphStatus) && (
                  <Box sx={{ mt: 1, p: 1, bgcolor: 'rgba(0,0,0,0.04)', borderRadius: 1 }}>
                    {connectionTestResult.ualStatus && (
                      <>
                        <Typography variant="caption" display="block" gutterBottom>
                          <strong>Unified Audit Log Status:</strong>
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                          {connectionTestResult.ualStatus === 'enabled' && (
                            <>
                              <CheckCircleIcon sx={{ color: 'success.main', fontSize: 16 }} />
                              <Typography variant="caption" color="success.main">
                                Enabled - You can extract unified audit logs
                              </Typography>
                            </>
                          )}
                          {connectionTestResult.ualStatus === 'disabled' && (
                            <>
                              <WarningIcon sx={{ color: 'warning.main', fontSize: 16 }} />
                              <Typography variant="caption" color="warning.main">
                                Disabled - Enable auditing in Microsoft 365 compliance center to access audit logs
                              </Typography>
                            </>
                          )}
                          {connectionTestResult.ualStatus === 'error' && (
                            <>
                              <ErrorIcon sx={{ color: 'error.main', fontSize: 16 }} />
                              <Typography variant="caption" color="error.main">
                                Unable to verify - Check application permissions
                              </Typography>
                            </>
                          )}
                        </Box>
                      </>
                    )}
                    
                    {connectionTestResult.graphStatus && (
                      <>
                        <Typography variant="caption" display="block" gutterBottom>
                          <strong>Microsoft Graph API Status:</strong>
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {connectionTestResult.graphStatus === 'success' && (
                            <>
                              <CheckCircleIcon sx={{ color: 'success.main', fontSize: 16 }} />
                              <Typography variant="caption" color="success.main">
                                Connected - You can extract Graph data (Users, Devices, MFA, Licenses)
                              </Typography>
                            </>
                          )}
                          {connectionTestResult.graphStatus === 'error' && (
                            <>
                              <ErrorIcon sx={{ color: 'error.main', fontSize: 16 }} />
                              <Typography variant="caption" color="error.main">
                                Connection failed - Check tenant ID and Graph API permissions
                              </Typography>
                            </>
                          )}
                          {connectionTestResult.graphStatus === 'unknown' && (
                            <>
                              <WarningIcon sx={{ color: 'warning.main', fontSize: 16 }} />
                              <Typography variant="caption" color="warning.main">
                                Unable to verify Graph connection
                              </Typography>
                            </>
                          )}
                        </Box>
                      </>
                    )}
                  </Box>
                )}
                
                {connectionTestResult.details?.recommendations && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" display="block" gutterBottom>Recommendations:</Typography>
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                      {connectionTestResult.details.recommendations.map((rec, idx) => (
                        <li key={idx}><Typography variant="caption">{rec}</Typography></li>
                      ))}
                    </ul>
                  </Box>
                )}
              </Alert>
            )}
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Controller
                  name="applicationId"
                  control={credentialsControl}
                  rules={{ 
                    required: 'Application ID is required',
                    pattern: {
                      value: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
                      message: 'Invalid Application ID format'
                    }
                  }}
                  render={({ field, fieldState }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Application ID"
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      helperText={fieldState.error?.message || "Azure App Registration Application ID"}
                      error={fieldState.invalid}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12}>
                <Controller
                  name="clientSecret"
                  control={credentialsControl}
                  rules={{ required: 'Client Secret is required' }}
                  render={({ field, fieldState }) => (
                    <TextField
                      {...field}
                      fullWidth
                      type="password"
                      label="Client Secret"
                      placeholder="Enter client secret"
                      helperText={fieldState.error?.message || "Azure App Registration client secret"}
                      error={fieldState.invalid}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12}>
                <Controller
                  name="certificateThumbprint"
                  control={credentialsControl}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Certificate Thumbprint (Optional)"
                      placeholder="Enter certificate thumbprint"
                      helperText="For certificate-based authentication"
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Controller
                  name="credentialsTenantId"
                  control={credentialsControl}
                  rules={{ 
                    required: 'Tenant ID is required',
                    pattern: {
                      value: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
                      message: 'Invalid Tenant ID format (must be a valid UUID)'
                    }
                  }}
                  render={({ field, fieldState }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Tenant ID"
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      helperText={fieldState.error?.message || "Your Microsoft 365 tenant ID"}
                      error={fieldState.invalid}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Controller
                  name="fqdn"
                  control={credentialsControl}
                  rules={{ 
                    required: 'FQDN is required',
                    pattern: {
                      value: /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$/,
                      message: 'Invalid FQDN format (e.g., contoso.onmicrosoft.com)'
                    }
                  }}
                  render={({ field, fieldState }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Organization FQDN"
                      placeholder="contoso.onmicrosoft.com"
                      helperText={fieldState.error?.message || "Your M365 domain (required for PowerShell)"}
                      error={fieldState.invalid}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12}>
                <Alert severity="warning">
                  <Typography variant="body2">
                    <strong>Important:</strong> Ensure your Azure application has the following:
                  </Typography>
                  <ul style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
                    <li>Exchange.ManageAsApp permission in Office 365 Exchange Online API</li>
                    <li>Admin consent granted for the permissions</li>
                    <li>The app assigned to users in Enterprise Applications</li>
                  </ul>
                </Alert>
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ justifyContent: 'space-between' }}>
            <Button
              onClick={testConnection}
              startIcon={testingConnection ? <CircularProgress size={16} /> : <CloudSyncIcon />}
              disabled={testingConnection || !watchedApplicationId || !watchedFqdn || (!watchedClientSecret && !watchedCertificateThumbprint)}
            >
              {testingConnection ? 'Testing...' : 'Test Connection'}
            </Button>
            <Box>
              <Button onClick={() => {
                setCredentialsDialogOpen(false);
                resetCredentials();
                setConnectionTestResult(null);
              }}>
                Cancel
              </Button>
              <Button 
                type="submit"
                variant="contained"
                disabled={credentialsLoading}
                sx={{ ml: 1 }}
              >
                {credentialsLoading ? 'Saving...' : 'Save Credentials'}
              </Button>
            </Box>
          </DialogActions>
        </form>
      </Dialog>

      {/* Add Organization Dialog */}
      <Dialog open={addOrgDialogOpen} onClose={() => setAddOrgDialogOpen(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleAddOrgSubmit(onAddOrganization)}>
          <DialogTitle>Add New Organization</DialogTitle>
          <DialogContent>
            <Alert severity="info" sx={{ mb: 3 }}>
              Add a new Microsoft 365 organization to manage through MAES. You'll be able to configure credentials and extract data from this organization.
            </Alert>
            
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Controller
                  name="organizationName"
                  control={addOrgControl}
                  rules={{ required: 'Organization name is required' }}
                  render={({ field, fieldState }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Organization Name"
                      placeholder="e.g., Contoso Corporation"
                      helperText={fieldState.error?.message || "Display name for this organization"}
                      error={fieldState.invalid}
                      margin="normal"
                    />
                  )}
                />
              </Grid>
              
              <Grid item xs={12}>
                <Controller
                  name="fqdn"
                  control={addOrgControl}
                  rules={{ 
                    required: 'FQDN is required',
                    pattern: {
                      value: /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$/,
                      message: 'Invalid FQDN format (e.g., contoso.onmicrosoft.com)'
                    }
                  }}
                  render={({ field, fieldState }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Organization FQDN"
                      placeholder="contoso.onmicrosoft.com"
                      helperText={fieldState.error?.message || "Microsoft 365 tenant domain"}
                      error={fieldState.invalid}
                      margin="normal"
                    />
                  )}
                />
              </Grid>
              
              <Grid item xs={12}>
                <Controller
                  name="tenantId"
                  control={addOrgControl}
                  rules={{ 
                    required: 'Tenant ID is required',
                    pattern: {
                      value: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
                      message: 'Invalid Tenant ID format (must be a valid UUID)'
                    }
                  }}
                  render={({ field, fieldState }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Tenant ID"
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      helperText={fieldState.error?.message || "Azure AD tenant identifier"}
                      error={fieldState.invalid}
                      margin="normal"
                    />
                  )}
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => {
              setAddOrgDialogOpen(false);
              resetAddOrg();
            }}>
              Cancel
            </Button>
            <Button 
              type="submit"
              variant="contained"
              disabled={addOrgLoading}
              startIcon={addOrgLoading ? <CircularProgress size={16} /> : <AddIcon />}
            >
              {addOrgLoading ? 'Adding...' : 'Add Organization'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Delete Organization Dialog */}
      <Dialog 
        open={deleteDialogOpen} 
        onClose={() => {
          setDeleteDialogOpen(false);
          setDeleteConfirmation('');
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle color="error">Delete Organization</DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            <strong>Warning:</strong> This action cannot be undone. All data associated with this organization will be permanently deleted.
          </Alert>
          <Typography variant="body2" sx={{ mb: 2 }}>
            To confirm deletion, please type the organization name: <strong>{organization?.name}</strong>
          </Typography>
          <TextField
            fullWidth
            label="Organization Name"
            value={deleteConfirmation}
            onChange={(e) => setDeleteConfirmation(e.target.value)}
            error={deleteConfirmation !== '' && deleteConfirmation !== organization?.name}
            helperText={deleteConfirmation !== '' && deleteConfirmation !== organization?.name ? 'Name does not match' : ''}
          />
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => {
              setDeleteDialogOpen(false);
              setDeleteConfirmation('');
            }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleDeleteOrganization}
            color="error"
            variant="contained"
            disabled={deleteLoading || deleteConfirmation !== organization?.name}
            startIcon={deleteLoading ? <CircularProgress size={16} /> : <DeleteIcon />}
          >
            {deleteLoading ? 'Deleting...' : 'Delete Organization'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Settings;