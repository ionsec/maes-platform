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
  Fab,
  FormControlLabel,
  Switch,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import {
  Add as AddIcon,
  Refresh as RefreshIcon,
  Download as DownloadIcon,
  Visibility as ViewIcon,
  Delete as DeleteIcon,
  Schedule as ScheduleIcon,
  ExpandMore as ExpandMoreIcon
} from '@mui/icons-material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { useForm, Controller } from 'react-hook-form';
import { useSnackbar } from 'notistack';
import dayjs from 'dayjs';
import axios from '../utils/axios';

const reportTypes = [
  { value: 'executive_summary', label: 'Executive Summary', description: 'High-level security overview for management' },
  { value: 'incident_report', label: 'Incident Report', description: 'Detailed incident analysis and timeline' },
  { value: 'compliance_report', label: 'Compliance Report', description: 'Regulatory compliance assessment' },
  { value: 'threat_analysis', label: 'Threat Analysis', description: 'Comprehensive threat landscape analysis' },
  { value: 'user_activity', label: 'User Activity Report', description: 'User behavior and access patterns' },
  { value: 'system_health', label: 'System Health Report', description: 'Platform performance and health metrics' },
  { value: 'custom', label: 'Custom Report', description: 'Build your own report with custom sections' }
];

const formatOptions = [
  { value: 'pdf', label: 'PDF', description: 'Portable Document Format' },
  { value: 'docx', label: 'Word Document', description: 'Microsoft Word format' },
  { value: 'xlsx', label: 'Excel Spreadsheet', description: 'Microsoft Excel format' },
  { value: 'html', label: 'HTML', description: 'Web page format' },
  { value: 'json', label: 'JSON', description: 'Machine-readable format' }
];

const statusColors = {
  pending: 'warning',
  generating: 'info',
  completed: 'success',
  failed: 'error'
};

