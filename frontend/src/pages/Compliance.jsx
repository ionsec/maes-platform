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
  ListItemSecondaryAction
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
  Error as ErrorIcon,
  Warning as WarningIcon,
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
  
  // Fetch compliance data
  useEffect(() => {
    if (selectedOrganizationId) {
      fetchComplianceData();
    }
  }, [selectedOrganizationId]);

  const fetchComplianceData = async () => {
    try {
      setLoading(true);
      
      // Fetch assessments and controls in parallel
      const [assessmentsResponse, controlsResponse] = await Promise.all([
        axios.get(`/api/compliance/assessments/${selectedOrganizationId}?limit=10`),
        axios.get('/api/compliance/controls/cis_v400')
      ]);

      if (assessmentsResponse.data.success) {
        setAssessments(assessmentsResponse.data.assessments);
      }

      if (controlsResponse.data.success) {
        setControls(controlsResponse.data.controls);
        setControlsBySection(controlsResponse.data.controlsBySection);
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
      const response = await axios.get(`/api/compliance/assessment/${assessmentId}`);
      if (response.data.success) {
        setAssessmentDetails(response.data.assessment);
        setDetailsDialog(true);
      }
    } catch (error) {
      console.error('Error fetching assessment details:', error);
      enqueueSnackbar('Failed to load assessment details', { variant: 'error' });
    }
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
                selectedOrganizationId === '00000000-0000-0000-0000-000000000001'
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
                    <IconButton edge="end" onClick={() => handleViewDetails(assessment.id)}>
                      <AssessmentIcon />
                    </IconButton>
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
      />

      {/* Assessment Details Dialog */}
      <AssessmentDetailsDialog
        open={detailsDialog}
        onClose={() => setDetailsDialog(false)}
        assessment={assessmentDetails}
      />
    </Box>
  );
};

// Start Assessment Dialog Component
const StartAssessmentDialog = ({ open, onClose, onSubmit, loading }) => {
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
          <Alert severity="info" sx={{ mb: 3 }}>
            This will run a comprehensive compliance assessment against your Microsoft 365 environment.
            The process may take several minutes to complete.
          </Alert>

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
  if (!assessment) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Assessment Details: {assessment.name}
      </DialogTitle>
      <DialogContent>
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
            </List>
          </Grid>

          <Grid item xs={12} md={6}>
            <Typography variant="h6" gutterBottom>Results Summary</Typography>
            {assessment.status === 'completed' ? (
              <List dense>
                <ListItem>
                  <ListItemText 
                    primary="Compliance Score" 
                    secondary={`${assessment.compliance_score}%`}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Compliant Controls" 
                    secondary={`${assessment.compliant_controls}/${assessment.total_controls}`}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Non-Compliant" 
                    secondary={assessment.non_compliant_controls}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Manual Review Required" 
                    secondary={assessment.manual_review_controls}
                  />
                </ListItem>
              </List>
            ) : (
              <Alert severity="info">
                Assessment results will be available once the assessment is completed.
              </Alert>
            )}
          </Grid>
        </Grid>

        {assessment.description && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="h6" gutterBottom>Description</Typography>
            <Typography variant="body2">{assessment.description}</Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default Compliance;