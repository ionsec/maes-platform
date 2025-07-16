import React, { useState, useEffect } from 'react'
import {
  Box,
  Container,
  Paper,
  Typography,
  Card,
  CardContent,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Grid,
  Switch,
  FormControlLabel,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip
} from '@mui/material'
import {
  Security,
  Save,
  Science,
  Add,
  Edit,
  Delete,
  CheckCircle,
  Warning,
  Info,
  Send,
  Settings,
  CloudUpload,
  Assessment,
  Download
} from '@mui/icons-material'
import { useForm, Controller } from 'react-hook-form'
import { useSnackbar } from 'notistack'
import axios from '../utils/axios'

const SIEMConfiguration = () => {
  const [configurations, setConfigurations] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingConfig, setEditingConfig] = useState(null)
  const [testResults, setTestResults] = useState({})
  const { enqueueSnackbar } = useSnackbar()

  const { control, handleSubmit, reset, watch, setValue } = useForm({
    defaultValues: {
      name: '',
      type: 'splunk',
      endpoint: '',
      apiKey: '',
      username: '',
      password: '',
      format: 'json',
      enabled: true,
      exportFrequency: 'manual',
      filters: {
        severity: ['medium', 'high', 'critical'],
        eventTypes: [],
        dateRange: 30
      }
    }
  })

  const siemTypes = [
    { value: 'splunk', label: 'Splunk', icon: '📊' },
    { value: 'qradar', label: 'IBM QRadar', icon: '🔍' },
    { value: 'elasticsearch', label: 'Elasticsearch', icon: '🔎' },
    { value: 'generic', label: 'Generic REST API', icon: '🌐' }
  ]

  const exportFormats = [
    { value: 'json', label: 'JSON' },
    { value: 'cef', label: 'CEF (Common Event Format)' },
    { value: 'xml', label: 'XML' },
    { value: 'csv', label: 'CSV' }
  ]

  const exportFrequencies = [
    { value: 'manual', label: 'Manual Export' },
    { value: 'hourly', label: 'Every Hour' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' }
  ]

  const severityLevels = [
    { value: 'low', label: 'Low', color: 'info' },
    { value: 'medium', label: 'Medium', color: 'warning' },
    { value: 'high', label: 'High', color: 'error' },
    { value: 'critical', label: 'Critical', color: 'error' }
  ]

  useEffect(() => {
    fetchConfigurations()
  }, [])

  const fetchConfigurations = async () => {
    try {
      const response = await axios.get('/api/siem/configurations')
      setConfigurations(response.data.configurations || [])
    } catch (error) {
      console.error('Failed to fetch SIEM configurations:', error)
    }
  }

  const onSubmit = async (data) => {
    setLoading(true)
    try {
      const endpoint = editingConfig 
        ? `/api/siem/configurations/${editingConfig.id}`
        : '/api/siem/configurations'
      
      const method = editingConfig ? 'put' : 'post'
      
      await axios[method](endpoint, data)
      
      enqueueSnackbar(
        editingConfig ? 'SIEM configuration updated' : 'SIEM configuration created',
        { variant: 'success' }
      )
      
      setDialogOpen(false)
      reset()
      setEditingConfig(null)
      fetchConfigurations()
    } catch (error) {
      enqueueSnackbar(
        error.response?.data?.error || 'Failed to save configuration',
        { variant: 'error' }
      )
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = (config) => {
    setEditingConfig(config)
    reset(config)
    setDialogOpen(true)
  }

  const handleDelete = async (configId) => {
    if (!window.confirm('Are you sure you want to delete this configuration?')) {
      return
    }

    try {
      await axios.delete(`/api/siem/configurations/${configId}`)
      enqueueSnackbar('Configuration deleted', { variant: 'success' })
      fetchConfigurations()
    } catch (error) {
      enqueueSnackbar('Failed to delete configuration', { variant: 'error' })
    }
  }

  const handleTest = async (config) => {
    setLoading(true)
    try {
      const response = await axios.post(`/api/siem/configurations/${config.id}/test`)
      setTestResults({
        ...testResults,
        [config.id]: { success: true, message: 'Connection successful' }
      })
      enqueueSnackbar('Test successful', { variant: 'success' })
    } catch (error) {
      setTestResults({
        ...testResults,
        [config.id]: { 
          success: false, 
          message: error.response?.data?.error || 'Test failed' 
        }
      })
      enqueueSnackbar('Test failed', { variant: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async (config) => {
    try {
      const response = await axios.post(`/api/siem/configurations/${config.id}/export`)
      enqueueSnackbar(
        `Exported ${response.data.eventCount} events to ${config.name}`,
        { variant: 'success' }
      )
    } catch (error) {
      enqueueSnackbar('Export failed', { variant: 'error' })
    }
  }

  const selectedType = watch('type')

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Paper sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Box>
              <Typography variant="h4" gutterBottom>
                <Security sx={{ mr: 1, verticalAlign: 'middle' }} />
                SIEM Integration
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Configure external SIEM systems to receive MAES security events and analysis results
              </Typography>
            </Box>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => {
                setEditingConfig(null)
                reset()
                setDialogOpen(true)
              }}
            >
              Add SIEM Configuration
            </Button>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          {success && (
            <Alert severity="success" sx={{ mb: 3 }}>
              {success}
            </Alert>
          )}

          {/* Overview Cards */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={12} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="h6" color="primary">
                    {configurations.length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total Configurations
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="h6" color="success.main">
                    {configurations.filter(c => c.enabled).length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Active Integrations
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="h6" color="info.main">
                    {configurations.filter(c => c.exportFrequency !== 'manual').length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Automated Exports
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="h6" color="warning.main">
                    {Object.values(testResults).filter(r => !r.success).length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Failed Tests
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Configurations Table */}
          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Endpoint</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Export Frequency</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {configurations.map((config) => (
                  <TableRow key={config.id}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Typography variant="body1" sx={{ mr: 1 }}>
                          {siemTypes.find(t => t.value === config.type)?.icon}
                        </Typography>
                        <Typography variant="body1">{config.name}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={siemTypes.find(t => t.value === config.type)?.label || config.type}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {config.endpoint}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={config.enabled ? 'Enabled' : 'Disabled'}
                        color={config.enabled ? 'success' : 'default'}
                        size="small"
                      />
                      {testResults[config.id] && (
                        <Chip 
                          label={testResults[config.id].success ? 'Test OK' : 'Test Failed'}
                          color={testResults[config.id].success ? 'success' : 'error'}
                          size="small"
                          sx={{ ml: 1 }}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {exportFrequencies.find(f => f.value === config.exportFrequency)?.label}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Tooltip title="Test Connection">
                        <IconButton 
                          size="small" 
                          onClick={() => handleTest(config)}
                          disabled={loading}
                        >
                          <Science />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Export Now">
                        <IconButton 
                          size="small" 
                          onClick={() => handleExport(config)}
                          disabled={!config.enabled}
                        >
                          <Send />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Edit">
                        <IconButton 
                          size="small" 
                          onClick={() => handleEdit(config)}
                        >
                          <Edit />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton 
                          size="small" 
                          onClick={() => handleDelete(config.id)}
                        >
                          <Delete />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
                {configurations.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      <Typography variant="body2" color="text.secondary">
                        No SIEM configurations found. Click "Add SIEM Configuration" to get started.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        {/* Configuration Dialog */}
        <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="md" fullWidth>
          <form onSubmit={handleSubmit(onSubmit)}>
            <DialogTitle>
              {editingConfig ? 'Edit SIEM Configuration' : 'Add SIEM Configuration'}
            </DialogTitle>
            <DialogContent>
              <Grid container spacing={3} sx={{ mt: 1 }}>
                <Grid item xs={12} md={6}>
                  <Controller
                    name="name"
                    control={control}
                    rules={{ required: 'Name is required' }}
                    render={({ field, fieldState }) => (
                      <TextField
                        {...field}
                        label="Configuration Name"
                        fullWidth
                        error={!!fieldState.error}
                        helperText={fieldState.error?.message}
                      />
                    )}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <Controller
                    name="type"
                    control={control}
                    render={({ field }) => (
                      <FormControl fullWidth>
                        <InputLabel>SIEM Type</InputLabel>
                        <Select {...field} label="SIEM Type">
                          {siemTypes.map((type) => (
                            <MenuItem key={type.value} value={type.value}>
                              {type.icon} {type.label}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}
                  />
                </Grid>
                <Grid item xs={12}>
                  <Controller
                    name="endpoint"
                    control={control}
                    rules={{ required: 'Endpoint is required' }}
                    render={({ field, fieldState }) => (
                      <TextField
                        {...field}
                        label="Endpoint URL"
                        fullWidth
                        placeholder="https://your-siem.example.com/api/events"
                        error={!!fieldState.error}
                        helperText={fieldState.error?.message}
                      />
                    )}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <Controller
                    name="apiKey"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label="API Key"
                        type="password"
                        fullWidth
                        placeholder="Optional - for API key authentication"
                      />
                    )}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <Controller
                    name="format"
                    control={control}
                    render={({ field }) => (
                      <FormControl fullWidth>
                        <InputLabel>Export Format</InputLabel>
                        <Select {...field} label="Export Format">
                          {exportFormats.map((format) => (
                            <MenuItem key={format.value} value={format.value}>
                              {format.label}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <Controller
                    name="exportFrequency"
                    control={control}
                    render={({ field }) => (
                      <FormControl fullWidth>
                        <InputLabel>Export Frequency</InputLabel>
                        <Select {...field} label="Export Frequency">
                          {exportFrequencies.map((freq) => (
                            <MenuItem key={freq.value} value={freq.value}>
                              {freq.label}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}
                  />
                </Grid>
                <Grid item xs={12} md={6}>
                  <Controller
                    name="enabled"
                    control={control}
                    render={({ field }) => (
                      <FormControlLabel
                        control={<Switch {...field} checked={field.value} />}
                        label="Enable Configuration"
                      />
                    )}
                  />
                </Grid>
              </Grid>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" variant="contained" disabled={loading}>
                {loading ? 'Saving...' : 'Save Configuration'}
              </Button>
            </DialogActions>
          </form>
        </Dialog>
      </Box>
    </Container>
  )
}

export default SIEMConfiguration