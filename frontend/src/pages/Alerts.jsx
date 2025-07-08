import React, { useState, useEffect, useCallback } from 'react';
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
  Alert as MuiAlert,
  Tabs,
  Tab,
  Badge,
  Avatar,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  Divider,
  AccordionSummary,
  AccordionDetails,
  Accordion,
  Pagination,
  Menu,
  MenuItem as MenuItemComponent,
  Checkbox,
  Toolbar,
  Tooltip,
  Fade,
  Collapse
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Visibility as ViewIcon,
  Check as CheckIcon,
  Assignment as AssignIcon,
  Close as CloseIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  Security as SecurityIcon,
  ExpandMore as ExpandMoreIcon,
  Delete as DeleteIcon,
  MoreVert as MoreVertIcon,
  SelectAll as SelectAllIcon
} from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { useSnackbar } from 'notistack';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import axios from '../utils/axios';

dayjs.extend(relativeTime);

const severityColors = {
  low: 'success',
  medium: 'warning',
  high: 'error',
  critical: 'error'
};

const severityIcons = {
  low: <InfoIcon />,
  medium: <WarningIcon />,
  high: <ErrorIcon />,
  critical: <SecurityIcon />
};

const statusColors = {
  new: 'error',
  acknowledged: 'warning',
  investigating: 'info',
  resolved: 'success',
  false_positive: 'default'
};

const categories = [
  'authentication',
  'authorization', 
  'data_access',
  'configuration_change',
  'suspicious_activity',
  'malware',
  'policy_violation',
  'system_health',
  'other'
];

