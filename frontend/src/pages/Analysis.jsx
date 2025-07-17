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
  Fab,
  FormControlLabel,
  Switch,
  TextField,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert
} from '@mui/material';
import {
  Add as AddIcon,
  Refresh as RefreshIcon,
  Stop as StopIcon,
  Visibility as ViewIcon,
  Download as DownloadIcon,
  PlayArrow as PlayIcon,
  ExpandMore as ExpandMoreIcon
} from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { useSnackbar } from 'notistack';
import dayjs from 'dayjs';
import axios from '../utils/axios';

const extractionTypes = [
  { value: 'unified_audit_log', label: 'Unified Audit Log' },
  { value: 'azure_signin_logs', label: 'Azure Sign-in Logs (Graph)' },
  { value: 'azure_audit_logs', label: 'Azure Audit Logs (Graph)' },
  { value: 'mfa_status', label: 'MFA Status (Graph)' },
  { value: 'oauth_permissions', label: 'OAuth Permissions' },
  { value: 'risky_users', label: 'Users (Graph)' },
  { value: 'risky_detections', label: 'Risky Detections' },
  { value: 'mailbox_audit', label: 'Mailbox Audit' },
  { value: 'message_trace', label: 'Message Trace' },
  { value: 'devices', label: 'Devices (Graph)' },
  { value: 'ual_graph', label: 'UAL via Graph' },
  { value: 'licenses', label: 'Licenses (Graph)' }
];

const analysisTypes = [
  { value: 'ual_analysis', label: 'UAL Analysis', description: 'Unified Audit Log analysis for suspicious activities' },
  { value: 'signin_analysis', label: 'Sign-in Analysis', description: 'Azure AD sign-in pattern analysis' },
  { value: 'audit_analysis', label: 'Audit Analysis', description: 'Azure AD audit log analysis' },
  { value: 'mfa_analysis', label: 'MFA Analysis', description: 'Multi-factor authentication analysis' },
  { value: 'oauth_analysis', label: 'OAuth Analysis', description: 'OAuth application permission analysis' },
  { value: 'risky_detection_analysis', label: 'Risky Detection Analysis', description: 'Azure AD risky detection analysis' },
  { value: 'risky_user_analysis', label: 'Risky User Analysis', description: 'Risky user behavior analysis' },
  { value: 'message_trace_analysis', label: 'Message Trace Analysis', description: 'Email message flow analysis' },
  { value: 'device_analysis', label: 'Device Analysis', description: 'Device compliance and security analysis' },
  { value: 'comprehensive_analysis', label: 'Comprehensive Analysis', description: 'Full security analysis across all data sources' }
];

const statusColors = {
  pending: 'warning',
  running: 'info',
  completed: 'success',
  failed: 'error',
  cancelled: 'default'
};