const Reports = () => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { control, handleSubmit, reset, watch } = useForm({
    defaultValues: {
      name: '',
      type: 'executive_summary',
      format: 'pdf',
      startDate: dayjs().subtract(30, 'days'),
      endDate: dayjs(),
      includeCharts: true,
      includeRawData: false,
      scheduleEnabled: false,
      frequency: 'weekly',
      dayOfWeek: 1,
      time: '09:00'
    }
  });
  const { enqueueSnackbar } = useSnackbar();

  const scheduleEnabled = watch('scheduleEnabled');
  const reportType = watch('type');

  const fetchReports = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/reports');
      setReports(response.data.reports);
    } catch (error) {
      enqueueSnackbar('Failed to fetch reports', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const onSubmit = async (data) => {
    try {
      const payload = {
        name: data.name,
        type: data.type,
        format: data.format,
        parameters: {
          dateRange: {
            start: data.startDate.toISOString(),
            end: data.endDate.toISOString()
          },
          includeCharts: data.includeCharts,
          includeRawData: data.includeRawData,
          filters: {}
        },
        schedule: data.scheduleEnabled ? {
          enabled: true,
          frequency: data.frequency,
          dayOfWeek: data.frequency === 'weekly' ? data.dayOfWeek : null,
          dayOfMonth: data.frequency === 'monthly' ? data.dayOfMonth : null,
          time: data.time
        } : { enabled: false }
      };

      await axios.post('/api/reports', payload);
      enqueueSnackbar('Report created successfully', { variant: 'success' });
      setDialogOpen(false);
      reset();
      fetchReports();
    } catch (error) {
      enqueueSnackbar(error.response?.data?.error || 'Failed to create report', { variant: 'error' });
    }
  };

  const downloadReport = async (id) => {
    try {
      const response = await axios.get(`/api/reports/${id}/download`, {
        responseType: 'blob'
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `report-${id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      enqueueSnackbar('Failed to download report', { variant: 'error' });
    }
  };

  const deleteReport = async (id) => {
    if (!window.confirm('Are you sure you want to delete this report?')) return;
    
    try {
      await axios.delete(`/api/reports/${id}`);
      enqueueSnackbar('Report deleted successfully', { variant: 'success' });
      fetchReports();
    } catch (error) {
      enqueueSnackbar('Failed to delete report', { variant: 'error' });
    }
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h4">Security Reports</Typography>
          <Box>
            <IconButton onClick={fetchReports} disabled={loading}>
              <RefreshIcon />
            </IconButton>
            <Fab 
              color="primary" 
              sx={{ ml: 1 }}
              onClick={() => setDialogOpen(true)}
            >
              <AddIcon />
            </Fab>
          </Box>
        </Box>

        {/* Statistics Cards */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography variant="h6" color="primary">
                  {reports.length}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Total Reports
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography variant="h6" color="info.main">
                  {reports.filter(r => r.status === 'generating').length}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Generating
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={3}>
            <Card>
              <CardContent>
                <Typography variant="h6" color="success.main">
                  {reports.filter(r => r.status === 'completed').length}
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
                  {reports.filter(r => r.schedule?.enabled).length}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Scheduled
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Reports Table */}
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Report Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Format</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Schedule</TableCell>
                <TableCell>Generated</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {reports.map((report) => (
                <TableRow key={report.id}>
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">
                      {report.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Created by {report.User?.username || 'System'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {reportTypes.find(t => t.value === report.type)?.label || report.type}
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={report.format.toUpperCase()} 
                      variant="outlined"
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={report.status} 
                      color={statusColors[report.status]}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {report.schedule?.enabled ? (
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <ScheduleIcon sx={{ fontSize: 16, mr: 0.5, color: 'success.main' }} />
                        <Typography variant="caption">
                          {report.schedule.frequency}
                        </Typography>
                      </Box>
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        One-time
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {report.generatedAt ? (
                      <Typography variant="body2">
                        {dayjs(report.generatedAt).format('MMM DD, HH:mm')}
                      </Typography>
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        Not generated
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {report.status === 'completed' && (
                      <IconButton 
                        size="small" 
                        onClick={() => downloadReport(report.id)}
                        title="Download"
                      >
                        <DownloadIcon />
                      </IconButton>
                    )}
                    <IconButton 
                      size="small" 
                      onClick={() => deleteReport(report.id)}
                      title="Delete"
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {reports.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    <Typography variant="body2" color="text.secondary">
                      No reports found. Create your first report to get started.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Create Report Dialog */}
        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
          <form onSubmit={handleSubmit(onSubmit)}>
            <DialogTitle>Create New Report</DialogTitle>
            <DialogContent>
              <Grid container spacing={3} sx={{ mt: 1 }}>
                {/* Report Name */}
                <Grid item xs={12}>
                  <Controller
                    name="name"
                    control={control}
                    rules={{ required: 'Report name is required' }}
                    render={({ field, fieldState }) => (
                      <TextField
                        {...field}
                        fullWidth
                        label="Report Name"
                        error={fieldState.invalid}
                        helperText={fieldState.error?.message}
                      />
                    )}
                  />
                </Grid>

                {/* Report Type */}
                <Grid item xs={12} md={6}>
                  <Controller
                    name="type"
                    control={control}
                    render={({ field }) => (
                      <FormControl fullWidth>
                        <InputLabel>Report Type</InputLabel>
                        <Select {...field} label="Report Type">
                          {reportTypes.map((type) => (
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

                {/* Format */}
                <Grid item xs={12} md={6}>
                  <Controller
                    name="format"
                    control={control}
                    render={({ field }) => (
                      <FormControl fullWidth>
                        <InputLabel>Format</InputLabel>
                        <Select {...field} label="Format">
                          {formatOptions.map((format) => (
                            <MenuItem key={format.value} value={format.value}>
                              <Box>
                                <Typography variant="body1">{format.label}</Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {format.description}
                                </Typography>
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

                {/* Content Options */}
                <Grid item xs={12}>
                  <Accordion>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography>Content Options</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Grid container spacing={2}>
                        <Grid item xs={12}>
                          <Controller
                            name="includeCharts"
                            control={control}
                            render={({ field }) => (
                              <FormControlLabel
                                control={<Switch {...field} checked={field.value} />}
                                label="Include charts and visualizations"
                              />
                            )}
                          />
                        </Grid>
                        <Grid item xs={12}>
                          <Controller
                            name="includeRawData"
                            control={control}
                            render={({ field }) => (
                              <FormControlLabel
                                control={<Switch {...field} checked={field.value} />}
                                label="Include raw data tables"
                              />
                            )}
                          />
                        </Grid>
                      </Grid>
                    </AccordionDetails>
                  </Accordion>
                </Grid>

                {/* Scheduling */}
                <Grid item xs={12}>
                  <Accordion>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography>Scheduling Options</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Grid container spacing={2}>
                        <Grid item xs={12}>
                          <Controller
                            name="scheduleEnabled"
                            control={control}
                            render={({ field }) => (
                              <FormControlLabel
                                control={<Switch {...field} checked={field.value} />}
                                label="Enable automatic report generation"
                              />
                            )}
                          />
                        </Grid>
                        {scheduleEnabled && (
                          <>
                            <Grid item xs={12} md={6}>
                              <Controller
                                name="frequency"
                                control={control}
                                render={({ field }) => (
                                  <FormControl fullWidth>
                                    <InputLabel>Frequency</InputLabel>
                                    <Select {...field} label="Frequency">
                                      <MenuItem value="daily">Daily</MenuItem>
                                      <MenuItem value="weekly">Weekly</MenuItem>
                                      <MenuItem value="monthly">Monthly</MenuItem>
                                    </Select>
                                  </FormControl>
                                )}
                              />
                            </Grid>
                            <Grid item xs={12} md={6}>
                              <Controller
                                name="time"
                                control={control}
                                render={({ field }) => (
                                  <TextField
                                    {...field}
                                    fullWidth
                                    type="time"
                                    label="Time"
                                    InputLabelProps={{ shrink: true }}
                                  />
                                )}
                              />
                            </Grid>
                          </>
                        )}
                      </Grid>
                    </AccordionDetails>
                  </Accordion>
                </Grid>
              </Grid>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" variant="contained">Create Report</Button>
            </DialogActions>
          </form>
        </Dialog>
      </Box>
    </LocalizationProvider>
  );
};

export default Reports;