const Alerts = () => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [tabValue, setTabValue] = useState(0);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1, limit: 20 });
  const [anchorEl, setAnchorEl] = useState(null);
  const [menuAlert, setMenuAlert] = useState(null);
  const [selectedAlerts, setSelectedAlerts] = useState([]);
  const [bulkActionOpen, setBulkActionOpen] = useState(null);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [bulkResolveDialogOpen, setBulkResolveDialogOpen] = useState(false);
  const { control, handleSubmit, reset } = useForm();
  const { enqueueSnackbar } = useSnackbar();

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== 'all') params.append('status', filterStatus);
      if (filterSeverity !== 'all') params.append('severity', filterSeverity);
      params.append('limit', '20'); // Show 20 alerts per page
      params.append('page', page.toString());
      
      const response = await axios.get(`/api/alerts?${params}`);
      setAlerts(response.data.alerts || []);
      setPagination(response.data.pagination || { total: 0, pages: 1, limit: 20 });
    } catch (error) {
      enqueueSnackbar('Failed to fetch alerts', { variant: 'error' });
      console.error('Fetch alerts error:', error);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterSeverity, page, enqueueSnackbar]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  useEffect(() => {
    const interval = setInterval(fetchAlerts, 10000);
    return () => clearInterval(interval);
  }, []);

  const acknowledgeAlert = async (id) => {
    try {
      await axios.put(`/api/alerts/${id}/acknowledge`);
      enqueueSnackbar('Alert acknowledged', { variant: 'success' });
      fetchAlerts();
    } catch (error) {
      enqueueSnackbar('Failed to acknowledge alert', { variant: 'error' });
    }
  };

  const assignAlert = async (data) => {
    try {
      await axios.put(`/api/alerts/${selectedAlert.id}/assign`, data);
      enqueueSnackbar('Alert assigned successfully', { variant: 'success' });
      setAssignDialogOpen(false);
      setSelectedAlert(null);
      reset();
      fetchAlerts();
    } catch (error) {
      enqueueSnackbar('Failed to assign alert', { variant: 'error' });
    }
  };

  const resolveAlert = async (data) => {
    try {
      await axios.put(`/api/alerts/${selectedAlert.id}/resolve`, data);
      enqueueSnackbar('Alert resolved successfully', { variant: 'success' });
      setResolveDialogOpen(false);
      setSelectedAlert(null);
      reset();
      fetchAlerts();
    } catch (error) {
      enqueueSnackbar('Failed to resolve alert', { variant: 'error' });
    }
  };

  const deleteAlert = async () => {
    try {
      await axios.delete(`/api/alerts/${selectedAlert.id}`);
      enqueueSnackbar('Alert deleted successfully', { variant: 'success' });
      setDeleteDialogOpen(false);
      setSelectedAlert(null);
      fetchAlerts();
    } catch (error) {
      enqueueSnackbar('Failed to delete alert', { variant: 'error' });
    }
  };

  const handleMenuClick = (event, alert) => {
    setAnchorEl(event.currentTarget);
    setMenuAlert(alert);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setMenuAlert(null);
  };

  const handlePageChange = (event, value) => {
    setPage(value);
    setSelectedAlerts([]); // Clear selection when changing pages
  };

  const handleSelectAll = (event) => {
    if (event.target.checked) {
      const allIds = filteredAlerts.map((alert) => alert.id);
      setSelectedAlerts(allIds);
    } else {
      setSelectedAlerts([]);
    }
  };

  const handleSelectAlert = (alertId) => {
    setSelectedAlerts(prev => 
      prev.includes(alertId) 
        ? prev.filter(id => id !== alertId)
        : [...prev, alertId]
    );
  };

  const handleBulkAction = (event) => {
    setBulkActionOpen(event.currentTarget);
  };

  const handleBulkActionClose = () => {
    setBulkActionOpen(null);
  };

  const bulkDeleteAlerts = async () => {
    try {
      await Promise.all(selectedAlerts.map(id => axios.delete(`/api/alerts/${id}`)));
      enqueueSnackbar(`${selectedAlerts.length} alerts deleted successfully`, { variant: 'success' });
      setSelectedAlerts([]);
      setBulkDeleteDialogOpen(false);
      fetchAlerts();
    } catch (error) {
      enqueueSnackbar('Failed to delete some alerts', { variant: 'error' });
    }
  };

  const bulkResolveAlerts = async (data) => {
    try {
      await Promise.all(selectedAlerts.map(id => 
        axios.put(`/api/alerts/${id}/resolve`, data)
      ));
      enqueueSnackbar(`${selectedAlerts.length} alerts resolved successfully`, { variant: 'success' });
      setSelectedAlerts([]);
      setBulkResolveDialogOpen(false);
      reset();
      fetchAlerts();
    } catch (error) {
      enqueueSnackbar('Failed to resolve some alerts', { variant: 'error' });
    }
  };

  const bulkAcknowledgeAlerts = async () => {
    try {
      await Promise.all(selectedAlerts.map(id => 
        axios.put(`/api/alerts/${id}/acknowledge`)
      ));
      enqueueSnackbar(`${selectedAlerts.length} alerts acknowledged successfully`, { variant: 'success' });
      setSelectedAlerts([]);
      handleBulkActionClose();
      fetchAlerts();
    } catch (error) {
      enqueueSnackbar('Failed to acknowledge some alerts', { variant: 'error' });
    }
  };

  const getAlertsByStatus = (status) => {
    return alerts.filter(alert => status === 'all' ? true : alert.status === status);
  };

  const getAlertCounts = () => {
    return {
      all: pagination?.total || 0,
      new: alerts.filter(a => a.status === 'new').length,
      acknowledged: alerts.filter(a => a.status === 'acknowledged').length,
      investigating: alerts.filter(a => a.status === 'investigating').length,
      resolved: alerts.filter(a => a.status === 'resolved').length
    };
  };

  const filteredAlerts = alerts.filter(alert => {
    if (filterStatus !== 'all' && alert.status !== filterStatus) return false;
    if (filterSeverity !== 'all' && alert.severity !== filterSeverity) return false;
    return true;
  });

  const counts = getAlertCounts();

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Security Alerts</Typography>
        <IconButton onClick={fetchAlerts} disabled={loading}>
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* Alert Statistics */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={2.4}>
          <Card>
            <CardContent>
              <Typography variant="h6" color="primary">
                {counts.all}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total Alerts
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={2.4}>
          <Card>
            <CardContent>
              <Typography variant="h6" color="error.main">
                {counts.new}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                New
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={2.4}>
          <Card>
            <CardContent>
              <Typography variant="h6" color="warning.main">
                {counts.acknowledged}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Acknowledged
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={2.4}>
          <Card>
            <CardContent>
              <Typography variant="h6" color="info.main">
                {counts.investigating}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Investigating
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={2.4}>
          <Card>
            <CardContent>
              <Typography variant="h6" color="success.main">
                {counts.resolved}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Resolved
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Box sx={{ mb: 3, display: 'flex', gap: 2 }}>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Status</InputLabel>
          <Select
            value={filterStatus}
            label="Status"
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setPage(1);
            }}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="new">New</MenuItem>
            <MenuItem value="acknowledged">Acknowledged</MenuItem>
            <MenuItem value="investigating">Investigating</MenuItem>
            <MenuItem value="resolved">Resolved</MenuItem>
            <MenuItem value="false_positive">False Positive</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Severity</InputLabel>
          <Select
            value={filterSeverity}
            label="Severity"
            onChange={(e) => {
              setFilterSeverity(e.target.value);
              setPage(1);
            }}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="critical">Critical</MenuItem>
            <MenuItem value="high">High</MenuItem>
            <MenuItem value="medium">Medium</MenuItem>
            <MenuItem value="low">Low</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Bulk Actions Toolbar */}
      <Collapse in={selectedAlerts.length > 0}>
        <Toolbar
          sx={{
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            borderRadius: 1,
            mb: 2
          }}
        >
          <Typography variant="h6" sx={{ flex: 1 }}>
            {selectedAlerts.length} alert{selectedAlerts.length > 1 ? 's' : ''} selected
          </Typography>
          <Tooltip title="Bulk Actions">
            <IconButton color="inherit" onClick={handleBulkAction}>
              <MoreVertIcon />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </Collapse>

      {/* Alerts Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  indeterminate={selectedAlerts.length > 0 && selectedAlerts.length < filteredAlerts.length}
                  checked={filteredAlerts.length > 0 && selectedAlerts.length === filteredAlerts.length}
                  onChange={handleSelectAll}
                />
              </TableCell>
              <TableCell>Severity</TableCell>
              <TableCell>Alert</TableCell>
              <TableCell>Category</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Created</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredAlerts.map((alert) => (
              <TableRow key={alert.id} selected={selectedAlerts.includes(alert.id)}>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={selectedAlerts.includes(alert.id)}
                    onChange={() => handleSelectAlert(alert.id)}
                  />
                </TableCell>
                <TableCell>
                  <Chip
                    icon={severityIcons[alert.severity]}
                    label={alert.severity.toUpperCase()}
                    color={severityColors[alert.severity]}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight="bold">
                    {alert.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {alert.description.substring(0, 100)}...
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip 
                    label={alert.category.replace('_', ' ')} 
                    variant="outlined"
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Chip 
                    label={alert.status.replace('_', ' ')} 
                    color={statusColors[alert.status]}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {dayjs(alert.createdAt).format('MMM DD, HH:mm')}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {dayjs(alert.createdAt).fromNow()}
                  </Typography>
                </TableCell>
                <TableCell>
                  <IconButton 
                    size="small" 
                    onClick={() => setSelectedAlert(alert)}
                    title="View Details"
                  >
                    <ViewIcon />
                  </IconButton>
                  {alert.status === 'new' && (
                    <IconButton 
                      size="small" 
                      onClick={() => acknowledgeAlert(alert.id)}
                      title="Acknowledge"
                    >
                      <CheckIcon />
                    </IconButton>
                  )}
                  <IconButton 
                    size="small" 
                    onClick={(event) => handleMenuClick(event, alert)}
                    title="More actions"
                  >
                    <MoreVertIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {filteredAlerts.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  <Typography variant="body2" color="text.secondary">
                    No alerts found matching the current filters.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination Debug */}
      {pagination && (
        <Box sx={{ textAlign: 'center', mt: 2, mb: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Page {page} of {pagination.pages || 1} (Total: {pagination.total || 0} alerts)
          </Typography>
        </Box>
      )}

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1, mb: 2 }}>
          <Pagination
            count={pagination.pages}
            page={page}
            onChange={handlePageChange}
            color="primary"
            showFirstButton
            showLastButton
            size="large"
          />
        </Box>
      )}

      {/* Action Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        {!['resolved', 'false_positive'].includes(menuAlert?.status) && (
          <MenuItemComponent
            onClick={() => {
              setSelectedAlert(menuAlert);
              setAssignDialogOpen(true);
              handleMenuClose();
            }}
          >
            <AssignIcon sx={{ mr: 1 }} /> Assign
          </MenuItemComponent>
        )}
        {!['resolved', 'false_positive'].includes(menuAlert?.status) && (
          <MenuItemComponent
            onClick={() => {
              setSelectedAlert(menuAlert);
              setResolveDialogOpen(true);
              handleMenuClose();
            }}
          >
            <CloseIcon sx={{ mr: 1 }} /> Resolve
          </MenuItemComponent>
        )}
        <MenuItemComponent
          onClick={() => {
            setSelectedAlert(menuAlert);
            setDeleteDialogOpen(true);
            handleMenuClose();
          }}
          sx={{ color: 'error.main' }}
        >
          <DeleteIcon sx={{ mr: 1 }} /> Delete
        </MenuItemComponent>
      </Menu>

      {/* Bulk Action Menu */}
      <Menu
        anchorEl={bulkActionOpen}
        open={Boolean(bulkActionOpen)}
        onClose={handleBulkActionClose}
      >
        <MenuItemComponent
          onClick={() => {
            bulkAcknowledgeAlerts();
          }}
        >
          <CheckIcon sx={{ mr: 1 }} /> Acknowledge Selected
        </MenuItemComponent>
        <MenuItemComponent
          onClick={() => {
            setBulkResolveDialogOpen(true);
            handleBulkActionClose();
          }}
        >
          <CloseIcon sx={{ mr: 1 }} /> Resolve Selected
        </MenuItemComponent>
        <MenuItemComponent
          onClick={() => {
            setBulkDeleteDialogOpen(true);
            handleBulkActionClose();
          }}
          sx={{ color: 'error.main' }}
        >
          <DeleteIcon sx={{ mr: 1 }} /> Delete Selected
        </MenuItemComponent>
      </Menu>

      {/* Alert Details Dialog */}
      {selectedAlert && !assignDialogOpen && !resolveDialogOpen && (
        <Dialog 
          open={Boolean(selectedAlert)} 
          onClose={() => setSelectedAlert(null)}
          maxWidth="md" 
          fullWidth
        >
          <DialogTitle>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Chip
                icon={severityIcons[selectedAlert.severity]}
                label={selectedAlert.severity.toUpperCase()}
                color={severityColors[selectedAlert.severity]}
              />
              <Typography variant="h6" component="span">
                {selectedAlert.title}
              </Typography>
            </Box>
          </DialogTitle>
          <DialogContent>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography variant="body1" gutterBottom>
                  {selectedAlert.description}
                </Typography>
              </Grid>

              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" gutterBottom>Status</Typography>
                <Chip 
                  label={selectedAlert.status.replace('_', ' ')} 
                  color={statusColors[selectedAlert.status]}
                />
              </Grid>

              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" gutterBottom>Category</Typography>
                <Chip 
                  label={selectedAlert.category.replace('_', ' ')} 
                  variant="outlined"
                />
              </Grid>

              {/* Affected Entities */}
              {selectedAlert.affectedEntities && (
                <Grid item xs={12}>
                  <Accordion>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography variant="subtitle2">Affected Entities</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      {selectedAlert.affectedEntities.users?.length > 0 && (
                        <Box sx={{ mb: 2 }}>
                          <Typography variant="body2" fontWeight="bold">Users:</Typography>
                          <List dense>
                            {selectedAlert.affectedEntities.users.map((user, index) => (
                              <ListItem key={index}>
                                <ListItemAvatar>
                                  <Avatar sx={{ width: 24, height: 24 }}>{user[0]}</Avatar>
                                </ListItemAvatar>
                                <ListItemText primary={user} />
                              </ListItem>
                            ))}
                          </List>
                        </Box>
                      )}
                      {selectedAlert.affectedEntities.ipAddresses?.length > 0 && (
                        <Box sx={{ mb: 2 }}>
                          <Typography variant="body2" fontWeight="bold">IP Addresses:</Typography>
                          <Typography variant="body2">
                            {selectedAlert.affectedEntities.ipAddresses.join(', ')}
                          </Typography>
                        </Box>
                      )}
                      {selectedAlert.affectedEntities.applications?.length > 0 && (
                        <Box>
                          <Typography variant="body2" fontWeight="bold">Applications:</Typography>
                          <Typography variant="body2">
                            {selectedAlert.affectedEntities.applications.join(', ')}
                          </Typography>
                        </Box>
                      )}
                    </AccordionDetails>
                  </Accordion>
                </Grid>
              )}

              {/* MITRE ATT&CK */}
              {selectedAlert.mitreAttack && (
                <Grid item xs={12}>
                  <Accordion>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Typography variant="subtitle2">MITRE ATT&CK Mapping</Typography>
                    </AccordionSummary>
                    <AccordionDetails>
                      {selectedAlert.mitreAttack.tactics?.length > 0 && (
                        <Box sx={{ mb: 1 }}>
                          <Typography variant="body2" fontWeight="bold">Tactics:</Typography>
                          <Typography variant="body2">
                            {selectedAlert.mitreAttack.tactics.join(', ')}
                          </Typography>
                        </Box>
                      )}
                      {selectedAlert.mitreAttack.techniques?.length > 0 && (
                        <Box>
                          <Typography variant="body2" fontWeight="bold">Techniques:</Typography>
                          <Typography variant="body2">
                            {selectedAlert.mitreAttack.techniques.join(', ')}
                          </Typography>
                        </Box>
                      )}
                    </AccordionDetails>
                  </Accordion>
                </Grid>
              )}

              {/* Recommendations */}
              {selectedAlert.recommendations?.length > 0 && (
                <Grid item xs={12}>
                  <Typography variant="subtitle2" gutterBottom>Recommendations</Typography>
                  <List dense>
                    {selectedAlert.recommendations.map((rec, index) => (
                      <ListItem key={index}>
                        <ListItemText primary={rec} />
                      </ListItem>
                    ))}
                  </List>
                </Grid>
              )}

              <Grid item xs={12}>
                <Typography variant="caption" color="text.secondary">
                  Created: {dayjs(selectedAlert.createdAt).format('MMMM DD, YYYY [at] HH:mm')}
                </Typography>
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSelectedAlert(null)}>Close</Button>
            {selectedAlert.status === 'new' && (
              <Button 
                variant="outlined" 
                onClick={() => acknowledgeAlert(selectedAlert.id)}
              >
                Acknowledge
              </Button>
            )}
            {!['resolved', 'false_positive'].includes(selectedAlert.status) && (
              <Button 
                variant="contained" 
                onClick={() => setResolveDialogOpen(true)}
              >
                Resolve
              </Button>
            )}
          </DialogActions>
        </Dialog>
      )}

      {/* Assign Dialog */}
      <Dialog open={assignDialogOpen} onClose={() => setAssignDialogOpen(false)}>
        <form onSubmit={handleSubmit(assignAlert)}>
          <DialogTitle>Assign Alert</DialogTitle>
          <DialogContent>
            <Controller
              name="assignedTo"
              control={control}
              rules={{ required: 'Please select a user' }}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  fullWidth
                  label="Assign to User ID"
                  error={fieldState.invalid}
                  helperText={fieldState.error?.message}
                  sx={{ mt: 2 }}
                />
              )}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setAssignDialogOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained">Assign</Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Resolve Dialog */}
      <Dialog open={resolveDialogOpen} onClose={() => setResolveDialogOpen(false)}>
        <form onSubmit={handleSubmit(resolveAlert)}>
          <DialogTitle>Resolve Alert</DialogTitle>
          <DialogContent>
            <Controller
              name="status"
              control={control}
              defaultValue="resolved"
              render={({ field }) => (
                <FormControl fullWidth sx={{ mt: 2, mb: 2 }}>
                  <InputLabel>Resolution Status</InputLabel>
                  <Select {...field} label="Resolution Status">
                    <MenuItem value="resolved">Resolved</MenuItem>
                    <MenuItem value="false_positive">False Positive</MenuItem>
                  </Select>
                </FormControl>
              )}
            />
            <Controller
              name="resolutionNotes"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  fullWidth
                  multiline
                  rows={3}
                  label="Resolution Notes"
                  placeholder="Describe the resolution or why this is a false positive..."
                />
              )}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setResolveDialogOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained">Resolve</Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Alert</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this alert? This action cannot be undone.
          </Typography>
          {selectedAlert && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
              <Typography variant="body2" fontWeight="bold">
                {selectedAlert.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {selectedAlert.description.substring(0, 100)}...
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={deleteAlert} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={bulkDeleteDialogOpen} onClose={() => setBulkDeleteDialogOpen(false)}>
        <DialogTitle>Delete Multiple Alerts</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete {selectedAlerts.length} alert{selectedAlerts.length > 1 ? 's' : ''}? This action cannot be undone.
          </Typography>
          <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
            <Typography variant="body2" fontWeight="bold">
              {selectedAlerts.length} alert{selectedAlerts.length > 1 ? 's' : ''} selected for deletion
            </Typography>
            <Typography variant="body2" color="text.secondary">
              This will permanently remove all selected alerts from the system.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBulkDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={bulkDeleteAlerts} color="error" variant="contained">
            Delete {selectedAlerts.length} Alert{selectedAlerts.length > 1 ? 's' : ''}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Resolve Dialog */}
      <Dialog open={bulkResolveDialogOpen} onClose={() => setBulkResolveDialogOpen(false)}>
        <form onSubmit={handleSubmit(bulkResolveAlerts)}>
          <DialogTitle>Resolve Multiple Alerts</DialogTitle>
          <DialogContent>
            <Typography gutterBottom>
              Resolve {selectedAlerts.length} alert{selectedAlerts.length > 1 ? 's' : ''}
            </Typography>
            <Controller
              name="status"
              control={control}
              defaultValue="resolved"
              render={({ field }) => (
                <FormControl fullWidth sx={{ mt: 2, mb: 2 }}>
                  <InputLabel>Resolution Status</InputLabel>
                  <Select {...field} label="Resolution Status">
                    <MenuItem value="resolved">Resolved</MenuItem>
                    <MenuItem value="false_positive">False Positive</MenuItem>
                  </Select>
                </FormControl>
              )}
            />
            <Controller
              name="resolutionNotes"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  fullWidth
                  multiline
                  rows={3}
                  label="Resolution Notes"
                  placeholder="Describe the resolution or why these are false positives..."
                />
              )}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setBulkResolveDialogOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained">
              Resolve {selectedAlerts.length} Alert{selectedAlerts.length > 1 ? 's' : ''}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
};

export default Alerts;