import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  LinearProgress,
  Alert,
  Fab,
  FormControlLabel,
  Switch,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip
} from '@mui/material';
import {
  Add as AddIcon,
  Refresh as RefreshIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
  Download as DownloadIcon,
  Visibility as ViewIcon,
  ExpandMore as ExpandMoreIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon
} from '@mui/icons-material';
import { DateTimePicker } from '@mui/x-date-pickers';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import TourButton from '../components/TourButton';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { useForm, Controller } from 'react-hook-form';
import { useSnackbar } from 'notistack';
import dayjs from 'dayjs';
import axios from '../utils/axios';
import { useOrganization } from '../contexts/OrganizationContext';

const extractionTypes = [
  { value: 'unified_audit_log', label: 'Unified Audit Log', description: 'Microsoft 365 audit events (Exchange Online)' },
  { value: 'azure_signin_logs', label: 'Azure Sign-in Logs (Graph)', description: 'Azure AD authentication events via Microsoft Graph' },
  { value: 'azure_audit_logs', label: 'Azure Audit Logs (Graph)', description: 'Azure AD configuration changes via Microsoft Graph' },
  { value: 'mfa_status', label: 'MFA Status (Graph)', description: 'Multi-factor authentication status via Microsoft Graph' },
  { value: 'oauth_permissions', label: 'OAuth Permissions', description: 'Application permissions and consents' },
  { value: 'risky_users', label: 'Users (Graph)', description: 'User accounts and properties via Microsoft Graph' },
  { value: 'risky_detections', label: 'Risky Detections', description: 'Azure AD risk events' },
  { value: 'mailbox_audit', label: 'Mailbox Audit', description: 'Exchange Online mailbox activity' },
  { value: 'message_trace', label: 'Message Trace', description: 'Email message tracking' },
  { value: 'devices', label: 'Devices (Graph)', description: 'Device registration and compliance via Microsoft Graph' },
  { value: 'ual_graph', label: 'UAL via Graph', description: 'Unified Audit Log via Microsoft Graph API' },
  { value: 'licenses', label: 'Licenses (Graph)', description: 'License usage and allocation via Microsoft Graph' },
  { value: 'full_extraction', label: 'Full Extraction', description: 'Complete evidence collection' }
];

const statusColors = {
  pending: 'warning',
  running: 'info',
  completed: 'success',
  failed: 'error',
  cancelled: 'default'
};

