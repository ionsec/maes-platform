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

const Settings = () => {
  const [loading, setLoading] = useState(false);
  const [organization, setOrganization] = useState(null);
  const [tabValue, setTabValue] = useState(0);
  const [credentialsDialogOpen, setCredentialsDialogOpen] = useState(false);
  const [showCredentials, setShowCredentials] = useState({});
  const [credentialsLoading, setCredentialsLoading] = useState(false);
  const [actualCredentials, setActualCredentials] = useState({});
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState(null);
  const { control, handleSubmit, reset, setValue } = useForm();
  const { control: credentialsControl, handleSubmit: handleCredentialsSubmit, reset: resetCredentials, watch: watchCredentials } = useForm();
  const { enqueueSnackbar } = useSnackbar();
  
  const watchedApplicationId = watchCredentials('applicationId');
  const watchedFqdn = watchCredentials('fqdn');
  const watchedClientSecret = watchCredentials('clientSecret');
  const watchedCertificateThumbprint = watchCredentials('certificateThumbprint');

  const fetchOrganization = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/organizations/current');
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

  useEffect(() => {
    fetchOrganization();
  }, []);

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

      await axios.put('/api/organizations/current', payload);
      enqueueSnackbar('Settings saved successfully', { variant: 'success' });
      fetchOrganization();
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
        const response = await axios.get('/api/organizations/current?showCredentials=true');
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
        ualStatus: response.data.ualStatus
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

      await axios.put('/api/organizations/current/credentials', credentialsPayload);

      // Update tenant ID and FQDN if they were changed
      if ((data.credentialsTenantId && data.credentialsTenantId !== organization?.tenantId) || 
          (data.fqdn && data.fqdn !== organization?.fqdn)) {
        const orgPayload = {
          tenantId: data.credentialsTenantId,
          fqdn: data.fqdn
        };
        await axios.put('/api/organizations/current', orgPayload);
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

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        {organization?.id === 'individual' ? 'User Settings' : 'Organization Settings'}
      </Typography>

      <Paper sx={{ mb: 3 }}>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
          <Tab label="General" />
          <Tab label="Extraction" />
          <Tab label="Analysis" />
          <Tab label="Alerting" />
          <Tab label="Credentials" />
        </Tabs>
      </Paper>

      <form onSubmit={handleSubmit(onSubmit)}>
        {/* General Settings */}
        {tabValue === 0 && (
          <Grid container spacing={3}>
            <Grid item xs={12} md={8}>
              <Card>
                <CardHeader title={organization?.id === 'individual' ? 'User Information' : 'Organization Information'} />
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

        {/* Extraction Settings */}
        {tabValue === 1 && (
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
        {tabValue === 2 && (
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
        {tabValue === 3 && (
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
        {tabValue === 4 && (
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

        {/* Save Button */}
        {tabValue !== 4 && (
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
                
                {connectionTestResult.ualStatus && (
                  <Box sx={{ mt: 1, p: 1, bgcolor: 'rgba(0,0,0,0.04)', borderRadius: 1 }}>
                    <Typography variant="caption" display="block" gutterBottom>
                      <strong>Unified Audit Log Status:</strong>
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
    </Box>
  );
};

export default Settings;