import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Chip,
  LinearProgress,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider,
  Paper
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  TrendingFlat as TrendingFlatIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  HelpOutline as HelpOutlineIcon,
  Timeline as TimelineIcon,
  Compare as CompareIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import axios from '../../utils/axios';

const AssessmentComparison = ({ open, onClose, organizationId, assessments }) => {
  const { enqueueSnackbar } = useSnackbar();
  
  // State
  const [baselineAssessment, setBaselineAssessment] = useState('');
  const [currentAssessment, setCurrentAssessment] = useState('');
  const [loading, setLoading] = useState(false);
  const [comparisonData, setComparisonData] = useState(null);
  const [expandedSections, setExpandedSections] = useState({});

  // Filter completed assessments for comparison
  const completedAssessments = assessments.filter(a => a.status === 'completed');

  useEffect(() => {
    if (open && completedAssessments.length > 0) {
      // Auto-select the two most recent assessments if available
      if (completedAssessments.length >= 2) {
        setCurrentAssessment(completedAssessments[0].id); // Most recent
        setBaselineAssessment(completedAssessments[1].id); // Second most recent
      } else if (completedAssessments.length === 1) {
        setCurrentAssessment(completedAssessments[0].id);
      }
    }
  }, [open, completedAssessments]);

  const handleCompare = async () => {
    if (!baselineAssessment || !currentAssessment) {
      enqueueSnackbar('Please select both baseline and current assessments', { variant: 'warning' });
      return;
    }

    if (baselineAssessment === currentAssessment) {
      enqueueSnackbar('Please select different assessments for comparison', { variant: 'warning' });
      return;
    }

    try {
      setLoading(true);
      
      const response = await axios.get(
        `/api/compliance/compare/${baselineAssessment}/${currentAssessment}`
      );

      if (response.data.success) {
        setComparisonData(response.data);
      }

    } catch (error) {
      console.error('Error comparing assessments:', error);
      enqueueSnackbar(
        error.response?.data?.message || 'Failed to compare assessments', 
        { variant: 'error' }
      );
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setComparisonData(null);
    setBaselineAssessment('');
    setCurrentAssessment('');
    setExpandedSections({});
    onClose();
  };

  const getChangeIcon = (changeType) => {
    switch (changeType) {
      case 'improved':
        return <TrendingUpIcon color="success" />;
      case 'degraded':
        return <TrendingDownIcon color="error" />;
      case 'resolved':
        return <CheckCircleIcon color="success" />;
      case 'new_issues':
        return <ErrorIcon color="error" />;
      default:
        return <TrendingFlatIcon color="disabled" />;
    }
  };

  const getChangeColor = (changeType) => {
    switch (changeType) {
      case 'improved':
      case 'resolved':
        return 'success';
      case 'degraded':
      case 'new_issues':
        return 'error';
      default:
        return 'default';
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  const handleSectionToggle = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  if (!open) return null;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CompareIcon />
          Assessment Comparison
        </Box>
      </DialogTitle>
      
      <DialogContent>
        {completedAssessments.length < 2 ? (
          <Alert severity="info">
            You need at least 2 completed assessments to perform a comparison. 
            Currently available: {completedAssessments.length} completed assessment(s).
          </Alert>
        ) : (
          <>
            {/* Assessment Selection */}
            <Grid container spacing={3} sx={{ mb: 3 }}>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Baseline Assessment</InputLabel>
                  <Select
                    value={baselineAssessment}
                    label="Baseline Assessment"
                    onChange={(e) => setBaselineAssessment(e.target.value)}
                  >
                    {completedAssessments.map((assessment) => (
                      <MenuItem key={assessment.id} value={assessment.id}>
                        <Box>
                          <Typography variant="body1">{assessment.name}</Typography>
                          <Typography variant="caption" color="textSecondary">
                            {formatDate(assessment.completed_at)} - Score: {assessment.compliance_score}%
                          </Typography>
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Current Assessment</InputLabel>
                  <Select
                    value={currentAssessment}
                    label="Current Assessment"
                    onChange={(e) => setCurrentAssessment(e.target.value)}
                  >
                    {completedAssessments.map((assessment) => (
                      <MenuItem key={assessment.id} value={assessment.id}>
                        <Box>
                          <Typography variant="body1">{assessment.name}</Typography>
                          <Typography variant="caption" color="textSecondary">
                            {formatDate(assessment.completed_at)} - Score: {assessment.compliance_score}%
                          </Typography>
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            {/* Compare Button */}
            <Box sx={{ mb: 3, display: 'flex', justifyContent: 'center' }}>
              <Button
                variant="contained"
                onClick={handleCompare}
                disabled={loading || !baselineAssessment || !currentAssessment || baselineAssessment === currentAssessment}
                startIcon={loading ? <CircularProgress size={16} /> : <CompareIcon />}
              >
                {loading ? 'Comparing...' : 'Compare Assessments'}
              </Button>
            </Box>

            {/* Comparison Results */}
            {comparisonData && (
              <Box>
                {/* Summary Cards */}
                <Grid container spacing={2} sx={{ mb: 3 }}>
                  <Grid item xs={12} md={6}>
                    <Card>
                      <CardContent>
                        <Typography variant="h6" gutterBottom>
                          Baseline Assessment
                        </Typography>
                        <Typography variant="body2" color="textSecondary" gutterBottom>
                          {comparisonData.baseline.name}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2 }}>
                          <Typography variant="h4" color="primary">
                            {comparisonData.baseline.score}%
                          </Typography>
                          <Typography variant="body2" color="textSecondary">
                            Compliance Score
                          </Typography>
                        </Box>
                        <Typography variant="caption" color="textSecondary">
                          Completed: {formatDate(comparisonData.baseline.completedAt)}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <Card>
                      <CardContent>
                        <Typography variant="h6" gutterBottom>
                          Current Assessment
                        </Typography>
                        <Typography variant="body2" color="textSecondary" gutterBottom>
                          {comparisonData.current.name}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2 }}>
                          <Typography variant="h4" color="primary">
                            {comparisonData.current.score}%
                          </Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {comparisonData.changes.scoreChange > 0 ? (
                              <TrendingUpIcon color="success" />
                            ) : comparisonData.changes.scoreChange < 0 ? (
                              <TrendingDownIcon color="error" />
                            ) : (
                              <TrendingFlatIcon color="disabled" />
                            )}
                            <Typography 
                              variant="body2" 
                              color={
                                comparisonData.changes.scoreChange > 0 ? 'success.main' :
                                comparisonData.changes.scoreChange < 0 ? 'error.main' : 'text.secondary'
                              }
                            >
                              {comparisonData.changes.scoreChange > 0 ? '+' : ''}
                              {comparisonData.changes.scoreChange}%
                            </Typography>
                          </Box>
                        </Box>
                        <Typography variant="caption" color="textSecondary">
                          Completed: {formatDate(comparisonData.current.completedAt)}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>

                {/* Summary Overview */}
                <Card sx={{ mb: 3 }}>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Comparison Summary
                    </Typography>
                    
                    <Grid container spacing={2}>
                      <Grid item xs={6} md={3}>
                        <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'success.light', color: 'success.contrastText' }}>
                          <Typography variant="h4">{comparisonData.changes.resolved}</Typography>
                          <Typography variant="body2">Resolved Issues</Typography>
                        </Paper>
                      </Grid>
                      
                      <Grid item xs={6} md={3}>
                        <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'error.light', color: 'error.contrastText' }}>
                          <Typography variant="h4">{comparisonData.changes.newIssues}</Typography>
                          <Typography variant="body2">New Issues</Typography>
                        </Paper>
                      </Grid>
                      
                      <Grid item xs={6} md={3}>
                        <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'warning.light', color: 'warning.contrastText' }}>
                          <Typography variant="h4">{comparisonData.changes.improved}</Typography>
                          <Typography variant="body2">Improved</Typography>
                        </Paper>
                      </Grid>
                      
                      <Grid item xs={6} md={3}>
                        <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'grey.300', color: 'text.primary' }}>
                          <Typography variant="h4">{comparisonData.changes.unchanged}</Typography>
                          <Typography variant="body2">Unchanged</Typography>
                        </Paper>
                      </Grid>
                    </Grid>

                    <Box sx={{ mt: 3 }}>
                      <Alert 
                        severity={
                          comparisonData.summary.trend === 'improving' ? 'success' :
                          comparisonData.summary.trend === 'declining' ? 'error' : 'info'
                        }
                      >
                        <Typography variant="body1">
                          <strong>Overall Trend:</strong> {comparisonData.summary.trend} 
                          ({comparisonData.summary.significance} change)
                        </Typography>
                        <Typography variant="body2">
                          Score change: {comparisonData.changes.scoreChange > 0 ? '+' : ''}
                          {comparisonData.changes.scoreChange}% | 
                          Weighted score change: {comparisonData.changes.weightedScoreChange > 0 ? '+' : ''}
                          {comparisonData.changes.weightedScoreChange}%
                        </Typography>
                      </Alert>
                    </Box>
                  </CardContent>
                </Card>

                {/* Detailed Changes */}
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Detailed Changes
                    </Typography>

                    {/* Resolved Issues */}
                    {comparisonData.detailedChanges.resolved.length > 0 && (
                      <Accordion 
                        expanded={expandedSections.resolved}
                        onChange={() => handleSectionToggle('resolved')}
                      >
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <CheckCircleIcon color="success" />
                            <Typography>
                              Resolved Issues ({comparisonData.detailedChanges.resolved.length})
                            </Typography>
                          </Box>
                        </AccordionSummary>
                        <AccordionDetails>
                          <List>
                            {comparisonData.detailedChanges.resolved.map((control, index) => (
                              <ListItem key={index} divider>
                                <ListItemIcon>
                                  <CheckCircleIcon color="success" fontSize="small" />
                                </ListItemIcon>
                                <ListItemText
                                  primary={`${control.control_id} - ${control.title}`}
                                  secondary={`Section: ${control.section} | Severity: ${control.severity}`}
                                />
                                <Chip label="Resolved" color="success" size="small" />
                              </ListItem>
                            ))}
                          </List>
                        </AccordionDetails>
                      </Accordion>
                    )}

                    {/* New Issues */}
                    {comparisonData.detailedChanges.new_issues.length > 0 && (
                      <Accordion 
                        expanded={expandedSections.new_issues}
                        onChange={() => handleSectionToggle('new_issues')}
                      >
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <ErrorIcon color="error" />
                            <Typography>
                              New Issues ({comparisonData.detailedChanges.new_issues.length})
                            </Typography>
                          </Box>
                        </AccordionSummary>
                        <AccordionDetails>
                          <List>
                            {comparisonData.detailedChanges.new_issues.map((control, index) => (
                              <ListItem key={index} divider>
                                <ListItemIcon>
                                  <ErrorIcon color="error" fontSize="small" />
                                </ListItemIcon>
                                <ListItemText
                                  primary={`${control.control_id} - ${control.title}`}
                                  secondary={`Section: ${control.section} | Severity: ${control.severity}`}
                                />
                                <Chip label="New Issue" color="error" size="small" />
                              </ListItem>
                            ))}
                          </List>
                        </AccordionDetails>
                      </Accordion>
                    )}

                    {/* Improved */}
                    {comparisonData.detailedChanges.improved.length > 0 && (
                      <Accordion 
                        expanded={expandedSections.improved}
                        onChange={() => handleSectionToggle('improved')}
                      >
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <TrendingUpIcon color="primary" />
                            <Typography>
                              Improved ({comparisonData.detailedChanges.improved.length})
                            </Typography>
                          </Box>
                        </AccordionSummary>
                        <AccordionDetails>
                          <List>
                            {comparisonData.detailedChanges.improved.map((control, index) => (
                              <ListItem key={index} divider>
                                <ListItemIcon>
                                  <TrendingUpIcon color="primary" fontSize="small" />
                                </ListItemIcon>
                                <ListItemText
                                  primary={`${control.control_id} - ${control.title}`}
                                  secondary={`Section: ${control.section} | Severity: ${control.severity}`}
                                />
                                <Chip label="Improved" color="primary" size="small" />
                              </ListItem>
                            ))}
                          </List>
                        </AccordionDetails>
                      </Accordion>
                    )}

                    {/* Degraded */}
                    {comparisonData.detailedChanges.degraded.length > 0 && (
                      <Accordion 
                        expanded={expandedSections.degraded}
                        onChange={() => handleSectionToggle('degraded')}
                      >
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <TrendingDownIcon color="warning" />
                            <Typography>
                              Degraded ({comparisonData.detailedChanges.degraded.length})
                            </Typography>
                          </Box>
                        </AccordionSummary>
                        <AccordionDetails>
                          <List>
                            {comparisonData.detailedChanges.degraded.map((control, index) => (
                              <ListItem key={index} divider>
                                <ListItemIcon>
                                  <TrendingDownIcon color="warning" fontSize="small" />
                                </ListItemIcon>
                                <ListItemText
                                  primary={`${control.control_id} - ${control.title}`}
                                  secondary={`Section: ${control.section} | Severity: ${control.severity}`}
                                />
                                <Chip label="Degraded" color="warning" size="small" />
                              </ListItem>
                            ))}
                          </List>
                        </AccordionDetails>
                      </Accordion>
                    )}

                    {comparisonData.changes.totalChanges === 0 && (
                      <Alert severity="info">
                        No changes detected between the selected assessments. 
                        All controls maintained their previous status.
                      </Alert>
                    )}
                  </CardContent>
                </Card>
              </Box>
            )}
          </>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

export default AssessmentComparison;