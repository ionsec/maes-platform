import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Fab,
  Tooltip,
  Badge,
  Tabs,
  Tab,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  Assignment as AssignmentIcon,
  Warning as WarningIcon,
  CheckCircle as ResolvedIcon,
  Schedule as PendingIcon,
  ExpandMore as ExpandMoreIcon,
  Security as SecurityIcon,
  Person as PersonIcon,
  Email as EmailIcon,
  Phone as PhoneIcon,
  Description as DescriptionIcon,
  AttachFile as AttachFileIcon,
  Timeline as TimelineIcon,
  Assessment as AssessmentIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import axios from '../utils/axios';

const Incidents = () => {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    severity: 'medium',
    category: 'security',
    affectedEntities: '',
    initialAssessment: '',
    assignedTo: '',
    priority: 'medium'
  });
  const { enqueueSnackbar } = useSnackbar();

  useEffect(() => {
    fetchIncidents();
  }, []);

  const fetchIncidents = async () => {
    try {
      const response = await axios.get('/api/incidents');
      setIncidents(response.data.incidents);
    } catch (error) {
      enqueueSnackbar('Failed to fetch incidents', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateIncident = async () => {
    try {
      await axios.post('/api/incidents', formData);
      enqueueSnackbar('Incident created successfully', { variant: 'success' });
      setDialogOpen(false);
      setFormData({
        title: '',
        description: '',
        severity: 'medium',
        category: 'security',
        affectedEntities: '',
        initialAssessment: '',
        assignedTo: '',
        priority: 'medium'
      });
      fetchIncidents();
    } catch (error) {
      enqueueSnackbar(error.response?.data?.error || 'Failed to create incident', { variant: 'error' });
    }
  };

  const handleUpdateStatus = async (incidentId, status) => {
    try {
      await axios.patch(`/api/incidents/${incidentId}/status`, { status });
      enqueueSnackbar('Incident status updated', { variant: 'success' });
      fetchIncidents();
    } catch (error) {
      enqueueSnackbar('Failed to update incident status', { variant: 'error' });
    }
  };

  const handleAssignIncident = async (incidentId, assignedTo) => {
    try {
      await axios.patch(`/api/incidents/${incidentId}/assign`, { assignedTo });
      enqueueSnackbar('Incident assigned successfully', { variant: 'success' });
      fetchIncidents();
    } catch (error) {
      enqueueSnackbar('Failed to assign incident', { variant: 'error' });
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return 'error';
      case 'high': return 'warning';
      case 'medium': return 'info';
      case 'low': return 'success';
      default: return 'default';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'new': return 'primary';
      case 'investigating': return 'warning';
      case 'contained': return 'info';
      case 'resolved': return 'success';
      case 'closed': return 'default';
      default: return 'default';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'new': return <PendingIcon />;
      case 'investigating': return <AssignmentIcon />;
      case 'contained': return <WarningIcon />;
      case 'resolved': return <ResolvedIcon />;
      case 'closed': return <ResolvedIcon />;
      default: return <PendingIcon />;
    }
  };

  const renderIncidentDetails = (incident) => (
    <Box>
      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h5" gutterBottom>
                {incident.title}
              </Typography>
              <Typography variant="body1" color="text.secondary" paragraph>
                {incident.description}
              </Typography>
              
              <Box sx={{ mb: 2 }}>
                <Typography variant="h6" gutterBottom>Affected Entities</Typography>
                <Typography variant="body2">
                  {incident.affectedEntities || 'Not specified'}
                </Typography>
              </Box>

              <Box sx={{ mb: 2 }}>
                <Typography variant="h6" gutterBottom>Initial Assessment</Typography>
                <Typography variant="body2">
                  {incident.initialAssessment || 'Not provided'}
                </Typography>
              </Box>

              {incident.evidence && incident.evidence.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="h6" gutterBottom>Evidence</Typography>
                  <List dense>
                    {incident.evidence.map((item, index) => (
                      <ListItem key={index}>
                        <ListItemIcon>
                          <AttachFileIcon />
                        </ListItemIcon>
                        <ListItemText
                          primary={item.name}
                          secondary={`Type: ${item.type} | Size: ${item.size}`}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Incident Details</Typography>
              
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" color="text.secondary">Status</Typography>
                <Chip
                  label={incident.status}
                  color={getStatusColor(incident.status)}
                  icon={getStatusIcon(incident.status)}
                  sx={{ mt: 1 }}
                />
              </Box>

              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" color="text.secondary">Severity</Typography>
                <Chip
                  label={incident.severity}
                  color={getSeverityColor(incident.severity)}
                  sx={{ mt: 1 }}
                />
              </Box>

              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" color="text.secondary">Category</Typography>
                <Chip label={incident.category} variant="outlined" sx={{ mt: 1 }} />
              </Box>

              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" color="text.secondary">Priority</Typography>
                <Chip label={incident.priority} variant="outlined" sx={{ mt: 1 }} />
              </Box>

              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" color="text.secondary">Assigned To</Typography>
                <Typography variant="body2">
                  {incident.assignedTo || 'Unassigned'}
                </Typography>
              </Box>

              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" color="text.secondary">Created</Typography>
                <Typography variant="body2">
                  {new Date(incident.createdAt).toLocaleString()}
                </Typography>
              </Box>

              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" color="text.secondary">Last Updated</Typography>
                <Typography variant="body2">
                  {new Date(incident.updatedAt).toLocaleString()}
                </Typography>
              </Box>
            </CardContent>
          </Card>

                     {incident.timeline && incident.timeline.length > 0 && (
             <Card sx={{ mt: 2 }}>
               <CardContent>
                 <Typography variant="h6" gutterBottom>Timeline</Typography>
                 <List>
                   {incident.timeline.map((event, index) => (
                     <ListItem key={index} sx={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                       <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', mb: 1 }}>
                         <Typography variant="subtitle2">{event.action}</Typography>
                         <Typography variant="caption" color="text.secondary">
                           {new Date(event.timestamp).toLocaleString()}
                         </Typography>
                       </Box>
                       <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                         {event.description}
                       </Typography>
                       {event.user && (
                         <Typography variant="caption" color="text.secondary">
                           by {event.user}
                         </Typography>
                       )}
                       {index < incident.timeline.length - 1 && <Divider sx={{ width: '100%', mt: 1 }} />}
                     </ListItem>
                   ))}
                 </List>
               </CardContent>
             </Card>
           )}
        </Grid>
      </Grid>
    </Box>
  );

  const renderIncidentsTable = () => (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Title</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Severity</TableCell>
            <TableCell>Category</TableCell>
            <TableCell>Assigned To</TableCell>
            <TableCell>Created</TableCell>
            <TableCell>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {incidents.map((incident) => (
            <TableRow key={incident.id}>
              <TableCell>
                <Typography variant="subtitle2">{incident.title}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {incident.description.substring(0, 50)}...
                </Typography>
              </TableCell>
              <TableCell>
                <Chip
                  label={incident.status}
                  color={getStatusColor(incident.status)}
                  size="small"
                />
              </TableCell>
              <TableCell>
                <Chip
                  label={incident.severity}
                  color={getSeverityColor(incident.severity)}
                  size="small"
                />
              </TableCell>
              <TableCell>
                <Chip label={incident.category} variant="outlined" size="small" />
              </TableCell>
              <TableCell>
                {incident.assignedTo || 'Unassigned'}
              </TableCell>
              <TableCell>
                {new Date(incident.createdAt).toLocaleDateString()}
              </TableCell>
              <TableCell>
                <IconButton
                  size="small"
                  onClick={() => {
                    setSelectedIncident(incident);
                    setViewDialogOpen(true);
                  }}
                >
                  <ViewIcon />
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => {
                    setSelectedIncident(incident);
                    setDialogOpen(true);
                  }}
                >
                  <EditIcon />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );

  const renderCreateDialog = () => (
    <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
      <DialogTitle>
        {selectedIncident ? 'Edit Incident' : 'Create New Incident'}
      </DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Description"
              multiline
              rows={4}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel>Severity</InputLabel>
              <Select
                value={formData.severity}
                onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                label="Severity"
              >
                <MenuItem value="low">Low</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
                <MenuItem value="high">High</MenuItem>
                <MenuItem value="critical">Critical</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel>Category</InputLabel>
              <Select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                label="Category"
              >
                <MenuItem value="security">Security</MenuItem>
                <MenuItem value="compliance">Compliance</MenuItem>
                <MenuItem value="operational">Operational</MenuItem>
                <MenuItem value="data">Data Breach</MenuItem>
                <MenuItem value="malware">Malware</MenuItem>
                <MenuItem value="phishing">Phishing</MenuItem>
                <MenuItem value="other">Other</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Affected Entities"
              value={formData.affectedEntities}
              onChange={(e) => setFormData({ ...formData, affectedEntities: e.target.value })}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth>
              <InputLabel>Priority</InputLabel>
              <Select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                label="Priority"
              >
                <MenuItem value="low">Low</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
                <MenuItem value="high">High</MenuItem>
                <MenuItem value="urgent">Urgent</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Initial Assessment"
              multiline
              rows={3}
              value={formData.initialAssessment}
              onChange={(e) => setFormData({ ...formData, initialAssessment: e.target.value })}
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
        <Button onClick={handleCreateIncident} variant="contained">
          {selectedIncident ? 'Update' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">
          Incident Response Management
        </Typography>
        <Tooltip title="Create New Incident">
          <Fab
            color="primary"
            onClick={() => {
              setSelectedIncident(null);
              setDialogOpen(true);
            }}
          >
            <AddIcon />
          </Fab>
        </Tooltip>
      </Box>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography variant="h6" color="primary">
                {incidents.filter(i => i.status === 'new').length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                New Incidents
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography variant="h6" color="warning.main">
                {incidents.filter(i => i.status === 'investigating').length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Under Investigation
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography variant="h6" color="info.main">
                {incidents.filter(i => i.status === 'contained').length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Contained
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography variant="h6" color="success.main">
                {incidents.filter(i => i.status === 'resolved').length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Resolved
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)} sx={{ mb: 2 }}>
        <Tab label="All Incidents" />
        <Tab label="Active" />
        <Tab label="Resolved" />
      </Tabs>

      {renderIncidentsTable()}

      {renderCreateDialog()}

      <Dialog
        open={viewDialogOpen}
        onClose={() => setViewDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          Incident Details
          <IconButton
            sx={{ position: 'absolute', right: 8, top: 8 }}
            onClick={() => setViewDialogOpen(false)}
          >
            <DeleteIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {selectedIncident && renderIncidentDetails(selectedIncident)}
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default Incidents; 