const Extractions = () => {
  const { selectedOrganizationId } = useOrganization();
  
  // Tour steps configuration
  const extractionsTourSteps = [
    {
      target: '[data-tour="extractions-title"]',
      title: 'Data Extractions',
      content: 'This page allows you to manage and monitor Microsoft 365 data extraction jobs. You can create new extractions, monitor progress, and download results.',
      tourId: 'extractions-tour'
    },
    {
      target: '[data-tour="new-extraction-button"]',
      title: 'Create New Extraction',
      content: 'Click this button to start a new data extraction job. You can choose different extraction types like Unified Audit Log, Exchange items, or SharePoint data.',
      tourId: 'extractions-tour'
    },
    {
      target: '[data-tour="extractions-table"]',
      title: 'Extractions List',
      content: 'Monitor all your extraction jobs here. You can see the status, progress, and results of each extraction. Click on items to view logs or download data.',
      tourId: 'extractions-tour'
    }
  ]

  const [extractions, setExtractions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedExtraction, setSelectedExtraction] = useState(null);
  const [progressData, setProgressData] = useState({});
  const [logsDialogOpen, setLogsDialogOpen] = useState(false);
  const [logRefreshInterval, setLogRefreshInterval] = useState(null);
  const [autoRefreshLogs, setAutoRefreshLogs] = useState(true);
  const [statsDialogOpen, setStatsDialogOpen] = useState(false);
  const [selectedStats, setSelectedStats] = useState(null);
  const [orgConfigStatus, setOrgConfigStatus] = useState({ isConfigured: true, missingRequirements: [] });
  const { control, handleSubmit, reset, watch } = useForm({
    defaultValues: {
      type: 'unified_audit_log',
      startDate: dayjs().subtract(7, 'days'),
      endDate: dayjs(),
      priority: 'medium',
      includeDeleted: false,
      filterUsers: '',
      filterOperations: '',
      customFilters: ''
    }
  });
  const { enqueueSnackbar } = useSnackbar();

  const selectedType = watch('type');

  const fetchExtractions = async () => {
    setLoading(true);
    try {
      const url = selectedOrganizationId 
        ? `/api/extractions?organizationId=${selectedOrganizationId}`
        : '/api/extractions';
      const response = await axios.get(url);
      setExtractions(response.data.extractions);
      
      // Debug logging for download button visibility
      console.log('Extractions fetched:', response.data.extractions.length);
      response.data.extractions.forEach((ext, index) => {
        console.log(`Extraction ${index + 1}:`, {
          id: ext.id,
          status: ext.status,
          outputFiles: ext.outputFiles,
          outputFilesLength: ext.outputFiles?.length || 0,
          canDownload: ext.status === 'completed' && ext.outputFiles?.length > 0
        });
      });
      
      // Fetch progress for running extractions
      const runningExtractions = response.data.extractions.filter(e => e.status === 'running');
      await fetchProgressForExtractions(runningExtractions);
    } catch (error) {
      enqueueSnackbar('Failed to fetch extractions', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const fetchOrgConfigStatus = async () => {
    if (!selectedOrganizationId) {
      setOrgConfigStatus({ isConfigured: true, missingRequirements: [] });
      return;
    }

    try {
      const response = await axios.get('/api/organizations/configuration-status', {
        headers: {
          'x-organization-id': selectedOrganizationId
        }
      });
      
      setOrgConfigStatus({
        isConfigured: response.data.isConfigured,
        missingRequirements: response.data.missingRequirements || [],
        canRunExtractions: response.data.canRunExtractions
      });
    } catch (error) {
      console.error('Failed to fetch organization configuration status:', error);
      // On error, assume not configured to be safe
      setOrgConfigStatus({
        isConfigured: false,
        missingRequirements: ['Unable to verify organization configuration'],
        canRunExtractions: false
      });
    }
  };

  const fetchProgressForExtractions = async (runningExtractions) => {
    try {
      const progressPromises = runningExtractions.map(async (extraction) => {
        try {
          const response = await axios.get(`/api/extractions/${extraction.id}/progress`, {
            headers: {
              'x-organization-id': selectedOrganizationId
            }
          });
          return { id: extraction.id, progress: response.data.progress };
        } catch (error) {
          return { id: extraction.id, progress: null };
        }
      });
      
      const progressResults = await Promise.all(progressPromises);
      const newProgressData = {};
      progressResults.forEach(result => {
        if (result.progress) {
          newProgressData[result.id] = result.progress;
        }
      });
      
      setProgressData(prev => ({ ...prev, ...newProgressData }));
    } catch (error) {
      console.error('Failed to fetch progress data:', error);
    }
  };

  useEffect(() => {
    fetchExtractions();
    fetchOrgConfigStatus();
    const interval = setInterval(fetchExtractions, 15000); // Refresh every 15 seconds (further reduced frequency)
    return () => clearInterval(interval);
  }, [selectedOrganizationId]);

  const onSubmit = async (data) => {
    // Check if organization is properly configured before creating extraction
    if (!orgConfigStatus.canRunExtractions) {
      enqueueSnackbar(
        `Cannot create extraction: Organization is not properly configured. Missing: ${orgConfigStatus.missingRequirements.join(', ')}`, 
        { variant: 'error', autoHideDuration: 8000 }
      );
      return;
    }

    try {
      const payload = {
        type: data.type,
        startDate: data.startDate.toISOString(),
        endDate: data.endDate.toISOString(),
        priority: data.priority,
        parameters: {
          includeDeleted: data.includeDeleted,
          filterUsers: data.filterUsers ? data.filterUsers.split(',').map(u => u.trim()) : [],
          filterOperations: data.filterOperations ? data.filterOperations.split(',').map(o => o.trim()) : [],
          customFilters: data.customFilters ? JSON.parse(data.customFilters) : {}
        }
      };

      await axios.post('/api/extractions', payload, {
        headers: {
          'x-organization-id': selectedOrganizationId
        }
      });
      enqueueSnackbar('Extraction job created successfully', { variant: 'success' });
      setDialogOpen(false);
      reset();
      fetchExtractions();
    } catch (error) {
      enqueueSnackbar(error.response?.data?.error || 'Failed to create extraction', { variant: 'error' });
    }
  };

  const cancelExtraction = async (id) => {
    try {
      await axios.post(`/api/extractions/${id}/cancel`, {}, {
        headers: {
          'x-organization-id': selectedOrganizationId
        }
      });
      enqueueSnackbar('Extraction cancelled', { variant: 'success' });
      fetchExtractions();
    } catch (error) {
      enqueueSnackbar('Failed to cancel extraction', { variant: 'error' });
    }
  };

  const viewLogs = async (id) => {
    try {
      const response = await axios.get(`/api/extractions/${id}/logs`, {
        headers: {
          'x-organization-id': selectedOrganizationId
        }
      });
      setSelectedExtraction({ id, logs: response.data.logs });
      setLogsDialogOpen(true);
      
      // Start auto-refresh for running extractions
      const extraction = extractions.find(e => e.id === id);
      if (extraction && ['pending', 'running'].includes(extraction.status)) {
        startLogRefresh(id);
      }
    } catch (error) {
      enqueueSnackbar('Failed to fetch logs', { variant: 'error' });
    }
  };

  const viewStats = (extraction) => {
    setSelectedStats(extraction);
    setStatsDialogOpen(true);
  };

  const downloadResults = async (extractionId) => {
    try {
      const response = await axios.get(`/api/extractions/${extractionId}/download`, {
        responseType: 'blob',
        headers: {
          'x-organization-id': selectedOrganizationId
        }
      });
      
      // Create blob URL and trigger download
      const blob = new Blob([response.data], { type: 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Extract filename from response headers
      const contentDisposition = response.headers['content-disposition'];
      let filename = `extraction_${extractionId}.zip`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      enqueueSnackbar('Download started successfully', { variant: 'success' });
    } catch (error) {
      enqueueSnackbar('Failed to download results', { variant: 'error' });
    }
  };

  const startLogRefresh = (id) => {
    if (logRefreshInterval) {
      clearInterval(logRefreshInterval);
    }
    
    const interval = setInterval(async () => {
      if (autoRefreshLogs && selectedExtraction && selectedExtraction.id === id) {
        try {
          const response = await axios.get(`/api/extractions/${id}/logs`, {
            headers: {
              'x-organization-id': selectedOrganizationId
            }
          });
          setSelectedExtraction(prev => ({ ...prev, logs: response.data.logs }));
          
          // Check if extraction is still running or recently completed
          const extraction = extractions.find(e => e.id === id);
          if (extraction && !['pending', 'running'].includes(extraction.status)) {
            // Continue refreshing for a few more seconds after completion to get final logs
            setTimeout(() => {
              clearInterval(interval);
              setLogRefreshInterval(null);
            }, 5000); // Wait 5 seconds after completion before stopping refresh
          }
        } catch (error) {
          console.error('Failed to refresh logs:', error);
        }
      }
    }, 2000); // Refresh every 2 seconds for real-time experience
    
    setLogRefreshInterval(interval);
  };

  const stopLogRefresh = () => {
    if (logRefreshInterval) {
      clearInterval(logRefreshInterval);
      setLogRefreshInterval(null);
    }
  };

  const closeLogsDialog = () => {
    setLogsDialogOpen(false);
    setSelectedExtraction(null);
    stopLogRefresh();
  };

  // Cleanup interval on component unmount
  useEffect(() => {
    return () => {
      if (logRefreshInterval) {
        clearInterval(logRefreshInterval);
      }
    };
  }, [logRefreshInterval]);

  const formatDuration = (seconds) => {
    if (!seconds) return '-';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}h ${minutes}m ${secs}s`;
  };

  const renderUalStatus = (ualStatus) => {
    if (!ualStatus) return null;
    
    const statusConfig = {
      enabled: { 
        icon: <CheckCircleIcon sx={{ color: 'success.main', fontSize: 16 }} />,
        tooltip: 'Unified Audit Log is enabled',
        color: 'success'
      },
      disabled: { 
        icon: <WarningIcon sx={{ color: 'warning.main', fontSize: 16 }} />,
        tooltip: 'Unified Audit Log is disabled - extraction may fail',
        color: 'warning'
      },
      error: { 
        icon: <ErrorIcon sx={{ color: 'error.main', fontSize: 16 }} />,
        tooltip: 'Unable to verify Unified Audit Log status',
        color: 'error'
      }
    };
    
    const config = statusConfig[ualStatus];
    if (!config) return null;
    
    return (
      <Tooltip title={config.tooltip}>
        {config.icon}
      </Tooltip>
    );
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h4" data-tour="extractions-title">Data Extractions</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TourButton 
              tourSteps={extractionsTourSteps}
              tourId="extractions-tour"
              variant="outlined"
              size="small"
            >
              Help Tour
            </TourButton>
            <IconButton onClick={fetchExtractions} disabled={loading}>
              <RefreshIcon />
            </IconButton>
            <Tooltip 
              title={!orgConfigStatus.canRunExtractions 
                ? `Organization not configured: ${orgConfigStatus.missingRequirements.join(', ')}`
                : "Create new extraction"
              }
            >
              <span>
                <Fab 
                  color="primary" 
                  sx={{ ml: 1 }}
                  onClick={() => setDialogOpen(true)}
                  disabled={!orgConfigStatus.canRunExtractions}
                  data-tour="new-extraction-button"
                >
                  <AddIcon />
                </Fab>
              </span>
            </Tooltip>
          </Box>
        </Box>

        {loading && <LinearProgress sx={{ mb: 2 }} />}

        {/* Organization Configuration Alert */}
        {!orgConfigStatus.canRunExtractions && (
          <Alert 
            severity="error" 
            sx={{ mb: 2 }}
            action={
              <Button color="inherit" size="small" href="/settings">
                Configure
              </Button>
            }
          >
            <strong>Organization Not Configured:</strong> This organization cannot run extractions. Missing: {orgConfigStatus.missingRequirements.join(', ')}. 
            Please complete the organization setup in Settings.
          </Alert>
        )}

        {/* UAL Status Alerts */}
        {extractions.some(e => progressData[e.id]?.ualStatus === 'disabled' && ['unified_audit_log', 'full_extraction'].includes(e.type)) && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="body2">
              <strong>Unified Audit Log Disabled:</strong> Some extractions require Unified Audit Log to be enabled in your Microsoft 365 organization. 
              Please enable auditing in the Microsoft 365 compliance center to access audit logs.
            </Typography>
          </Alert>
        )}
        
        {extractions.some(e => progressData[e.id]?.ualStatus === 'error' && ['unified_audit_log', 'full_extraction'].includes(e.type)) && (
          <Alert severity="error" sx={{ mb: 2 }}>
            <Typography variant="body2">
              <strong>Unable to Verify Audit Status:</strong> Could not check if Unified Audit Log is enabled. 
              Please ensure your application has the necessary permissions to access audit configuration.
            </Typography>
          </Alert>
        )}

        {/* Statistics Cards */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography variant="h6" color="primary">
                  {extractions.length}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Total Extractions
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography variant="h6" color="info.main">
                  {extractions.filter(e => e.status === 'running').length}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Running
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography variant="h6" color="success.main">
                  {extractions.filter(e => e.status === 'completed').length}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Completed
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography variant="h6" color="error.main">
                  {extractions.filter(e => e.status === 'failed').length}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Failed
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Extractions Table */}
        <TableContainer component={Paper} data-tour="extractions-table">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Type</TableCell>
                <TableCell>Date Range</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Progress</TableCell>
                <TableCell>Items</TableCell>
                <TableCell>Duration</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {extractions.map((extraction) => (
                <TableRow key={extraction.id}>
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">
                      {extractionTypes.find(t => t.value === extraction.type)?.label || extraction.type}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Priority: {extraction.priority}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {dayjs(extraction.startDate).format('MMM DD, YYYY')}
                    </Typography>
                    <Typography variant="body2">
                      to {dayjs(extraction.endDate).format('MMM DD, YYYY')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={extraction.status} 
                      color={statusColors[extraction.status]}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ width: 150 }}>
                      {(() => {
                        const progress = progressData[extraction.id] ? progressData[extraction.id].progress : (extraction.progress || 0);
                        const currentMessage = progressData[extraction.id] ? progressData[extraction.id].currentMessage : '';
                        const ualStatus = progressData[extraction.id] ? progressData[extraction.id].ualStatus : null;
                        
                        return (
                          <Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                              <LinearProgress 
                                variant="determinate" 
                                value={progress}
                                sx={{ flex: 1 }}
                              />
                              {ualStatus && ['unified_audit_log', 'full_extraction'].includes(extraction.type) && (
                                renderUalStatus(ualStatus)
                              )}
                            </Box>
                            <Typography variant="caption">
                              {progress}%
                            </Typography>
                            {currentMessage && extraction.status === 'running' && (
                              <Typography 
                                variant="caption" 
                                display="block" 
                                color="text.secondary" 
                                sx={{ 
                                  fontSize: '0.7rem', 
                                  mt: 0.5,
                                  lineHeight: 1.2,
                                  wordBreak: 'break-word'
                                }}
                              >
                                {(() => {
                                  // Clean up and format the message
                                  let formattedMessage = currentMessage;
                                  
                                  // Remove [INFO] prefix if present
                                  formattedMessage = formattedMessage.replace(/^\[INFO\]\s*/i, '');
                                  
                                  // Shorten long messages but keep important information
                                  if (formattedMessage.includes('Total number of events')) {
                                    const match = formattedMessage.match(/(\d+)/);
                                    if (match) {
                                      formattedMessage = `Total events: ${match[1]}`;
                                    }
                                  } else if (formattedMessage.includes('Using interval')) {
                                    const match = formattedMessage.match(/(\d+)\s+minutes/);
                                    if (match) {
                                      formattedMessage = `Interval: ${match[1]} min`;
                                    }
                                  } else if (formattedMessage.includes('Found') && formattedMessage.includes('audit logs')) {
                                    const match = formattedMessage.match(/(\d+)/);
                                    if (match) {
                                      formattedMessage = `Found ${match[1]} audit logs`;
                                    }
                                  } else if (formattedMessage.length > 50) {
                                    formattedMessage = formattedMessage.substring(0, 50) + '...';
                                  }
                                  
                                  return formattedMessage;
                                })()}
                              </Typography>
                            )}
                          </Box>
                        );
                      })()}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box 
                      sx={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'flex-start',
                        cursor: extraction.status === 'completed' ? 'pointer' : 'default',
                        '&:hover': extraction.status === 'completed' ? { 
                          bgcolor: 'action.hover' 
                        } : {}
                      }}
                      onClick={() => extraction.status === 'completed' && viewStats(extraction)}
                    >
                      <Typography variant="body2" fontWeight="bold">
                        {extraction.itemsExtracted?.toLocaleString() || 0}
                      </Typography>
                      {extraction.statistics?.totalEvents && extraction.statistics.totalEvents > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          {extraction.statistics.totalEvents.toLocaleString()} total events
                        </Typography>
                      )}
                      {extraction.status === 'completed' && (
                        <Typography variant="caption" color="primary.main" sx={{ fontSize: '0.65rem' }}>
                          Click for details
                        </Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>
                    {formatDuration(extraction.duration)}
                  </TableCell>
                  <TableCell>
                    <IconButton 
                      size="small" 
                      onClick={() => viewLogs(extraction.id)}
                      title="View Logs"
                    >
                      <ViewIcon />
                    </IconButton>
                    {['pending', 'running'].includes(extraction.status) && (
                      <IconButton 
                        size="small" 
                        onClick={() => cancelExtraction(extraction.id)}
                        title="Cancel"
                      >
                        <StopIcon />
                      </IconButton>
                    )}
                    {extraction.status === 'completed' && extraction.outputFiles?.length > 0 && (
                      <IconButton 
                        size="small" 
                        title="Download Results"
                        onClick={() => downloadResults(extraction.id)}
                      >
                        <DownloadIcon />
                      </IconButton>
                    )}
                    {/* Debug info for download button visibility */}
                    {extraction.status === 'completed' && (!extraction.outputFiles || extraction.outputFiles.length === 0) && (
                      <Tooltip title={`No output files available. Status: ${extraction.status}, OutputFiles: ${extraction.outputFiles?.length || 0}`}>
                        <IconButton 
                          size="small" 
                          disabled
                          title="No output files"
                        >
                          <DownloadIcon sx={{ color: 'text.disabled' }} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {extractions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    <Typography variant="body2" color="text.secondary">
                      No extractions found. Create your first extraction to get started.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Create Extraction Dialog */}
        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
          <form onSubmit={handleSubmit(onSubmit)}>
            <DialogTitle>Create New Extraction</DialogTitle>
            <DialogContent>
              <Grid container spacing={3} sx={{ mt: 1 }}>
                {/* Extraction Type */}
                <Grid item xs={12}>
                  <Controller
                    name="type"
                    control={control}
                    render={({ field }) => (
                      <FormControl fullWidth>
                        <InputLabel>Extraction Type</InputLabel>
                        <Select {...field} label="Extraction Type">
                          {extractionTypes.map((type) => (
                            <MenuItem key={type.value} value={type.value}>
                              <Box>
                                <Typography variant="body1">{type.label}</Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {type.description}
                                </Typography>
                                {['unified_audit_log', 'full_extraction'].includes(type.value) && (
                                  <Typography variant="caption" color="warning.main" display="block">
                                    ⚠️ Requires Unified Audit Log to be enabled
                                  </Typography>
                                )}
                              </Box>
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}
                  />
                </Grid>

                {/* Date Range */}
                <Grid item xs={12} md={6}>
                  <Controller
                    name="startDate"
                    control={control}
                    render={({ field }) => (
                      <DateTimePicker
                        {...field}
                        label="Start Date"
                        renderInput={(params) => <TextField {...params} fullWidth />}
                      />
                    )}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <Controller
                    name="endDate"
                    control={control}
                    render={({ field }) => (
                      <DateTimePicker
                        {...field}
                        label="End Date"
                        renderInput={(params) => <TextField {...params} fullWidth />}
                      />
                    )}
                  />
                </Grid>

                {/* Priority */}
                <Grid item xs={12} md={6}>
                  <Controller
                    name="priority"
                    control={control}
                    render={({ field }) => (
                      <FormControl fullWidth>
                        <InputLabel>Priority</InputLabel>
                        <Select {...field} label="Priority">
                          <MenuItem value="low">Low</MenuItem>
                          <MenuItem value="medium">Medium</MenuItem>
                          <MenuItem value="high">High</MenuItem>
                          <MenuItem value="critical">Critical</MenuItem>
                        </Select>
                      </FormControl>
                    )}
                  />
                </Grid>

                {/* Advanced Options */}
                <Grid item xs={12}>
                  <Accordion>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography>Advanced Options</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Grid container spacing={2}>
                        <Grid item xs={12}>
                          <Controller
                            name="includeDeleted"
                            control={control}
                            render={({ field }) => (
                              <FormControlLabel
                                control={<Switch {...field} checked={field.value} />}
                                label="Include deleted items"
                              />
                            )}
                          />
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <Controller
                            name="filterUsers"
                            control={control}
                            render={({ field }) => (
                              <TextField
                                {...field}
                                fullWidth
                                label="Filter Users"
                                placeholder="user1@domain.com, user2@domain.com"
                                helperText="Comma-separated list of users to include"
                              />
                            )}
                          />
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <Controller
                            name="filterOperations"
                            control={control}
                            render={({ field }) => (
                              <TextField
                                {...field}
                                fullWidth
                                label="Filter Operations"
                                placeholder="FileAccessed, UserLoggedIn"
                                helperText="Comma-separated list of operations"
                              />
                            )}
                          />
                        </Grid>
                        <Grid item xs={12}>
                          <Controller
                            name="customFilters"
                            control={control}
                            render={({ field }) => (
                              <TextField
                                {...field}
                                fullWidth
                                multiline
                                rows={3}
                                label="Custom Filters (JSON)"
                                placeholder='{"ClientIP": "192.168.1.0/24"}'
                                helperText="Advanced JSON-based filters"
                              />
                            )}
                          />
                        </Grid>
                      </Grid>
                    </AccordionDetails>
                  </Accordion>
                </Grid>
              </Grid>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" variant="contained">Create Extraction</Button>
            </DialogActions>
          </form>
        </Dialog>

        {/* Logs Dialog */}
        {selectedExtraction && (
          <Dialog 
            open={logsDialogOpen} 
            onClose={closeLogsDialog}
            maxWidth="lg" 
            fullWidth
          >
            <DialogTitle>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6">Extraction Logs - Real Time</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip 
                    label={autoRefreshLogs ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
                    color={autoRefreshLogs ? 'success' : 'default'}
                    size="small"
                    onClick={() => setAutoRefreshLogs(!autoRefreshLogs)}
                    sx={{ cursor: 'pointer' }}
                  />
                  <IconButton 
                    size="small" 
                    onClick={() => viewLogs(selectedExtraction.id)}
                    title="Manual Refresh"
                  >
                    <RefreshIcon />
                  </IconButton>
                </Box>
              </Box>
            </DialogTitle>
            <DialogContent>
              <Box 
                sx={{ 
                  bgcolor: '#0d1117', 
                  color: '#c9d1d9',
                  p: 2, 
                  borderRadius: 1, 
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                  maxHeight: '600px',
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                  border: '1px solid #30363d'
                }}
                ref={(el) => {
                  // Auto-scroll to bottom for new logs
                  if (el && autoRefreshLogs) {
                    el.scrollTop = el.scrollHeight;
                  }
                }}
              >
                {selectedExtraction.logs?.length > 0 ? (
                  selectedExtraction.logs.map((log, index) => {
                    let color = '#d4d4d4';
                    let icon = '';
                    let displayMessage = log.message;
                    
                    // Format PowerShell [INFO] messages
                    if (log.message && log.message.includes('[INFO]')) {
                      displayMessage = log.message.replace(/^\[INFO\]\s*/i, '');
                      // Special formatting for specific PowerShell messages
                      if (displayMessage.includes('Total number of events during')) {
                        icon = '📊';
                        color = '#58a6ff';
                      } else if (displayMessage.includes('Using interval')) {
                        icon = '⏱️';
                        color = '#58a6ff';
                      } else if (displayMessage.includes('Found') && displayMessage.includes('audit logs')) {
                        icon = '🔍';
                        color = '#58a6ff';
                      }
                    } else if (log.message && log.message.includes('PowerShell output:')) {
                      displayMessage = log.message.replace(/^PowerShell output:\s*/i, '');
                      icon = '🖥️';
                      color = '#8b949e';
                    } else {
                      switch(log.level) {
                        case 'error':
                          color = '#f85149';
                          icon = '❌';
                          break;
                        case 'warn':
                          color = '#d29922';
                          icon = '⚠️';
                          break;
                        case 'success':
                          color = '#3fb950';
                          icon = '✅';
                          break;
                        case 'info':
                        default:
                          color = '#79c0ff';
                          icon = 'ℹ️';
                          break;
                      }
                    }
                    
                    return (
                      <Box key={index} sx={{ mb: 0.5, p: 0.5, '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' } }}>
                        <span style={{ color: '#7c3aed', fontWeight: 'bold' }}>
                          [{dayjs(log.timestamp).format('YYYY-MM-DD HH:mm:ss')}]
                        </span>
                        {' '}
                        <span style={{ color, fontWeight: 'bold' }}>
                          {icon} [{log.level.toUpperCase()}]
                        </span>
                        {' '}
                        <span style={{ color: '#c9d1d9' }}>
                          {displayMessage}
                        </span>
                      </Box>
                    );
                  })
                ) : (
                  <Box sx={{ textAlign: 'center', py: 4 }}>
                    <Typography sx={{ color: '#7d8590', fontStyle: 'italic', mb: 2 }}>
                      No logs available yet. Logs will appear here once the extraction starts processing.
                    </Typography>
                    <Typography sx={{ color: '#7d8590', fontSize: '0.75rem' }}>
                      🔄 Real-time monitoring is {autoRefreshLogs ? 'enabled' : 'disabled'}
                    </Typography>
                  </Box>
                )}
              </Box>
            </DialogContent>
            <DialogActions>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {selectedExtraction?.logs?.length || 0} log entries
                  {autoRefreshLogs && logRefreshInterval && (
                    <> • Auto-refreshing every 2 seconds</>
                  )}
                </Typography>
                <Button onClick={closeLogsDialog} variant="contained">Close</Button>
              </Box>
            </DialogActions>
          </Dialog>
        )}

        {/* Statistics Dialog */}
        {selectedStats && (
          <Dialog 
            open={statsDialogOpen} 
            onClose={() => setStatsDialogOpen(false)}
            maxWidth="md" 
            fullWidth
          >
            <DialogTitle>
              <Typography variant="h6">Extraction Statistics</Typography>
              <Typography variant="body2" color="text.secondary">
                {extractionTypes.find(t => t.value === selectedStats.type)?.label || selectedStats.type}
              </Typography>
            </DialogTitle>
            <DialogContent>
              <Grid container spacing={3}>
                {/* Main Statistics */}
                <Grid item xs={12} md={6}>
                  <Typography variant="h6" gutterBottom>Data Statistics</Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography>Total Events:</Typography>
                      <Typography fontWeight="bold">
                        {selectedStats.statistics?.totalEvents?.toLocaleString() || 0}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography>Items Extracted:</Typography>
                      <Typography fontWeight="bold">
                        {selectedStats.itemsExtracted?.toLocaleString() || 0}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography>Unique Users:</Typography>
                      <Typography fontWeight="bold">
                        {selectedStats.statistics?.uniqueUsers?.toLocaleString() || 0}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography>Unique Operations:</Typography>
                      <Typography fontWeight="bold">
                        {selectedStats.statistics?.uniqueOperations?.toLocaleString() || 0}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>

                {/* Output Files */}
                <Grid item xs={12} md={6}>
                  <Typography variant="h6" gutterBottom>Output Files</Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography>Total Files:</Typography>
                      <Typography fontWeight="bold">
                        {selectedStats.outputFiles?.length || 0}
                      </Typography>
                    </Box>
                    {selectedStats.outputFiles?.map((file, index) => (
                      <Box key={index} sx={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        bgcolor: 'grey.50',
                        p: 1,
                        borderRadius: 1
                      }}>
                        <Typography variant="body2">{file.filename}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Grid>

                {/* Timing Information */}
                <Grid item xs={12}>
                  <Typography variant="h6" gutterBottom>Timing Information</Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography>Started:</Typography>
                      <Typography>
                        {selectedStats.startedAt ? dayjs(selectedStats.startedAt).format('MMM DD, YYYY HH:mm:ss') : 'N/A'}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography>Completed:</Typography>
                      <Typography>
                        {selectedStats.completedAt ? dayjs(selectedStats.completedAt).format('MMM DD, YYYY HH:mm:ss') : 'N/A'}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography>Duration:</Typography>
                      <Typography fontWeight="bold">
                        {formatDuration(selectedStats.duration)}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
              </Grid>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setStatsDialogOpen(false)}>Close</Button>
            </DialogActions>
          </Dialog>
        )}
      </Box>
    </LocalizationProvider>
  );
};

export default Extractions;