const Analysis = () => {
  const [analysisJobs, setAnalysisJobs] = useState([]);
  const [extractions, setExtractions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedAnalysis, setSelectedAnalysis] = useState(null);
  const [results, setResults] = useState(null);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadDataType, setUploadDataType] = useState('unified_audit_log');
  const [uploadMetadata, setUploadMetadata] = useState({});
  const { control, handleSubmit, reset, watch } = useForm({
    defaultValues: {
      extractionId: '',
      type: 'ual_analysis',
      priority: 'medium',
      enableThreatIntel: true,
      enablePatternDetection: true,
      enableAnomalyDetection: false,
      customRules: ''
    }
  });
  const { enqueueSnackbar } = useSnackbar();

  // Helper function to safely render values that might be objects
  const safeRenderValue = (value, fallback = 'N/A') => {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return value.toString();
    if (typeof value === 'boolean') return value.toString();
    try {
      return JSON.stringify(value);
    } catch (error) {
      return fallback;
    }
  };

  const fetchAnalysisJobs = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/analysis');
      setAnalysisJobs(response.data.analysisJobs);
    } catch (error) {
      enqueueSnackbar('Failed to fetch analysis jobs', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const fetchExtractions = async () => {
    try {
      const response = await axios.get('/api/extractions?status=completed');
      setExtractions(response.data.extractions);
    } catch (error) {
      console.error('Failed to fetch extractions:', error);
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchAnalysisJobs();
    fetchExtractions();
    
    // Set up polling for analysis jobs only
    // Extractions don't change as frequently, so we don't need to poll them
    const interval = setInterval(fetchAnalysisJobs, 5000);
    return () => clearInterval(interval);
  }, []);

  const onSubmit = async (data) => {
    try {
      const payload = {
        extractionId: data.extractionId,
        type: data.type,
        priority: data.priority,
        parameters: {
          enableThreatIntel: data.enableThreatIntel,
          enablePatternDetection: data.enablePatternDetection,
          enableAnomalyDetection: data.enableAnomalyDetection,
          customRules: data.customRules ? data.customRules.split('\n').filter(r => r.trim()) : []
        }
      };

      await axios.post('/api/analysis', payload);
      enqueueSnackbar('Analysis job created successfully', { variant: 'success' });
      setDialogOpen(false);
      reset();
      fetchAnalysisJobs();
    } catch (error) {
      enqueueSnackbar(error.response?.data?.error || 'Failed to create analysis job', { variant: 'error' });
    }
  };

  const cancelAnalysis = async (id) => {
    try {
      await axios.post(`/api/analysis/${id}/cancel`);
      enqueueSnackbar('Analysis job cancelled', { variant: 'success' });
      fetchAnalysisJobs();
    } catch (error) {
      enqueueSnackbar('Failed to cancel analysis job', { variant: 'error' });
    }
  };

  const viewResults = async (id) => {
    try {
      const response = await axios.get(`/api/analysis/${id}/results`);
      
      // Safely process the response data to prevent rendering errors
      const processedData = {
        id,
        ...response.data
      };
      
      // Ensure findings array exists and has safe data
      if (processedData.results?.findings) {
        processedData.results.findings = processedData.results.findings.map(finding => ({
          ...finding,
          title: safeRenderValue(finding.title, 'Unknown Finding'),
          description: safeRenderValue(finding.description, 'No description available'),
          severity: finding.severity || 'info'
        }));
      }
      
      // Ensure recommendations array exists and has safe data
      if (processedData.results?.recommendations) {
        processedData.results.recommendations = processedData.results.recommendations.map(rec => 
          safeRenderValue(rec, 'No recommendation details')
        );
      }
      
      setResults(processedData);
    } catch (error) {
      console.error('Error fetching results:', error);
      enqueueSnackbar('Failed to fetch results', { variant: 'error' });
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '-';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}h ${minutes}m ${secs}s`;
  };

  const handleUploadSubmit = async () => {
    if (!uploadFile) {
      enqueueSnackbar('Please select a file to upload', { variant: 'error' });
      return;
    }

    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('dataType', uploadDataType);
    formData.append('metadata', JSON.stringify(uploadMetadata));

    try {
      const response = await axios.post('/api/upload/logs', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      enqueueSnackbar('Logs uploaded successfully', { variant: 'success' });
      setUploadDialogOpen(false);
      setUploadFile(null);
      
      // Refresh extractions to include the uploaded one
      fetchExtractions();
    } catch (error) {
      enqueueSnackbar(error.response?.data?.error || 'Failed to upload logs', { variant: 'error' });
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Security Analysis</Typography>
        <Box>
          <IconButton onClick={fetchAnalysisJobs} disabled={loading}>
            <RefreshIcon />
          </IconButton>
          <Button
            variant="outlined"
            sx={{ ml: 1 }}
            onClick={() => setUploadDialogOpen(true)}
            startIcon={<AddIcon />}
          >
            Upload Logs
          </Button>
          <Fab 
            color="primary" 
            sx={{ ml: 1 }}
            onClick={() => setDialogOpen(true)}
            disabled={extractions.length === 0}
          >
            <AddIcon />
          </Fab>
        </Box>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {extractions.length === 0 && (
        <Alert severity="info" sx={{ mb: 3 }}>
          No completed extractions available. Please complete data extractions first before running analysis.
        </Alert>
      )}

      {/* Statistics Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography variant="h6" color="primary">
                {analysisJobs.length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total Analysis Jobs
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography variant="h6" color="info.main">
                {analysisJobs.filter(a => a.status === 'running').length}
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
                {analysisJobs.filter(a => a.status === 'completed').length}
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
              <Typography variant="h6" color="warning.main">
                {analysisJobs.filter(a => a.status === 'completed').reduce((sum, a) => sum + (a.alerts?.length || 0), 0)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Alerts Generated
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Analysis Jobs Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Analysis Type</TableCell>
              <TableCell>Extraction Source</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Progress</TableCell>
              <TableCell>Findings</TableCell>
              <TableCell>Duration</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {analysisJobs.map((job) => (
              <TableRow key={job.id}>
                <TableCell>
                  <Typography variant="body2" fontWeight="bold">
                    {analysisTypes.find(t => t.value === job.type)?.label || job.type}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Priority: {job.priority}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {job.Extraction?.type || 'Unknown'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {job.Extraction && dayjs(job.Extraction.startDate).format('MMM DD')} - 
                    {job.Extraction && dayjs(job.Extraction.endDate).format('MMM DD')}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip 
                    label={job.status} 
                    color={statusColors[job.status]}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Box sx={{ width: 100 }}>
                    <LinearProgress 
                      variant="determinate" 
                      value={job.progress || 0}
                      sx={{ mb: 0.5 }}
                    />
                    <Typography variant="caption">
                      {job.progress || 0}%
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {job.results?.findings?.length || 0} findings
                  </Typography>
                  {job.alerts?.length > 0 && (
                    <Typography variant="caption" color="warning.main">
                      {job.alerts.length} alerts
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  {formatDuration(job.duration)}
                </TableCell>
                <TableCell>
                  {job.status === 'completed' && (
                    <IconButton 
                      size="small" 
                      onClick={() => viewResults(job.id)}
                      title="View Results"
                    >
                      <ViewIcon />
                    </IconButton>
                  )}
                  {['pending', 'running'].includes(job.status) && (
                    <IconButton 
                      size="small" 
                      onClick={() => cancelAnalysis(job.id)}
                      title="Cancel"
                    >
                      <StopIcon />
                    </IconButton>
                  )}
                  {job.status === 'completed' && job.outputFiles?.length > 0 && (
                    <IconButton 
                      size="small" 
                      title="Download Results"
                    >
                      <DownloadIcon />
                    </IconButton>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {analysisJobs.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  <Typography variant="body2" color="text.secondary">
                    No analysis jobs found. Create your first analysis job to get started.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create Analysis Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogTitle>Create Analysis Job</DialogTitle>
          <DialogContent>
            <Grid container spacing={3} sx={{ mt: 1 }}>
              {/* Source Extraction */}
              <Grid item xs={12}>
                <Controller
                  name="extractionId"
                  control={control}
                  rules={{ required: 'Please select a source extraction' }}
                  render={({ field, fieldState }) => (
                    <FormControl fullWidth error={fieldState.invalid}>
                      <InputLabel>Source Extraction</InputLabel>
                      <Select {...field} label="Source Extraction">
                        {extractions.map((extraction) => (
                          <MenuItem key={extraction.id} value={extraction.id}>
                            <Box>
                              <Typography variant="body1">
                                {extractionTypes.find(t => t.value === extraction.type)?.label || extraction.type}
                                {extraction.isUpload && (
                                  <Chip label="Uploaded" size="small" color="info" sx={{ ml: 1 }} />
                                )}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {dayjs(extraction.startDate).format('MMM DD')} - {dayjs(extraction.endDate).format('MMM DD')}, 
                                {extraction.itemsExtracted?.toLocaleString() || 0} items
                              </Typography>
                            </Box>
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                />
              </Grid>

              {/* Analysis Type */}
              <Grid item xs={12}>
                <Controller
                  name="type"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth>
                      <InputLabel>Analysis Type</InputLabel>
                      <Select {...field} label="Analysis Type">
                        {analysisTypes.map((type) => (
                          <MenuItem key={type.value} value={type.value}>
                            <Box>
                              <Typography variant="body1">{type.label}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {type.description}
                              </Typography>
                            </Box>
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
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

              {/* Analysis Options */}
              <Grid item xs={12}>
                <Accordion>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography>Analysis Options</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Grid container spacing={2}>
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
                        <Controller
                          name="enablePatternDetection"
                          control={control}
                          render={({ field }) => (
                            <FormControlLabel
                              control={<Switch {...field} checked={field.value} />}
                              label="Enable pattern detection algorithms"
                            />
                          )}
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <Controller
                          name="enableAnomalyDetection"
                          control={control}
                          render={({ field }) => (
                            <FormControlLabel
                              control={<Switch {...field} checked={field.value} />}
                              label="Enable machine learning anomaly detection"
                            />
                          )}
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <Controller
                          name="customRules"
                          control={control}
                          render={({ field }) => (
                            <TextField
                              {...field}
                              fullWidth
                              multiline
                              rows={4}
                              label="Custom Detection Rules"
                              placeholder="Enter custom rules (one per line)"
                              helperText="Define custom detection patterns or YARA rules"
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
            <Button type="submit" variant="contained">Start Analysis</Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Results Dialog */}
      {results && (
        <Dialog 
          open={Boolean(results)} 
          onClose={() => setResults(null)}
          maxWidth="lg" 
          fullWidth
        >
          <DialogTitle>Analysis Results</DialogTitle>
          <DialogContent>
            {(() => {
              try {
                return (
                  <Grid container spacing={3}>
                    <Grid item xs={12} md={4}>
                      <Card>
                        <CardContent>
                          <Typography variant="h6" color="primary">
                            {results.results?.findings?.length || 0}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Security Findings
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <Card>
                        <CardContent>
                          <Typography variant="h6" color="warning.main">
                            {results.alerts?.length || 0}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Alerts Generated
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <Card>
                        <CardContent>
                          <Typography variant="h6" color="info.main">
                            {results.results?.statistics?.eventsAnalyzed || 0}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Events Analyzed
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    
                    {/* Summary */}
                    <Grid item xs={12}>
                      <Typography variant="h6" gutterBottom>Summary</Typography>
                      <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
                        <Typography variant="body2">
                          {safeRenderValue(results.results?.summary?.description, 'Analysis completed successfully with no immediate threats detected.')}
                        </Typography>
                      </Paper>
                    </Grid>

                    {/* Findings */}
                    {results.results?.findings?.length > 0 && (
                      <Grid item xs={12}>
                        <Typography variant="h6" gutterBottom>Key Findings</Typography>
                        {results.results.findings.map((finding, index) => (
                          <Alert key={index} severity={finding.severity || 'info'} sx={{ mb: 1 }}>
                            <Typography variant="body2" fontWeight="bold">
                              {safeRenderValue(finding.title, 'Unknown Finding')}
                            </Typography>
                            <Typography variant="body2">
                              {safeRenderValue(finding.description, 'No description available')}
                            </Typography>
                            {finding.affectedEntities && (
                              <Box sx={{ mt: 1 }}>
                                <Typography variant="caption" color="text.secondary">
                                  Affected: {finding.affectedEntities.users?.length || 0} users, {finding.affectedEntities.resources?.length || 0} resources
                                </Typography>
                              </Box>
                            )}
                            {finding.mitreAttack && (
                              <Box sx={{ mt: 1 }}>
                                <Typography variant="caption" color="text.secondary">
                                  MITRE ATT&CK: {Array.isArray(finding.mitreAttack.tactics) ? finding.mitreAttack.tactics.join(', ') : safeRenderValue(finding.mitreAttack.tactics, 'Unknown')}
                                </Typography>
                              </Box>
                            )}
                          </Alert>
                        ))}
                      </Grid>
                    )}

                    {/* Recommendations */}
                    {results.results?.recommendations?.length > 0 && (
                      <Grid item xs={12}>
                        <Typography variant="h6" gutterBottom>Recommendations</Typography>
                        <ul>
                          {results.results.recommendations.map((rec, index) => (
                            <li key={index}>
                              <Typography variant="body2">
                                {safeRenderValue(rec, 'No recommendation details')}
                              </Typography>
                            </li>
                          ))}
                        </ul>
                      </Grid>
                    )}
                  </Grid>
                );
              } catch (error) {
                console.error('Error rendering results:', error);
                return (
                  <Alert severity="error" sx={{ mt: 2 }}>
                    <Typography variant="body2">
                      Error displaying analysis results. Please try again or contact support.
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Error: {error.message}
                    </Typography>
                  </Alert>
                );
              }
            })()}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setResults(null)}>Close</Button>
            <Button variant="contained" startIcon={<DownloadIcon />}>
              Download Report
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Upload Logs Dialog */}
      <Dialog open={uploadDialogOpen} onClose={() => setUploadDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Upload Pre-extracted Logs</DialogTitle>
        <DialogContent>
          <Grid container spacing={3} sx={{ mt: 1 }}>
            {/* Data Type Selection */}
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Data Type</InputLabel>
                <Select
                  value={uploadDataType}
                  onChange={(e) => setUploadDataType(e.target.value)}
                  label="Data Type"
                >
                  {extractionTypes.map((type) => (
                    <MenuItem key={type.value} value={type.value}>
                      {type.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {/* File Upload */}
            <Grid item xs={12}>
              <Button
                variant="outlined"
                component="label"
                fullWidth
                sx={{ py: 2 }}
              >
                {uploadFile ? uploadFile.name : 'Select File (JSON, CSV, TXT, LOG)'}
                <input
                  type="file"
                  hidden
                  accept=".json,.csv,.txt,.log"
                  onChange={(e) => setUploadFile(e.target.files[0])}
                />
              </Button>
            </Grid>

            {/* Optional Metadata */}
            <Grid item xs={12}>
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>Optional Metadata</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <TextField
                        fullWidth
                        label="Start Date"
                        type="datetime-local"
                        InputLabelProps={{ shrink: true }}
                        onChange={(e) => setUploadMetadata({
                          ...uploadMetadata,
                          startDate: new Date(e.target.value).toISOString()
                        })}
                      />
                    </Grid>
                    <Grid item xs={12} md={6}>
                      <TextField
                        fullWidth
                        label="End Date"
                        type="datetime-local"
                        InputLabelProps={{ shrink: true }}
                        onChange={(e) => setUploadMetadata({
                          ...uploadMetadata,
                          endDate: new Date(e.target.value).toISOString()
                        })}
                      />
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>
            </Grid>

            {/* Info Alert */}
            <Grid item xs={12}>
              <Alert severity="info">
                Upload pre-extracted logs from Microsoft 365 or Azure AD. Once uploaded, you can run security analysis on the data without needing to connect to Microsoft services.
              </Alert>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setUploadDialogOpen(false);
            setUploadFile(null);
          }}>
            Cancel
          </Button>
          <Button 
            variant="contained" 
            onClick={handleUploadSubmit}
            disabled={!uploadFile}
          >
            Upload & Continue
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Analysis;