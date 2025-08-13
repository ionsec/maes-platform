import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Grid,
  Typography,
  Alert,
  LinearProgress,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  CircularProgress,
  IconButton,
  Tooltip,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  ListItemIcon,
  Tabs,
  Tab,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import {
  Assessment as AssessmentIcon,
  Security as SecurityIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  PlayArrow as PlayArrowIcon,
  Refresh as RefreshIcon,
  Compare as CompareIcon,
  Timeline as TimelineIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Warning as WarningIcon,
  RemoveCircleOutline as RemoveCircleOutlineIcon,
  Error as ErrorIcon,
  Download as DownloadIcon,
  Description as DescriptionIcon,
  PictureAsPdf as PdfIcon,
  Help as HelpIcon,
  ExpandMore as ExpandMoreIcon,
  GetApp as GetAppIcon,
  Schedule as ScheduleIcon,
  HelpOutline as HelpOutlineIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { useAuth } from '../contexts/AuthContext';
import { useOrganization } from '../contexts/OrganizationContext';
import axios from '../utils/axios';

const Compliance = () => {
  const { user } = useAuth();
  const { selectedOrganizationId, organizations } = useOrganization();
  const { enqueueSnackbar } = useSnackbar();

  // State
  const [loading, setLoading] = useState(true);
  const [assessments, setAssessments] = useState([]);
  const [controls, setControls] = useState([]);
  const [controlsBySection, setControlsBySection] = useState({});
  const [startAssessmentDialog, setStartAssessmentDialog] = useState(false);
  const [assessmentDetails, setAssessmentDetails] = useState(null);
  const [detailsDialog, setDetailsDialog] = useState(false);
  const [loadingAssessment, setLoadingAssessment] = useState(false);
  const [selectedAssessmentType, setSelectedAssessmentType] = useState('cis_v400');
  const [hasCredentials, setHasCredentials] = useState(false);
  const [credentialsStatus, setCredentialsStatus] = useState(null);
  const [reportDialog, setReportDialog] = useState(false);
  const [selectedAssessmentForReport, setSelectedAssessmentForReport] = useState(null);
  const [reportFormat, setReportFormat] = useState('html');
  const [reportType, setReportType] = useState('full');
  const [generatingReport, setGeneratingReport] = useState(false);
  const [availableReports, setAvailableReports] = useState([]);
  
  // Fetch compliance data
  useEffect(() => {
    if (selectedOrganizationId) {
      fetchComplianceData();
    }
  }, [selectedOrganizationId]);

  const fetchComplianceData = async () => {
    try {
      setLoading(true);
      
      // Fetch assessments, controls, and credentials status in parallel
      const [assessmentsResponse, controlsResponse, credentialsResponse] = await Promise.all([
        axios.get(`/api/compliance/assessments/${selectedOrganizationId}?limit=10`),
        axios.get('/api/compliance/controls/cis_v400'),
        axios.get(`/api/compliance/organization/${selectedOrganizationId}/credentials-status`)
      ]);

      if (assessmentsResponse.data.success) {
        setAssessments(assessmentsResponse.data.assessments);
      }

      if (controlsResponse.data.success) {
        setControls(controlsResponse.data.controls);
        setControlsBySection(controlsResponse.data.controlsBySection);
      }

      if (credentialsResponse.data.success) {
        setHasCredentials(credentialsResponse.data.hasCredentials);
        setCredentialsStatus(credentialsResponse.data);
      }

    } catch (error) {
      console.error('Error fetching compliance data:', error);
      enqueueSnackbar('Failed to load compliance data', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleStartAssessment = async (formData) => {
    try {
      setLoadingAssessment(true);
      
      const response = await axios.post(`/api/compliance/assess/${selectedOrganizationId}`, {
        assessmentType: formData.assessmentType || 'cis_v400',
        name: formData.name,
        description: formData.description,
        isBaseline: formData.isBaseline || false
      });

      if (response.data.success) {
        enqueueSnackbar('Compliance assessment started successfully', { variant: 'success' });
        setStartAssessmentDialog(false);
        
        // Refresh assessments
        setTimeout(() => {
          fetchComplianceData();
        }, 1000);
      }

    } catch (error) {
      console.error('Error starting assessment:', error);
      
      let errorMessage = 'Failed to start compliance assessment';
      
      if (error.response?.data?.details) {
        errorMessage = error.response.data.details;
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      }
      
      enqueueSnackbar(errorMessage, { variant: 'error' });
    } finally {
      setLoadingAssessment(false);
    }
  };

  const handleViewDetails = async (assessmentId) => {
    try {
      const response = await axios.get(`/api/compliance/assessment/${assessmentId}?includeResults=true`);
      if (response.data.success) {
        setAssessmentDetails({
          ...response.data.assessment,
          results: response.data.results,
          resultsBySection: response.data.resultsBySection
        });
        setDetailsDialog(true);
      }
    } catch (error) {
      console.error('Error fetching assessment details:', error);
      enqueueSnackbar('Failed to load assessment details', { variant: 'error' });
    }
  };

  const handleGenerateReport = async () => {
    if (!selectedAssessmentForReport) return;
    
    try {
      setGeneratingReport(true);
      
      const response = await axios.post(
        `/api/compliance/assessments/${selectedAssessmentForReport.id}/report`,
        {
          format: reportFormat,
          type: reportType,
          options: {
            includeRemediation: true,
            includeExecutiveSummary: reportType === 'executive',
            includeFailingEntities: true
          }
        }
      );

      if (response.data.success) {
        enqueueSnackbar(`Report generated successfully`, { variant: 'success' });
        
        // Fetch available reports
        await fetchAvailableReports(selectedAssessmentForReport.id);
        
        // If HTML, offer to preview
        if (reportFormat === 'html') {
          const downloadUrl = `/api/compliance/assessments/${selectedAssessmentForReport.id}/report/${response.data.report.fileName}/download`;
          window.open(downloadUrl, '_blank');
        }
      }

    } catch (error) {
      console.error('Error generating report:', error);
      enqueueSnackbar(
        error.response?.data?.error || 'Failed to generate report',
        { variant: 'error' }
      );
    } finally {
      setGeneratingReport(false);
    }
  };

  const fetchAvailableReports = async (assessmentId) => {
    try {
      const response = await axios.get(
        `/api/compliance/assessments/${assessmentId}/reports`
      );
      
      if (response.data.success) {
        setAvailableReports(response.data.reports || []);
      }
    } catch (error) {
      console.error('Error fetching reports:', error);
    }
  };

  const handleDownloadReport = (assessmentId, fileName) => {
    const downloadUrl = `/api/compliance/assessments/${assessmentId}/report/${fileName}/download`;
    window.open(downloadUrl, '_blank');
  };

  const openReportDialog = async (assessment) => {
    setSelectedAssessmentForReport(assessment);
    setReportDialog(true);
    await fetchAvailableReports(assessment.id);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'success';
      case 'running': return 'info';
      case 'pending': return 'warning';
      case 'failed': return 'error';
      default: return 'default';
    }
  };

  const getComplianceColor = (score) => {
    if (score >= 90) return 'success';
    if (score >= 70) return 'warning';
    return 'error';
  };

  const formatDuration = (seconds) => {
    if (!seconds) return 'N/A';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <CircularProgress />
      </Box>
    );
  }

  const latestAssessment = assessments.length > 0 ? assessments[0] : null;
  const currentOrganization = organizations.find(org => org.organization_id === selectedOrganizationId);

  return (
    <>
    <Box sx={{ flexGrow: 1 }}>
      <Typography variant="h4" sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
        <SecurityIcon color="primary" />
        Compliance Assessment
      </Typography>

      {/* Overview Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <AssessmentIcon color="primary" sx={{ fontSize: 40 }} />
                <Box>
                  <Typography variant="h6">{assessments.length}</Typography>
                  <Typography color="textSecondary">Total Assessments</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <CheckCircleIcon color="success" sx={{ fontSize: 40 }} />
                <Box>
                  <Typography variant="h6">
                    {latestAssessment ? `${latestAssessment.compliance_score || 0}%` : 'N/A'}
                  </Typography>
                  <Typography color="textSecondary">Latest Score</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <SecurityIcon color={controls.length > 0 ? 'success' : 'warning'} sx={{ fontSize: 40 }} />
                <Box>
                  <Typography variant="h6">{controls.length}</Typography>
                  <Typography color="textSecondary">Available Controls</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <TimelineIcon color="primary" sx={{ fontSize: 40 }} />
                <Box>
                  <Typography variant="h6">CIS v4.0.0</Typography>
                  <Typography color="textSecondary">Benchmark</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Credentials Warning */}
      {!hasCredentials && credentialsStatus && (
        <Alert severity="warning" sx={{ mt: 2, mb: 2 }}>
          <Typography variant="body1" sx={{ fontWeight: 'bold', mb: 1 }}>
            Microsoft 365 Credentials Not Configured
          </Typography>
          <Typography variant="body2">
            {credentialsStatus.message}
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            Please configure Azure AD app credentials (Client ID, Tenant ID) in the organization settings to enable compliance assessments.
          </Typography>
        </Alert>
      )}

      {/* Action Buttons */}
      <Box sx={{ mb: 3, display: 'flex', gap: 2, alignItems: 'center' }}>
        <Tooltip 
          title={
            selectedOrganizationId === '00000000-0000-0000-0000-000000000001' 
              ? "Configure organization credentials first or create a new organization"
              : !selectedOrganizationId 
              ? "Select an organization"
              : user?.role !== 'admin'
              ? "Admin access required"
              : "Start compliance assessment"
          }
        >
          <span>
            <Button
              variant="contained"
              startIcon={<PlayArrowIcon />}
              onClick={() => setStartAssessmentDialog(true)}
              disabled={
                !selectedOrganizationId || 
                user?.role !== 'admin' || 
                selectedOrganizationId === '00000000-0000-0000-0000-000000000001' ||
                !hasCredentials
              }
            >
              Start Assessment
            </Button>
          </span>
        </Tooltip>
        
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={fetchComplianceData}
        >
          Refresh
        </Button>

        {assessments.length > 1 && (
          <Button
            variant="outlined"
            startIcon={<CompareIcon />}
            disabled // Will implement comparison later
          >
            Compare Assessments
          </Button>
        )}
      </Box>

      {/* Organization Info */}
      {currentOrganization && (
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="body2">
            <strong>Organization:</strong> {currentOrganization.organization_name} 
            ({currentOrganization.organization_fqdn})
          </Typography>
        </Alert>
      )}

      {/* Credentials Warning for Default Organization */}
      {selectedOrganizationId === '00000000-0000-0000-0000-000000000001' && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography variant="body2">
            <strong>Configuration Required:</strong> This is the default MAES organization. 
            To run compliance assessments, you need to either:
          </Typography>
          <ul style={{ marginTop: 8, marginBottom: 0 }}>
            <li>Create a new organization with proper Microsoft 365 credentials, or</li>
            <li>Configure Azure AD app credentials for this organization in Settings</li>
          </ul>
          <Typography variant="body2" sx={{ mt: 1 }}>
            Required: Client ID, Client Secret, and Tenant ID from your Azure AD app registration.
          </Typography>
        </Alert>
      )}

      {/* Recent Assessments */}
      <Card sx={{ mb: 3 }}>
        <CardHeader 
          title="Recent Assessments"
          action={
            <Tooltip title="Assessment history for this organization">
              <IconButton>
                <HelpOutlineIcon />
              </IconButton>
            </Tooltip>
          }
        />
        <CardContent>
          {assessments.length === 0 ? (
            <Alert severity="info">
              No compliance assessments found. Start your first assessment to begin monitoring compliance.
            </Alert>
          ) : (
            <List>
              {assessments.slice(0, 5).map((assessment) => (
                <ListItem
                  key={assessment.id}
                  divider
                  sx={{ cursor: 'pointer' }}
                  onClick={() => handleViewDetails(assessment.id)}
                >
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="subtitle1">{assessment.name}</Typography>
                        <Chip 
                          label={assessment.status} 
                          size="small" 
                          color={getStatusColor(assessment.status)}
                        />
                        <Chip 
                          label={assessment.assessment_type.toUpperCase()} 
                          size="small" 
                          variant="outlined"
                        />
                      </Box>
                    }
                    secondary={
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="body2" color="textSecondary">
                          Created: {new Date(assessment.created_at).toLocaleDateString()} |
                          Duration: {formatDuration(assessment.duration)} |
                          Triggered by: {assessment.triggered_by_username || 'System'}
                        </Typography>
                        
                        {assessment.status === 'running' && (
                          <Box sx={{ mt: 1 }}>
                            <LinearProgress 
                              variant="determinate" 
                              value={assessment.progress || 0} 
                              sx={{ height: 6, borderRadius: 3 }}
                            />
                            <Typography variant="caption" color="textSecondary">
                              {assessment.progress || 0}% complete
                            </Typography>
                          </Box>
                        )}

                        {assessment.status === 'completed' && (
                          <Box sx={{ mt: 1, display: 'flex', gap: 2 }}>
                            <Chip 
                              label={`Score: ${assessment.compliance_score}%`}
                              size="small"
                              color={getComplianceColor(assessment.compliance_score)}
                              variant="outlined"
                            />
                            <Chip 
                              label={`${assessment.compliant_controls}/${assessment.total_controls} Compliant`}
                              size="small"
                              color="default"
                              variant="outlined"
                            />
                          </Box>
                        )}
                      </Box>
                    }
                  />
                  <ListItemSecondaryAction>
                    <Tooltip title="View Details">
                      <IconButton onClick={() => handleViewDetails(assessment.id)}>
                        <AssessmentIcon />
                      </IconButton>
                    </Tooltip>
                    {assessment.status === 'completed' && (
                      <Tooltip title="Generate Report">
                        <IconButton onClick={() => openReportDialog(assessment)}>
                          <DescriptionIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          )}
        </CardContent>
      </Card>

      {/* Available Controls Summary */}
      <Card>
        <CardHeader title="Available Compliance Controls" />
        <CardContent>
          {Object.keys(controlsBySection).length === 0 ? (
            <Alert severity="warning">
              No compliance controls loaded. Please check the service configuration.
            </Alert>
          ) : (
            <Grid container spacing={2}>
              {Object.entries(controlsBySection).map(([section, sectionControls]) => (
                <Grid item xs={12} md={6} key={section}>
                  <Paper sx={{ p: 2 }}>
                    <Typography variant="h6" gutterBottom>{section}</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Typography variant="body2" color="textSecondary">
                        {sectionControls.length} controls
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Chip 
                          label={`Level 1: ${sectionControls.filter(c => c.severity === 'level1').length}`}
                          size="small"
                          color="primary"
                          variant="outlined"
                        />
                        <Chip 
                          label={`Level 2: ${sectionControls.filter(c => c.severity === 'level2').length}`}
                          size="small"
                          color="secondary"
                          variant="outlined"
                        />
                      </Box>
                    </Box>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          )}
        </CardContent>
      </Card>

      {/* Start Assessment Dialog */}
      <StartAssessmentDialog
        open={startAssessmentDialog}
        onClose={() => setStartAssessmentDialog(false)}
        onSubmit={handleStartAssessment}
        loading={loadingAssessment}
        hasCredentials={hasCredentials}
      />

      {/* Assessment Details Dialog */}
      <AssessmentDetailsDialog
        open={detailsDialog}
        onClose={() => setDetailsDialog(false)}
        assessment={assessmentDetails}
      />
    </Box>

    {/* Report Generation Dialog */}
    <Dialog 
      open={reportDialog} 
      onClose={() => setReportDialog(false)}
      maxWidth="md" 
      fullWidth
    >
      <DialogTitle>
        Generate Compliance Report
        {selectedAssessmentForReport && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Assessment: {selectedAssessmentForReport.name} ({selectedAssessmentForReport.id.slice(0, 8)}...)
          </Typography>
        )}
      </DialogTitle>
      <DialogContent>
        <Grid container spacing={3} sx={{ mt: 0 }}>
          {/* Report Format */}
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Report Format</InputLabel>
              <Select
                value={reportFormat}
                onChange={(e) => setReportFormat(e.target.value)}
                label="Report Format"
              >
                <MenuItem value="html">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <DescriptionIcon fontSize="small" />
                    HTML (Web View)
                  </Box>
                </MenuItem>
                <MenuItem value="pdf">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <PdfIcon fontSize="small" />
                    PDF (Print Ready)
                  </Box>
                </MenuItem>
                <MenuItem value="json">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <DescriptionIcon fontSize="small" />
                    JSON (Machine Readable)
                  </Box>
                </MenuItem>
                <MenuItem value="csv">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <DescriptionIcon fontSize="small" />
                    CSV (Spreadsheet)
                  </Box>
                </MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* Report Type */}
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Report Type</InputLabel>
              <Select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                label="Report Type"
              >
                <MenuItem value="full">Full Report (All Details)</MenuItem>
                <MenuItem value="executive">Executive Summary</MenuItem>
                <MenuItem value="remediation">Remediation Focus</MenuItem>
                <MenuItem value="comparison" disabled>Comparison Report</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* Report Description */}
          <Grid item xs={12}>
            <Alert severity="info">
              {reportType === 'full' && 
                'Comprehensive report including all control results, remediation guidance, and detailed findings.'
              }
              {reportType === 'executive' && 
                'High-level summary suitable for management with key metrics and critical findings.'
              }
              {reportType === 'remediation' && 
                'Focused report on non-compliant controls with detailed remediation steps.'
              }
            </Alert>
          </Grid>

          {/* Available Reports */}
          {availableReports.length > 0 && (
            <Grid item xs={12}>
              <Typography variant="subtitle2" gutterBottom>
                Previously Generated Reports
              </Typography>
              <List dense>
                {availableReports.map((report, index) => (
                  <ListItem key={index}>
                    <ListItemIcon>
                      {report.format === 'pdf' ? <PdfIcon /> : <DescriptionIcon />}
                    </ListItemIcon>
                    <ListItemText
                      primary={report.file_name}
                      secondary={`${report.format.toUpperCase()} • ${report.type} • ${new Date(report.created_at).toLocaleString()}`}
                    />
                    <ListItemSecondaryAction>
                      <IconButton 
                        edge="end" 
                        onClick={() => handleDownloadReport(selectedAssessmentForReport.id, report.file_name)}
                      >
                        <DownloadIcon />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
            </Grid>
          )}
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setReportDialog(false)}>
          Cancel
        </Button>
        <Button 
          onClick={handleGenerateReport}
          variant="contained"
          disabled={generatingReport}
          startIcon={generatingReport ? <CircularProgress size={20} /> : <DescriptionIcon />}
        >
          {generatingReport ? 'Generating...' : 'Generate Report'}
        </Button>
      </DialogActions>
    </Dialog>
    </>
  );
};

// Start Assessment Dialog Component
const StartAssessmentDialog = ({ open, onClose, onSubmit, loading, hasCredentials }) => {
  const [formData, setFormData] = useState({
    assessmentType: 'cis_v400',
    name: '',
    description: '',
    isBaseline: false
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleClose = () => {
    setFormData({
      assessmentType: 'cis_v400',
      name: '',
      description: '',
      isBaseline: false
    });
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>Start Compliance Assessment</DialogTitle>
        <DialogContent>
          {!hasCredentials ? (
            <Alert severity="error" sx={{ mb: 3 }}>
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                Microsoft 365 credentials are not configured for this organization.
              </Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>
                Please configure Azure AD app credentials in the organization settings before running compliance assessments.
              </Typography>
            </Alert>
          ) : (
            <Alert severity="info" sx={{ mb: 3 }}>
              This will run a comprehensive compliance assessment against your Microsoft 365 environment.
              The process may take several minutes to complete.
            </Alert>
          )}

          <FormControl fullWidth sx={{ mb: 3 }}>
            <InputLabel>Assessment Type</InputLabel>
            <Select
              value={formData.assessmentType}
              label="Assessment Type"
              onChange={(e) => setFormData({ ...formData, assessmentType: e.target.value })}
            >
              <MenuItem value="cis_v400">CIS Microsoft 365 v4.0.0</MenuItem>
              <MenuItem value="cis_v300" disabled>CIS Microsoft 365 v3.0.0</MenuItem>
              <MenuItem value="custom" disabled>Custom Assessment</MenuItem>
            </Select>
          </FormControl>

          <TextField
            fullWidth
            label="Assessment Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            sx={{ mb: 3 }}
            placeholder="e.g., Q4 2024 Compliance Review"
          />

          <TextField
            fullWidth
            multiline
            rows={3}
            label="Description (Optional)"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Additional context for this assessment..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button 
            type="submit" 
            variant="contained"
            disabled={loading}
            startIcon={loading ? <CircularProgress size={16} /> : <PlayArrowIcon />}
          >
            {loading ? 'Starting...' : 'Start Assessment'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

// Assessment Details Dialog Component
const AssessmentDetailsDialog = ({ open, onClose, assessment }) => {
  const [selectedTab, setSelectedTab] = useState(0);
  
  if (!assessment) return null;

  const getStatusIcon = (status) => {
    switch (status) {
      case 'compliant':
        return <CheckCircleIcon color="success" />;
      case 'non_compliant':
        return <CancelIcon color="error" />;
      case 'manual_review':
        return <WarningIcon color="warning" />;
      case 'not_applicable':
        return <RemoveCircleOutlineIcon color="disabled" />;
      case 'error':
        return <ErrorIcon color="error" />;
      default:
        return <HelpIcon />;
    }
  };

  const getStatusLabel = (status) => {
    return status.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">{assessment.name || 'Assessment Details'}</Typography>
          {assessment.status === 'completed' && (
            <Chip
              icon={<AssessmentIcon />}
              label={`Score: ${assessment.compliance_score}%`}
              color={assessment.compliance_score >= 80 ? 'success' : assessment.compliance_score >= 60 ? 'warning' : 'error'}
            />
          )}
        </Box>
      </DialogTitle>
      <DialogContent>
        <Tabs value={selectedTab} onChange={(e, newValue) => setSelectedTab(newValue)} sx={{ mb: 3 }}>
          <Tab label="Overview" />
          <Tab label="Tenant Info" disabled={!assessment.metadata?.tenantInfo} />
          <Tab label="Control Results" disabled={!assessment.results} />
          <Tab label="Failing Entities" disabled={!assessment.results} />
          <Tab label="Remediation" disabled={!assessment.results} />
        </Tabs>

        {/* Overview Tab */}
        {selectedTab === 0 && (
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>General Information</Typography>
              <List dense>
                <ListItem>
                  <ListItemText 
                    primary="Status" 
                    secondary={
                      <Chip 
                        label={assessment.status} 
                        size="small" 
                        color={
                          assessment.status === 'completed' ? 'success' : 
                          assessment.status === 'running' ? 'info' : 
                          assessment.status === 'failed' ? 'error' : 'warning'
                        }
                      />
                    }
                  />
                </ListItem>
                <ListItem>
                  <ListItemText primary="Type" secondary={assessment.assessment_type.toUpperCase()} />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Created" 
                    secondary={new Date(assessment.created_at).toLocaleString()} 
                  />
                </ListItem>
                {assessment.completed_at && (
                  <ListItem>
                    <ListItemText 
                      primary="Completed" 
                      secondary={new Date(assessment.completed_at).toLocaleString()} 
                    />
                  </ListItem>
                )}
                {assessment.duration && (
                  <ListItem>
                    <ListItemText 
                      primary="Duration" 
                      secondary={`${Math.floor(assessment.duration / 60)} minutes ${assessment.duration % 60} seconds`}
                    />
                  </ListItem>
                )}
              </List>
            </Grid>

            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>Results Summary</Typography>
              {assessment.status === 'completed' ? (
                <>
                  <Box sx={{ mb: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
                        Overall Compliance
                      </Typography>
                      <Typography variant="h4">
                        {assessment.compliance_score}%
                      </Typography>
                    </Box>
                    <LinearProgress 
                      variant="determinate" 
                      value={assessment.compliance_score} 
                      sx={{ height: 10, borderRadius: 5 }}
                      color={assessment.compliance_score >= 80 ? 'success' : assessment.compliance_score >= 60 ? 'warning' : 'error'}
                    />
                  </Box>
                  
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Paper elevation={0} sx={{ p: 2, bgcolor: 'success.light', color: 'success.dark' }}>
                        <Typography variant="h4">{assessment.compliant_controls}</Typography>
                        <Typography variant="body2">Compliant</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6}>
                      <Paper elevation={0} sx={{ p: 2, bgcolor: 'error.light', color: 'error.dark' }}>
                        <Typography variant="h4">{assessment.non_compliant_controls}</Typography>
                        <Typography variant="body2">Non-Compliant</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6}>
                      <Paper elevation={0} sx={{ p: 2, bgcolor: 'warning.light', color: 'warning.dark' }}>
                        <Typography variant="h4">{assessment.manual_review_controls}</Typography>
                        <Typography variant="body2">Manual Review</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6}>
                      <Paper elevation={0} sx={{ p: 2, bgcolor: 'grey.200', color: 'text.secondary' }}>
                        <Typography variant="h4">{assessment.not_applicable_controls || 0}</Typography>
                        <Typography variant="body2">Not Applicable</Typography>
                      </Paper>
                    </Grid>
                  </Grid>
                </>
              ) : (
                <Alert severity="info">
                  Assessment results will be available once the assessment is completed.
                </Alert>
              )}
            </Grid>

            {assessment.description && (
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>Description</Typography>
                <Typography variant="body2">{assessment.description}</Typography>
              </Grid>
            )}
          </Grid>
        )}

        {/* Tenant Info Tab */}
        {selectedTab === 1 && assessment.metadata?.tenantInfo && (
          <Grid container spacing={3}>
            {/* Main Technical Characteristics */}
            <Grid item xs={12}>
              <Card>
                <CardHeader title="Main Technical Characteristics" />
                <CardContent>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={3}>
                      <Typography variant="subtitle2" gutterBottom>Tenant Name</Typography>
                      <Typography variant="body1">{assessment.metadata.tenantInfo.displayName || 'N/A'}</Typography>
                    </Grid>
                    <Grid item xs={12} md={3}>
                      <Typography variant="subtitle2" gutterBottom>Tenant ID</Typography>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                        {assessment.metadata.tenantInfo.id || 'N/A'}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} md={3}>
                      <Typography variant="subtitle2" gutterBottom>Creation Date</Typography>
                      <Typography variant="body1">
                        {assessment.metadata.tenantInfo.createdDateTime ? 
                          new Date(assessment.metadata.tenantInfo.createdDateTime).toLocaleString() : 'N/A'}
                      </Typography>
                    </Grid>
                    <Grid item xs={12} md={3}>
                      <Typography variant="subtitle2" gutterBottom>Region</Typography>
                      <Typography variant="body1">{assessment.metadata.tenantInfo.region || assessment.metadata.tenantInfo.country || 'N/A'}</Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>

            {/* Synchronization Information */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardHeader title="Synchronization Information" />
                <CardContent>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Paper sx={{ p: 2, textAlign: 'center', bgcolor: assessment.metadata.tenantInfo.synchronization?.isHybrid ? 'warning.light' : 'success.light' }}>
                        <Typography variant="h6" color={assessment.metadata.tenantInfo.synchronization?.isHybrid ? 'warning.dark' : 'success.dark'}>
                          {assessment.metadata.tenantInfo.synchronization?.isHybrid ? 'Hybrid' : 'Cloud-Only'}
                        </Typography>
                        <Typography variant="body2">Environment</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6}>
                      <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'info.light' }}>
                        <Typography variant="h6" color="info.dark">
                          {assessment.metadata.tenantInfo.userAnalysis?.syncedUsers || 0}
                        </Typography>
                        <Typography variant="body2">Synced Users</Typography>
                      </Paper>
                    </Grid>
                  </Grid>
                  <Typography variant="body2" sx={{ mt: 2 }}>
                    Sync Status: {assessment.metadata.tenantInfo.synchronization?.syncEnabled ? 'Enabled' : 'Disabled'}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* DNS Domains */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardHeader title="DNS Domains" />
                <CardContent>
                  <Typography variant="body2" gutterBottom>
                    Total Domains: {assessment.metadata.tenantInfo.dnsDomainsCount || 0} 
                    ({assessment.metadata.tenantInfo.customDomains || 0} custom)
                  </Typography>
                  <List dense>
                    {assessment.metadata.tenantInfo.verifiedDomains?.slice(0, 5).map((domain, index) => (
                      <ListItem key={index}>
                        <ListItemText
                          primary={domain.name}
                          secondary={
                            <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                              {domain.isDefault && <Chip label="Primary" size="small" color="primary" />}
                              {domain.isInitial && <Chip label="Initial" size="small" color="secondary" />}
                              <Chip label={domain.type || 'Managed'} size="small" variant="outlined" />
                            </Box>
                          }
                        />
                      </ListItem>
                    ))}
                    {(assessment.metadata.tenantInfo.verifiedDomains?.length || 0) > 5 && (
                      <ListItem>
                        <ListItemText secondary={`... and ${assessment.metadata.tenantInfo.verifiedDomains.length - 5} more domains`} />
                      </ListItem>
                    )}
                  </List>
                </CardContent>
              </Card>
            </Grid>

            {/* External Tenants */}
            <Grid item xs={12}>
              <Card>
                <CardHeader title="External Tenants" />
                <CardContent>
                  {assessment.metadata.tenantInfo.externalTenantsCount > 0 ? (
                    <Box>
                      <Typography variant="body2" gutterBottom>
                        {assessment.metadata.tenantInfo.externalTenantsCount} external tenant connections configured
                      </Typography>
                      <List dense>
                        {assessment.metadata.tenantInfo.externalTenants?.slice(0, 3).map((tenant, index) => (
                          <ListItem key={index}>
                            <ListItemText
                              primary={tenant.name || 'Unknown Tenant'}
                              secondary={
                                <Box>
                                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8em' }}>
                                    {tenant.tenantId}
                                  </Typography>
                                  <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                                    {tenant.isInbound && <Chip label="Inbound Trust" size="small" color="success" />}
                                    {tenant.isOutbound && <Chip label="Outbound Trust" size="small" color="info" />}
                                  </Box>
                                </Box>
                              }
                            />
                          </ListItem>
                        ))}
                      </List>
                    </Box>
                  ) : (
                    <Alert severity="info">No external tenant connections configured</Alert>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Account Analysis */}
            <Grid item xs={12}>
              <Card>
                <CardHeader title="Account Analysis" />
                <CardContent>
                  <Grid container spacing={2}>
                    <Grid item xs={6} md={2}>
                      <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'primary.light' }}>
                        <Typography variant="h4" color="primary.dark">
                          {assessment.metadata.tenantInfo.userAnalysis?.totalUsers || 0}
                        </Typography>
                        <Typography variant="body2">Total Users</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6} md={2}>
                      <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'warning.light' }}>
                        <Typography variant="h4" color="warning.dark">
                          {assessment.metadata.tenantInfo.userAnalysis?.guestUsers || 0}
                        </Typography>
                        <Typography variant="body2">Guest Users</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6} md={2}>
                      <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'success.light' }}>
                        <Typography variant="h4" color="success.dark">
                          {assessment.metadata.tenantInfo.userAnalysis?.memberUsers || 0}
                        </Typography>
                        <Typography variant="body2">Member Users</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6} md={2}>
                      <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'info.light' }}>
                        <Typography variant="h4" color="info.dark">
                          {assessment.metadata.tenantInfo.userAnalysis?.externalUsers || 0}
                        </Typography>
                        <Typography variant="body2">External Members</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6} md={2}>
                      <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'secondary.light' }}>
                        <Typography variant="h4" color="secondary.dark">
                          {assessment.metadata.tenantInfo.userAnalysis?.syncedUsers || 0}
                        </Typography>
                        <Typography variant="body2">On-Premises Sync</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6} md={2}>
                      <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'grey.300' }}>
                        <Typography variant="h4">
                          {assessment.metadata.tenantInfo.userAnalysis?.pureAzureUsers || 0}
                        </Typography>
                        <Typography variant="body2">Pure Azure</Typography>
                      </Paper>
                    </Grid>
                  </Grid>
                  
                  <Grid container spacing={2} sx={{ mt: 2 }}>
                    <Grid item xs={12} md={4}>
                      <Alert severity={assessment.metadata.tenantInfo.userAnalysis?.passwordNeverExpires > 0 ? "warning" : "success"}>
                        <Typography variant="body2">
                          <strong>Password Never Expires:</strong> {assessment.metadata.tenantInfo.userAnalysis?.passwordNeverExpires || 0} users
                        </Typography>
                      </Alert>
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <Alert severity="info">
                        <Typography variant="body2">
                          <strong>Enabled Accounts:</strong> {assessment.metadata.tenantInfo.userAnalysis?.enabledUsers || 0} users
                        </Typography>
                      </Alert>
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <Alert severity="info">
                        <Typography variant="body2">
                          <strong>Disabled Accounts:</strong> {assessment.metadata.tenantInfo.userAnalysis?.disabledUsers || 0} users
                        </Typography>
                      </Alert>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>

            {/* Groups */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardHeader title="Groups Analysis" />
                <CardContent>
                  <Typography variant="body2" gutterBottom>
                    Critical groups for admin activities and security management
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'primary.light' }}>
                        <Typography variant="h4" color="primary.dark">
                          {assessment.metadata.tenantInfo.groupAnalysis?.securityGroups || 0}
                        </Typography>
                        <Typography variant="body2">Security Groups</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6}>
                      <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'secondary.light' }}>
                        <Typography variant="h4" color="secondary.dark">
                          {assessment.metadata.tenantInfo.groupAnalysis?.distributionGroups || 0}
                        </Typography>
                        <Typography variant="body2">Distribution Groups</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6}>
                      <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'info.light' }}>
                        <Typography variant="h4" color="info.dark">
                          {assessment.metadata.tenantInfo.groupAnalysis?.unifiedGroups || 0}
                        </Typography>
                        <Typography variant="body2">Microsoft 365 Groups</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6}>
                      <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'warning.light' }}>
                        <Typography variant="h4" color="warning.dark">
                          {assessment.metadata.tenantInfo.groupAnalysis?.dynamicGroups || 0}
                        </Typography>
                        <Typography variant="body2">Dynamic Groups</Typography>
                      </Paper>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>

            {/* Applications */}
            <Grid item xs={12} md={6}>
              <Card>
                <CardHeader title="All Applications" />
                <CardContent>
                  <Typography variant="body2" gutterBottom>
                    Applications defined in Azure AD
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'success.light' }}>
                        <Typography variant="h4" color="success.dark">
                          {assessment.metadata.tenantInfo.applicationAnalysis?.singleTenantApps || 0}
                        </Typography>
                        <Typography variant="body2">Single Tenant</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6}>
                      <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'info.light' }}>
                        <Typography variant="h4" color="info.dark">
                          {assessment.metadata.tenantInfo.applicationAnalysis?.multiTenantApps || 0}
                        </Typography>
                        <Typography variant="body2">Multi Tenant</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6}>
                      <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'warning.light' }}>
                        <Typography variant="h4" color="warning.dark">
                          {assessment.metadata.tenantInfo.applicationAnalysis?.thirdPartyApps || 0}
                        </Typography>
                        <Typography variant="body2">Third Party</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6}>
                      <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'error.light' }}>
                        <Typography variant="h4" color="error.dark">
                          {assessment.metadata.tenantInfo.applicationAnalysis?.applicationsWithHighPrivileges || 0}
                        </Typography>
                        <Typography variant="body2">High Privileges</Typography>
                      </Paper>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>

            {/* Privileged Roles */}
            <Grid item xs={12}>
              <Card>
                <CardHeader title="Privileged Roles & Members" />
                <CardContent>
                  {assessment.metadata.tenantInfo.privilegedRoles?.length > 0 ? (
                    <List dense>
                      {assessment.metadata.tenantInfo.privilegedRoles
                        .filter(role => role.memberCount > 0)
                        .slice(0, 10)
                        .map((role, index) => (
                        <ListItem key={index} divider>
                          <ListItemText
                            primary={role.displayName}
                            secondary={
                              <Box>
                                <Typography variant="body2">
                                  {role.memberCount} member{role.memberCount !== 1 ? 's' : ''}
                                </Typography>
                                {role.members.slice(0, 3).map((member, idx) => (
                                  <Chip
                                    key={idx}
                                    label={member.displayName || member.userPrincipalName}
                                    size="small"
                                    variant="outlined"
                                    sx={{ mr: 1, mt: 0.5 }}
                                  />
                                ))}
                                {role.memberCount > 3 && (
                                  <Typography variant="caption" color="text.secondary">
                                    ... and {role.memberCount - 3} more
                                  </Typography>
                                )}
                              </Box>
                            }
                          />
                        </ListItem>
                      ))}
                    </List>
                  ) : (
                    <Alert severity="info">No privileged role assignments found</Alert>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Email Forwarding */}
            <Grid item xs={12}>
              <Card>
                <CardHeader title="Outlook Online - Email Forwarding" />
                <CardContent>
                  {assessment.metadata.tenantInfo.emailForwarding?.available ? (
                    <Box>
                      <Typography variant="body2" gutterBottom>
                        Mailboxes with forwarding settings
                      </Typography>
                      <Grid container spacing={2}>
                        <Grid item xs={4}>
                          <Paper sx={{ p: 2, textAlign: 'center' }}>
                            <Typography variant="h4">{assessment.metadata.tenantInfo.emailForwarding.forwardingMailboxes}</Typography>
                            <Typography variant="body2">Total Forwarding</Typography>
                          </Paper>
                        </Grid>
                        <Grid item xs={4}>
                          <Paper sx={{ p: 2, textAlign: 'center' }}>
                            <Typography variant="h4">{assessment.metadata.tenantInfo.emailForwarding.externalForwarding}</Typography>
                            <Typography variant="body2">External Forwarding</Typography>
                          </Paper>
                        </Grid>
                        <Grid item xs={4}>
                          <Paper sx={{ p: 2, textAlign: 'center' }}>
                            <Typography variant="h4">{assessment.metadata.tenantInfo.emailForwarding.internalForwarding}</Typography>
                            <Typography variant="body2">Internal Forwarding</Typography>
                          </Paper>
                        </Grid>
                      </Grid>
                    </Box>
                  ) : (
                    <Alert severity="info">
                      Email forwarding analysis requires Exchange Online permissions. 
                      This feature is not currently available with the configured permissions.
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card>
                <CardHeader title="Resource Counts" />
                <CardContent>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'primary.light', color: 'primary.contrastText' }}>
                        <Typography variant="h4">{assessment.metadata.tenantInfo.userCount || 0}</Typography>
                        <Typography variant="body2">Users</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6}>
                      <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'secondary.light', color: 'secondary.contrastText' }}>
                        <Typography variant="h4">{assessment.metadata.tenantInfo.groupCount || 0}</Typography>
                        <Typography variant="body2">Groups</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6}>
                      <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'info.light', color: 'info.contrastText' }}>
                        <Typography variant="h4">{assessment.metadata.tenantInfo.applicationCount || 0}</Typography>
                        <Typography variant="body2">Applications</Typography>
                      </Paper>
                    </Grid>
                    <Grid item xs={6}>
                      <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'success.light', color: 'success.contrastText' }}>
                        <Typography variant="h4">{assessment.metadata.tenantInfo.roleCount || 0}</Typography>
                        <Typography variant="body2">Directory Roles</Typography>
                      </Paper>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12}>
              <Card>
                <CardHeader title="Licensing Information" />
                <CardContent>
                  {assessment.metadata.tenantInfo.licenses && assessment.metadata.tenantInfo.licenses.length > 0 ? (
                    <List>
                      {assessment.metadata.tenantInfo.licenses.map((license, index) => (
                        <ListItem key={index} divider>
                          <ListItemText
                            primary={license.productName}
                            secondary={
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}>
                                <Typography variant="body2">
                                  {license.assignedLicenses} / {license.totalLicenses} assigned
                                </Typography>
                                <LinearProgress
                                  variant="determinate"
                                  value={(license.assignedLicenses / license.totalLicenses) * 100}
                                  sx={{ flexGrow: 1, height: 6 }}
                                />
                              </Box>
                            }
                          />
                        </ListItem>
                      ))}
                      <ListItem>
                        <ListItemText
                          primary={
                            <Typography variant="h6">
                              Total: {assessment.metadata.tenantInfo.assignedLicenses || 0} / {assessment.metadata.tenantInfo.totalLicenses || 0} licenses
                            </Typography>
                          }
                        />
                      </ListItem>
                    </List>
                  ) : (
                    <Alert severity="info">No license information available</Alert>
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* API Permissions Status */}
            {assessment.metadata?.permissionCheck && (
              <Grid item xs={12}>
                <Card>
                  <CardHeader title="API Permissions Status" />
                  <CardContent>
                    <Box sx={{ mb: 3 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
                          Permission Coverage
                        </Typography>
                        <Typography variant="h6">
                          {assessment.metadata.permissionCheck.permissionScore || 0}%
                        </Typography>
                      </Box>
                      <LinearProgress 
                        variant="determinate" 
                        value={assessment.metadata.permissionCheck.permissionScore || 0}
                        sx={{ height: 8, borderRadius: 4 }}
                        color={assessment.metadata.permissionCheck.permissionScore >= 80 ? 'success' : 
                               assessment.metadata.permissionCheck.permissionScore >= 60 ? 'warning' : 'error'}
                      />
                    </Box>
                    
                    <Grid container spacing={2}>
                      <Grid item xs={4}>
                        <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'success.light' }}>
                          <Typography variant="h4" color="success.dark">
                            {assessment.metadata.permissionCheck.availablePermissions?.length || 0}
                          </Typography>
                          <Typography variant="body2">Available</Typography>
                        </Paper>
                      </Grid>
                      <Grid item xs={4}>
                        <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'warning.light' }}>
                          <Typography variant="h4" color="warning.dark">
                            {assessment.metadata.permissionCheck.missingPermissions?.length || 0}
                          </Typography>
                          <Typography variant="body2">Missing</Typography>
                        </Paper>
                      </Grid>
                      <Grid item xs={4}>
                        <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'error.light' }}>
                          <Typography variant="h4" color="error.dark">
                            {assessment.metadata.permissionCheck.criticalMissing?.length || 0}
                          </Typography>
                          <Typography variant="body2">Critical Missing</Typography>
                        </Paper>
                      </Grid>
                    </Grid>
                    
                    {assessment.metadata.permissionCheck.missingPermissions?.length > 0 && (
                      <Alert severity="warning" sx={{ mt: 2 }}>
                        <Typography variant="body2">
                          Some API permissions are missing. This may affect the completeness of compliance assessments.
                        </Typography>
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            )}
          </Grid>
        )}

        {/* Control Results Tab */}
        {selectedTab === 2 && assessment.resultsBySection && (
          <Box>
            {Object.entries(assessment.resultsBySection).map(([section, controls]) => (
              <Accordion key={section} defaultExpanded={controls.some(c => c.status === 'non_compliant')}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', pr: 2 }}>
                    <Typography sx={{ flexGrow: 1 }}>{section}</Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Chip 
                        size="small" 
                        label={`${controls.filter(c => c.status === 'compliant').length}/${controls.length} Compliant`}
                        color="success"
                        variant="outlined"
                      />
                    </Box>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <List>
                    {controls.map((control) => (
                      <ListItem key={control.id} divider>
                        <ListItemIcon>
                          {getStatusIcon(control.status)}
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="subtitle2">{control.control_id}</Typography>
                              <Typography variant="body1">{control.title}</Typography>
                              <Chip 
                                label={control.severity} 
                                size="small" 
                                variant="outlined"
                                color={control.severity === 'level1' ? 'primary' : 'secondary'}
                              />
                            </Box>
                          }
                          secondary={
                            <Box sx={{ mt: 1 }}>
                              <Typography variant="body2" color="text.secondary" paragraph>
                                {control.description}
                              </Typography>
                              {control.remediation_guidance && (
                                <Alert severity="info" sx={{ mt: 1 }}>
                                  <Typography variant="body2">
                                    <strong>Remediation:</strong> {control.remediation_guidance}
                                  </Typography>
                                </Alert>
                              )}
                              {control.error_message && (
                                <Alert severity="error" sx={{ mt: 1 }}>
                                  <Typography variant="body2">
                                    <strong>Error:</strong> {control.error_message}
                                  </Typography>
                                </Alert>
                              )}
                            </Box>
                          }
                        />
                      </ListItem>
                    ))}
                  </List>
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        )}

        {/* Failing Entities Tab */}
        {selectedTab === 3 && assessment.results && (
          <Box>
            <Typography variant="h6" gutterBottom>
              Entities Not Meeting Compliance Requirements
            </Typography>
            
            {(() => {
              const failingEntities = [];
              assessment.results.forEach(result => {
                if (result.evidence && result.evidence.failingEntities) {
                  result.evidence.failingEntities.forEach(entity => {
                    failingEntities.push({
                      ...entity,
                      controlId: result.control_id,
                      controlTitle: result.title,
                      section: result.section
                    });
                  });
                }
              });
              
              if (failingEntities.length === 0) {
                return (
                  <Alert severity="success">
                    No failing entities found. All users and policies meet compliance requirements!
                  </Alert>
                );
              }

              // Group entities by type
              const entitiesByType = failingEntities.reduce((acc, entity) => {
                if (!acc[entity.type]) {
                  acc[entity.type] = [];
                }
                acc[entity.type].push(entity);
                return acc;
              }, {});

              return Object.entries(entitiesByType).map(([entityType, entities]) => (
                <Accordion key={entityType} defaultExpanded>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', pr: 2 }}>
                      <Typography sx={{ flexGrow: 1 }}>
                        {entityType}s ({entities.length})
                      </Typography>
                      <Chip 
                        size="small" 
                        label={`${entities.length} failing`}
                        color="error"
                        variant="outlined"
                      />
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    <List>
                      {entities.map((entity, index) => (
                        <ListItem key={index} divider>
                          <ListItemIcon>
                            <ErrorIcon color="error" />
                          </ListItemIcon>
                          <ListItemText
                            primary={
                              <Box>
                                <Typography variant="subtitle1">
                                  {entity.displayName || entity.userPrincipalName || 'Unknown Entity'}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                  Control: {entity.controlId} - {entity.controlTitle}
                                </Typography>
                              </Box>
                            }
                            secondary={
                              <Box sx={{ mt: 1 }}>
                                <Alert severity="error" sx={{ mb: 1 }}>
                                  <Typography variant="body2">
                                    <strong>Issue:</strong> {entity.reason}
                                  </Typography>
                                </Alert>
                                
                                {entity.userPrincipalName && (
                                  <Typography variant="body2">
                                    <strong>UPN:</strong> {entity.userPrincipalName}
                                  </Typography>
                                )}
                                
                                {entity.lastSignIn && (
                                  <Typography variant="body2">
                                    <strong>Last Sign-in:</strong> {new Date(entity.lastSignIn).toLocaleString()}
                                  </Typography>
                                )}
                                
                                {entity.accountEnabled !== undefined && (
                                  <Typography variant="body2">
                                    <strong>Account Status:</strong> {entity.accountEnabled ? 'Enabled' : 'Disabled'}
                                  </Typography>
                                )}
                                
                                {entity.userType && (
                                  <Typography variant="body2">
                                    <strong>User Type:</strong> {entity.userType}
                                  </Typography>
                                )}

                                {entity.createdDateTime && (
                                  <Typography variant="body2">
                                    <strong>Created:</strong> {new Date(entity.createdDateTime).toLocaleString()}
                                  </Typography>
                                )}

                                {entity.policies && (
                                  <Typography variant="body2">
                                    <strong>Related Policies:</strong> {entity.policies.join(', ')}
                                  </Typography>
                                )}

                                {entity.severity && (
                                  <Chip 
                                    label={`${entity.severity} Priority`} 
                                    size="small" 
                                    color={entity.severity === 'Critical' ? 'error' : 'warning'}
                                    sx={{ mt: 1 }}
                                  />
                                )}
                              </Box>
                            }
                          />
                        </ListItem>
                      ))}
                    </List>
                  </AccordionDetails>
                </Accordion>
              ));
            })()}
          </Box>
        )}

        {/* Remediation Tab */}
        {selectedTab === 4 && assessment.results && (
          <Box>
            <Typography variant="h6" gutterBottom>
              Remediation Actions Required
            </Typography>
            <List>
              {assessment.results
                .filter(r => r.status === 'non_compliant' && r.remediation_guidance)
                .map((result) => (
                  <ListItem key={result.id} divider>
                    <ListItemIcon>
                      <WarningIcon color="error" />
                    </ListItemIcon>
                    <ListItemText
                      primary={`${result.control_id}: ${result.title}`}
                      secondary={
                        <Box sx={{ mt: 1 }}>
                          <Typography variant="body2" paragraph>
                            {result.remediation_guidance}
                          </Typography>
                          <Chip 
                            label={`Priority: ${result.severity}`} 
                            size="small" 
                            color={result.severity === 'level1' ? 'error' : 'warning'}
                          />
                        </Box>
                      }
                    />
                  </ListItem>
                ))}
            </List>
            {assessment.results.filter(r => r.status === 'non_compliant').length === 0 && (
              <Alert severity="success">
                No remediation actions required. All controls are compliant!
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {assessment.status === 'completed' && (
          <Button 
            variant="contained" 
            startIcon={<GetAppIcon />}
            onClick={() => window.open(`/api/compliance/assessment/${assessment.id}/report`, '_blank')}
          >
            Download Report
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default Compliance;