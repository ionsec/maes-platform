import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Chip, Button, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  FormControl, InputLabel, Select, MenuItem, IconButton, Tooltip,
  Paper, Tabs, Tab, Alert, LinearProgress, Divider, Stack, Avatar
} from '@mui/material';
import {
  Add as AddIcon, Visibility as ViewIcon, Security as SecurityIcon,
  Timeline as TimelineIcon, Folder as FolderIcon, Assignment as AssignmentIcon,
  CheckCircle as CheckCircleIcon, Warning as WarningIcon,
  Refresh as RefreshIcon, PlayArrow as PlayArrowIcon
} from '@mui/icons-material';
import axios from '../utils/axios';
import dayjs from 'dayjs';

const Incidents = () => {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [stats, setStats] = useState(null);
  const [tabValue, setTabValue] = useState(0);
  const [newIncident, setNewIncident] = useState({
    title: '',
    description: '',
    severity: 'medium',
    alertIds: []
  });

  const fetchIncidents = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/incidents', { params: { limit: 50 } });
      setIncidents(response.data.incidents || []);
      
      const statsResponse = await axios.get('/incidents/stats/summary');
      setStats(statsResponse.data.stats);
    } catch (error) {
      console.error('Failed to fetch incidents:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
  }, []);

  const handleViewIncident = async (id) => {
    try {
      const response = await axios.get(`/incidents/${id}`);
      setSelectedIncident(response.data.incident);
      setDialogOpen(true);
    } catch (error) {
      console.error('Failed to fetch incident:', error);
    }
  };

  const handleCreateIncident = async () => {
    try {
      await axios.post('/incidents', newIncident);
      setCreateDialogOpen(false);
      setNewIncident({ title: '', description: '', severity: 'medium', alertIds: [] });
      fetchIncidents();
    } catch (error) {
      console.error('Failed to create incident:', error);
    }
  };

  const handleUpdateStatus = async (id, status) => {
    try {
      await axios.put(`/incidents/${id}/status`, { status });
      fetchIncidents();
      if (selectedIncident?.id === id) {
        handleViewIncident(id);
      }
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const handleExecutePlaybook = async (incidentId, playbookId) => {
    try {
      await axios.post(`/incidents/${incidentId}/playbook`, { playbookId });
      fetchIncidents();
    } catch (error) {
      console.error('Failed to execute playbook:', error);
    }
  };

  const getSeverityColor = (severity) => {
    const colors = {
      critical: 'error',
      high: 'warning',
      medium: 'info',
      low: 'success'
    };
    return colors[severity] || 'default';
  };

  const getStatusColor = (status) => {
    const colors = {
      new: 'info',
      investigating: 'warning',
      contained: 'primary',
      resolved: 'success',
      closed: 'default'
    };
    return colors[status] || 'default';
  };

  const statCards = [
    { title: 'Total Incidents', value: stats?.total || 0, icon: <FolderIcon />, color: 'primary' },
    { title: 'New', value: stats?.new || 0, icon: <AddIcon />, color: 'info' },
    { title: 'Investigating', value: stats?.investigating || 0, icon: <TimelineIcon />, color: 'warning' },
    { title: 'Critical', value: stats?.critical || 0, icon: <SecurityIcon />, color: 'error' },
    { title: 'High Severity', value: stats?.high || 0, icon: <WarningIcon />, color: 'warning' }
  ];

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          Incident Management
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateDialogOpen(true)}>
          Create Incident
        </Button>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {statCards.map((stat, index) => (
          <Grid item xs={12} sm={6} md={2.4} key={index}>
            <Card sx={{ bgcolor: `${stat.color}.light`, height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography color="text.secondary" variant="caption">
                      {stat.title}
                    </Typography>
                    <Typography variant="h4">{stat.value}</Typography>
                  </Box>
                  <Avatar sx={{ bgcolor: `${stat.color}.main`, width: 48, height: 48 }}>
                    {stat.icon}
                  </Avatar>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)}>
          <Tab label="All Incidents" />
          <Tab label={`New (${stats?.new || 0})`} />
          <Tab label={`Investigating (${stats?.investigating || 0})`} />
          <Tab label={`Resolved (${stats?.resolved || 0})`} />
        </Tabs>
      </Paper>

      {/* Incidents Table */}
      {loading ? (
        <LinearProgress />
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Title</TableCell>
                <TableCell>Severity</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Assigned To</TableCell>
                <TableCell>Alerts</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {incidents
                .filter(i => {
                  if (tabValue === 1) return i.status === 'new';
                  if (tabValue === 2) return i.status === 'investigating';
                  if (tabValue === 3) return i.status === 'resolved';
                  return true;
                })
                .map((incident) => (
                  <TableRow key={incident.id}>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {incident.title}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={incident.severity} color={getSeverityColor(incident.severity)} size="small" />
                    </TableCell>
                    <TableCell>
                      <Chip label={incident.status} color={getStatusColor(incident.status)} size="small" />
                    </TableCell>
                    <TableCell>{incident.assigned_to_username || 'Unassigned'}</TableCell>
                    <TableCell>{incident.alert_count || 0}</TableCell>
                    <TableCell>{dayjs(incident.created_at).format('MMM D, YYYY HH:mm')}</TableCell>
                    <TableCell>
                      <Tooltip title="View">
                        <IconButton size="small" onClick={() => handleViewIncident(incident.id)}>
                          <ViewIcon />
                        </IconButton>
                      </Tooltip>
                      {incident.status === 'new' && (
                        <Tooltip title="Start Investigation">
                          <IconButton size="small" onClick={() => handleUpdateStatus(incident.id, 'investigating')}>
                            <PlayArrowIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* View Incident Dialog */}
      {selectedIncident && (
        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
          <DialogTitle>
            {selectedIncident.title}
            <Chip label={selectedIncident.severity} color={getSeverityColor(selectedIncident.severity)} sx={{ ml: 1 }} />
            <Chip label={selectedIncident.status} color={getStatusColor(selectedIncident.status)} sx={{ ml: 1 }} />
          </DialogTitle>
          <DialogContent>
            <Typography variant="body1" paragraph>{selectedIncident.description}</Typography>
            
            <Divider sx={{ my: 2 }} />
            
            <Typography variant="h6" gutterBottom>Timeline</Typography>
            {selectedIncident.timeline?.map((event, idx) => (
              <Box key={idx} sx={{ display: 'flex', gap: 2, mb: 2 }}>
                <TimelineIcon color="action" />
                <Box>
                  <Typography variant="body2" fontWeight="medium">{event.event_data?.message}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {dayjs(event.created_at).format('MMM D, YYYY HH:mm')}
                    {event.username && ` by ${event.username}`}
                  </Typography>
                </Box>
              </Box>
            ))}

            <Divider sx={{ my: 2 }} />

            <Typography variant="h6" gutterBottom>Actions</Typography>
            <Stack direction="row" spacing={2} flexWrap="wrap">
              {selectedIncident.status === 'new' && (
                <Button variant="outlined" startIcon={<PlayArrowIcon />} onClick={() => handleUpdateStatus(selectedIncident.id, 'investigating')}>
                  Start Investigation
                </Button>
              )}
              {selectedIncident.status === 'investigating' && (
                <>
                  <Button variant="outlined" startIcon={<CheckCircleIcon />} onClick={() => handleUpdateStatus(selectedIncident.id, 'contained')}>
                    Contain
                  </Button>
                  <Button variant="outlined" startIcon={<PlayArrowIcon />} onClick={() => handleExecutePlaybook(selectedIncident.id, 'compromised-account')}>
                    Run Playbook
                  </Button>
                </>
              )}
              {selectedIncident.status === 'contained' && (
                <Button variant="outlined" startIcon={<CheckCircleIcon />} onClick={() => handleUpdateStatus(selectedIncident.id, 'resolved')}>
                  Resolve
                </Button>
              )}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDialogOpen(false)}>Close</Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Create Incident Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)}>
        <DialogTitle>Create New Incident</DialogTitle>
        <DialogContent sx={{ minWidth: 400, pt: 2 }}>
          <TextField
            fullWidth
            label="Title"
            value={newIncident.title}
            onChange={(e) => setNewIncident({ ...newIncident, title: e.target.value })}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Description"
            multiline
            rows={4}
            value={newIncident.description}
            onChange={(e) => setNewIncident({ ...newIncident, description: e.target.value })}
            sx={{ mb: 2 }}
          />
          <FormControl fullWidth>
            <InputLabel>Severity</InputLabel>
            <Select
              value={newIncident.severity}
              label="Severity"
              onChange={(e) => setNewIncident({ ...newIncident, severity: e.target.value })}
            >
              <MenuItem value="low">Low</MenuItem>
              <MenuItem value="medium">Medium</MenuItem>
              <MenuItem value="high">High</MenuItem>
              <MenuItem value="critical">Critical</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateIncident}>Create</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Incidents;
