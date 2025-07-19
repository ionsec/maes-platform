import React, { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Grid,
  Paper,
  Typography,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Fab
} from '@mui/material'
import {
  CloudDownload,
  Analytics,
  Warning,
  TrendingUp,
  Security,
  Assessment,
  Info as InfoIcon,
  Speed as SpeedIcon,
  Memory as MemoryIcon,
  Storage as StorageIcon,
  Computer as ComputerIcon,
  Timeline as TimelineIcon,
  BugReport as BugReportIcon,
  Refresh as RefreshIcon,
  OpenInNew as OpenInNewIcon,
  Dashboard as MonitoringIcon,
  Edit as EditIcon,
  Save as SaveIcon,
  RestoreFromTrash as ResetIcon
} from '@mui/icons-material'
import { Responsive, WidthProvider } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts'
import axios from '../utils/axios'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { useAlerts } from '../hooks/useAlerts'

dayjs.extend(relativeTime)

const ResponsiveGridLayout = WidthProvider(Responsive)

const Dashboard = () => {
  const { alertStats } = useAlerts()
  const [stats, setStats] = useState({
    extractions: { total: 0, active: 0, completed: 0, failed: 0 },
    analyses: { total: 0, completed: 0, running: 0, failed: 0 },
    alerts: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
    coverage: { services: 0, users: 0, devices: 0 }
  })
  const [systemMetrics, setSystemMetrics] = useState({
    cpu: 0,
    memory: 0,
    disk: 0,
    network: 0
  })
  const [recentJobs, setRecentJobs] = useState([])
  const [recentErrors, setRecentErrors] = useState([])
  const [containerLogs, setContainerLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [infoDialog, setInfoDialog] = useState({ open: false, title: '', content: '' })
  const [logFilter, setLogFilter] = useState('all')
  const [refreshInterval, setRefreshInterval] = useState(30) // seconds
  
  // Layout and customization state
  const [editMode, setEditMode] = useState(false)
  const [layouts, setLayouts] = useState({})
  
  // Default layout configuration
  const defaultLayout = [
    { i: 'cpu-metric', x: 0, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
    { i: 'memory-metric', x: 3, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
    { i: 'jobs-metric', x: 6, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
    { i: 'errors-metric', x: 9, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
    { i: 'monitoring-tools', x: 0, y: 3, w: 12, h: 4, minW: 6, minH: 3 },
    { i: 'recent-jobs', x: 0, y: 7, w: 8, h: 6, minW: 4, minH: 4 },
    { i: 'system-resources', x: 8, y: 7, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'recent-errors', x: 0, y: 13, w: 6, h: 5, minW: 3, minH: 3 },
    { i: 'container-logs', x: 6, y: 13, w: 6, h: 5, minW: 3, minH: 3 },
    { i: 'activity-chart', x: 0, y: 18, w: 12, h: 6, minW: 6, minH: 4 }
  ]

  // Load saved layout from localStorage
  useEffect(() => {
    const savedLayouts = localStorage.getItem('maes-dashboard-layouts')
    if (savedLayouts) {
      try {
        setLayouts(JSON.parse(savedLayouts))
      } catch (error) {
        console.error('Failed to load saved layouts:', error)
        setLayouts({ lg: defaultLayout })
      }
    } else {
      setLayouts({ lg: defaultLayout })
    }
  }, [])

  const saveLayout = useCallback(() => {
    localStorage.setItem('maes-dashboard-layouts', JSON.stringify(layouts))
    setEditMode(false)
  }, [layouts])

  const resetLayout = useCallback(() => {
    const newLayouts = { lg: defaultLayout }
    setLayouts(newLayouts)
    localStorage.setItem('maes-dashboard-layouts', JSON.stringify(newLayouts))
  }, [])

  const onLayoutChange = useCallback((layout, layouts) => {
    setLayouts(layouts)
  }, [])

  const fetchDashboardData = async () => {
    try {
      // Fetch basic stats (alerts are now handled by useAlerts hook)
      const [extractionsRes, analysisRes] = await Promise.all([
        axios.get('/api/extractions'),
        axios.get('/api/analysis')
      ])

      const extractions = extractionsRes.data.extractions || []
      const analysisJobs = analysisRes.data.analysisJobs || []

      setStats({
        extractions: {
          total: extractions.length,
          active: extractions.filter(e => ['pending', 'running'].includes(e.status)).length,
          completed: extractions.filter(e => e.status === 'completed').length,
          failed: extractions.filter(e => e.status === 'failed').length
        },
        analyses: {
          total: analysisJobs.length,
          completed: analysisJobs.filter(a => a.status === 'completed').length,
          running: analysisJobs.filter(a => ['pending', 'running'].includes(a.status)).length,
          failed: analysisJobs.filter(a => a.status === 'failed').length
        },
        alerts: alertStats, // Use shared alerts data
        coverage: {
          services: 12, // Static for now
          users: extractions.reduce((sum, e) => sum + (e.statistics?.uniqueUsers || 0), 0),
          devices: 1203 // Static for now
        }
      })

      // Fetch recent jobs
      const recentJobsData = [
        ...extractions.slice(0, 5).map(e => ({
          id: e.id,
          type: 'Extraction',
          name: e.type,
          status: e.status,
          startTime: e.createdAt,
          duration: e.duration || 0,
          progress: e.progress || 0
        })),
        ...analysisJobs.slice(0, 5).map(a => ({
          id: a.id,
          type: 'Analysis',
          name: a.type,
          status: a.status,
          startTime: a.createdAt,
          duration: a.duration || 0,
          progress: a.progress || 0
        }))
      ].sort((a, b) => new Date(b.startTime) - new Date(a.startTime)).slice(0, 10)

      setRecentJobs(recentJobsData)

      // Mock system metrics (in real implementation, these would come from Prometheus)
      setSystemMetrics({
        cpu: Math.random() * 100,
        memory: Math.random() * 100,
        disk: Math.random() * 100,
        network: Math.random() * 100
      })

      // Mock recent errors
      setRecentErrors([
        {
          timestamp: new Date(Date.now() - 5 * 60 * 1000),
          level: 'error',
          service: 'extractor',
          message: 'Failed to connect to Microsoft Graph API',
          count: 3
        },
        {
          timestamp: new Date(Date.now() - 15 * 60 * 1000),
          level: 'warning',
          service: 'analyzer',
          message: 'High memory usage detected',
          count: 1
        },
        {
          timestamp: new Date(Date.now() - 30 * 60 * 1000),
          level: 'error',
          service: 'api',
          message: 'Database connection timeout',
          count: 2
        }
      ])

      // Mock container logs
      setContainerLogs([
        {
          timestamp: new Date(),
          level: 'info',
          container: 'maes-api',
          message: 'HTTP request processed successfully'
        },
        {
          timestamp: new Date(Date.now() - 1000),
          level: 'info',
          container: 'maes-extractor',
          message: 'Starting new extraction job'
        },
        {
          timestamp: new Date(Date.now() - 2000),
          level: 'warning',
          container: 'maes-analyzer',
          message: 'Analysis queue backlog detected'
        },
        {
          timestamp: new Date(Date.now() - 3000),
          level: 'info',
          container: 'maes-prometheus',
          message: 'Metrics scrape completed'
        }
      ])

    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDashboardData()
    const interval = setInterval(fetchDashboardData, refreshInterval * 1000)
    return () => clearInterval(interval)
  }, [refreshInterval, alertStats])

  // Generate activity data for charts
  const activityData = []
  const now = new Date()
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    const dayName = date.toLocaleDateString('en', { weekday: 'short' })
    activityData.push({
      name: dayName,
      extractions: Math.floor(Math.random() * 10) + 1,
      analyses: Math.floor(Math.random() * 8) + 1,
      alerts: i === 0 ? alertStats.total : Math.floor(Math.random() * 5), // Use real data for today
      errors: Math.floor(Math.random() * 3)
    })
  }

  const systemMetricsData = [
    { name: 'CPU', value: systemMetrics.cpu, color: '#8884d8' },
    { name: 'Memory', value: systemMetrics.memory, color: '#82ca9d' },
    { name: 'Disk', value: systemMetrics.disk, color: '#ffc658' },
    { name: 'Network', value: systemMetrics.network, color: '#ff7300' }
  ]

  const MetricCard = ({ title, value, icon, color, subtitle, info, unit = '' }) => (
    <Tooltip title={info || title} placement="top" enterDelay={500}>
      <Card sx={{ 
        height: '100%', 
        minHeight: { xs: '140px', sm: '160px' },
        display: 'flex', 
        flexDirection: 'column',
        transition: 'all 0.2s ease-in-out',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: 3
        }
      }}>
      <CardContent sx={{ 
        flexGrow: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        justifyContent: 'space-between',
        p: { xs: 2, sm: 3 },
        '&:last-child': { pb: { xs: 2, sm: 3 } }
      }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography 
              variant="h4" 
              component="div" 
              color={color}
              sx={{ 
                fontSize: { xs: '1.8rem', sm: '2.125rem' },
                lineHeight: 1.2,
                mb: 0.5
              }}
            >
              {value}{unit}
            </Typography>
            <Typography 
              variant="body2" 
              color="text.secondary"
              sx={{ 
                fontSize: { xs: '0.75rem', sm: '0.875rem' },
                fontWeight: 500,
                mb: 0.5
              }}
            >
              {title}
            </Typography>
            {subtitle && (
              <Typography 
                variant="caption" 
                color="text.secondary"
                sx={{ 
                  fontSize: { xs: '0.65rem', sm: '0.75rem' },
                  display: 'block'
                }}
              >
                {subtitle}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 1 }}>
            <Box sx={{ 
              color: color, 
              opacity: 0.7,
              display: 'flex',
              alignItems: 'center'
            }}>
              {React.cloneElement(icon, { sx: { fontSize: { xs: 32, sm: 40 } } })}
            </Box>
            {info && (
              <Tooltip title="Click for more information">
                <IconButton
                  size="small"
                  onClick={() => setInfoDialog({ open: true, title: title, content: info })}
                  sx={{ opacity: 0.7 }}
                >
                  <InfoIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
    </Tooltip>
  )

  const filteredLogs = containerLogs.filter(log => 
    logFilter === 'all' || log.level === logFilter || log.container.includes(logFilter)
  )

  // Widget Components
  const CPUMetricWidget = () => (
    <Paper sx={{ p: 2, height: '100%', minHeight: 150 }}>
      <MetricCard
        title="CPU Usage"
        value={systemMetrics.cpu.toFixed(1)}
        unit="%"
        icon={<SpeedIcon />}
        color="primary.main"
        subtitle={`${stats.extractions.active} active jobs`}
        info="Current CPU utilization across all containers. High values may indicate resource contention."
      />
    </Paper>
  )

  const MemoryMetricWidget = () => (
    <Paper sx={{ p: 2, height: '100%', minHeight: 150 }}>
      <MetricCard
        title="Memory Usage"
        value={systemMetrics.memory.toFixed(1)}
        unit="%"
        icon={<MemoryIcon />}
        color="success.main"
        subtitle="Available memory"
        info="Memory utilization across the platform. Monitor for memory leaks and resource optimization."
      />
    </Paper>
  )

  const JobsMetricWidget = () => (
    <Paper sx={{ p: 2, height: '100%', minHeight: 150 }}>
      <MetricCard
        title="Active Jobs"
        value={stats.extractions.active + stats.analyses.running}
        icon={<Analytics />}
        color="warning.main"
        subtitle={`${stats.extractions.total} total extractions`}
        info="Currently running extraction and analysis jobs across all services."
      />
    </Paper>
  )

  const ErrorsMetricWidget = () => (
    <Paper sx={{ p: 2, height: '100%', minHeight: 150 }}>
      <MetricCard
        title="System Errors"
        value={recentErrors.length}
        icon={<BugReportIcon />}
        color="error.main"
        subtitle="Last 24 hours"
        info="Critical errors and warnings from all services requiring attention."
      />
    </Paper>
  )

  const MonitoringToolsWidget = () => (
    <Paper sx={{ p: 3, height: '100%' }}>
      <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <MonitoringIcon color="primary" />
        Monitoring & Observability Tools
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Access real-time monitoring, metrics, and log analysis tools for comprehensive system observability.
      </Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}>
          <Card 
            sx={{ 
              cursor: 'pointer', 
              transition: 'all 0.2s',
              '&:hover': { transform: 'translateY(-2px)', boxShadow: 3 }
            }}
            onClick={() => window.open('/grafana/', '_blank')}
          >
            <CardContent sx={{ textAlign: 'center', p: 2 }}>
              <TrendingUp sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6" component="div">
                Grafana
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Interactive dashboards and visualization
              </Typography>
              <Chip label="admin/admin" size="small" sx={{ mt: 1 }} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card 
            sx={{ 
              cursor: 'pointer', 
              transition: 'all 0.2s',
              '&:hover': { transform: 'translateY(-2px)', boxShadow: 3 }
            }}
            onClick={() => window.open('/prometheus/', '_blank')}
          >
            <CardContent sx={{ textAlign: 'center', p: 2 }}>
              <SpeedIcon sx={{ fontSize: 40, color: 'success.main', mb: 1 }} />
              <Typography variant="h6" component="div">
                Prometheus
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Metrics collection and monitoring
              </Typography>
              <Chip label="No auth" size="small" sx={{ mt: 1 }} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card 
            sx={{ 
              cursor: 'pointer', 
              transition: 'all 0.2s',
              '&:hover': { transform: 'translateY(-2px)', boxShadow: 3 }
            }}
            onClick={() => window.open('/loki/', '_blank')}
          >
            <CardContent sx={{ textAlign: 'center', p: 2 }}>
              <TimelineIcon sx={{ fontSize: 40, color: 'warning.main', mb: 1 }} />
              <Typography variant="h6" component="div">
                Loki
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Log aggregation and search
              </Typography>
              <Chip label="API access" size="small" sx={{ mt: 1 }} />
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card 
            sx={{ 
              cursor: 'pointer', 
              transition: 'all 0.2s',
              '&:hover': { transform: 'translateY(-2px)', boxShadow: 3 }
            }}
            onClick={() => window.open('/cadvisor/', '_blank')}
          >
            <CardContent sx={{ textAlign: 'center', p: 2 }}>
              <ComputerIcon sx={{ fontSize: 40, color: 'info.main', mb: 1 }} />
              <Typography variant="h6" component="div">
                cAdvisor
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Container resource monitoring
              </Typography>
              <Chip label="No auth" size="small" sx={{ mt: 1 }} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Paper>
  )

  const RecentJobsWidget = () => (
    <Paper sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="h6" gutterBottom>
        Recent Jobs
      </Typography>
      <TableContainer sx={{ flexGrow: 1 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Type</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Progress</TableCell>
              <TableCell>Started</TableCell>
              <TableCell>Duration</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {recentJobs.map((job, index) => (
              <TableRow key={index}>
                <TableCell>
                  <Chip 
                    label={job.type} 
                    size="small" 
                    color={job.type === 'Extraction' ? 'primary' : 'secondary'}
                  />
                </TableCell>
                <TableCell>{job.name}</TableCell>
                <TableCell>
                  <Chip 
                    label={job.status} 
                    size="small"
                    color={
                      job.status === 'completed' ? 'success' :
                      job.status === 'failed' ? 'error' :
                      job.status === 'running' ? 'info' : 'default'
                    }
                  />
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LinearProgress 
                      variant="determinate" 
                      value={job.progress} 
                      sx={{ width: 50 }}
                    />
                    <Typography variant="caption">{job.progress}%</Typography>
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="caption">
                    {dayjs(job.startTime).format('MMM DD HH:mm')}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption">
                    {job.duration ? `${Math.floor(job.duration / 60)}m` : '-'}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  )

  const SystemResourcesWidget = () => (
    <Paper sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="h6" gutterBottom>
        System Resources
      </Typography>
      <Box sx={{ flexGrow: 1, minHeight: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={systemMetricsData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" fontSize={12} />
            <YAxis fontSize={12} domain={[0, 100]} />
            <RechartsTooltip formatter={(value) => [`${value.toFixed(1)}%`, 'Usage']} />
            <Bar dataKey="value" fill="#8884d8">
              {systemMetricsData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </Paper>
  )

  const RecentErrorsWidget = () => (
    <Paper sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="h6" gutterBottom>
        Recent Errors & Warnings
      </Typography>
      <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
        {recentErrors.map((error, index) => (
          <Alert 
            key={index} 
            severity={error.level === 'error' ? 'error' : 'warning'}
            sx={{ mb: 1 }}
          >
            <Box>
              <Typography variant="body2" fontWeight="bold">
                {error.service.toUpperCase()}: {error.message}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {dayjs(error.timestamp).format('MMM DD HH:mm:ss')} - Count: {error.count}
              </Typography>
            </Box>
          </Alert>
        ))}
      </Box>
    </Paper>
  )

  const ContainerLogsWidget = () => (
    <Paper sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          Live Container Logs
        </Typography>
        <FormControl size="small" sx={{ minWidth: 100 }}>
          <InputLabel>Filter</InputLabel>
          <Select
            value={logFilter}
            label="Filter"
            onChange={(e) => setLogFilter(e.target.value)}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="error">Errors</MenuItem>
            <MenuItem value="warning">Warnings</MenuItem>
            <MenuItem value="maes-api">API</MenuItem>
            <MenuItem value="maes-extractor">Extractor</MenuItem>
            <MenuItem value="maes-analyzer">Analyzer</MenuItem>
          </Select>
        </FormControl>
      </Box>
      <Box sx={{ 
        flexGrow: 1, 
        overflowY: 'auto',
        bgcolor: '#0d1117',
        color: '#c9d1d9',
        p: 1,
        borderRadius: 1,
        fontFamily: 'monospace',
        fontSize: '0.75rem'
      }}>
        {filteredLogs.map((log, index) => (
          <Box key={index} sx={{ mb: 0.5 }}>
            <span style={{ color: '#7c3aed' }}>
              [{dayjs(log.timestamp).format('HH:mm:ss')}]
            </span>
            {' '}
            <span style={{ 
              color: log.level === 'error' ? '#f85149' :
                    log.level === 'warning' ? '#d29922' : '#79c0ff'
            }}>
              [{log.level.toUpperCase()}]
            </span>
            {' '}
            <span style={{ color: '#a5a5a5' }}>
              {log.container}:
            </span>
            {' '}
            {log.message}
          </Box>
        ))}
      </Box>
    </Paper>
  )

  const ActivityChartWidget = () => (
    <Paper sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Typography variant="h6" gutterBottom>
        Weekly Activity & Performance Trends
      </Typography>
      <Box sx={{ flexGrow: 1, minHeight: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={activityData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" fontSize={12} />
            <YAxis fontSize={12} />
            <RechartsTooltip />
            <Line type="monotone" dataKey="extractions" stroke="#8884d8" strokeWidth={2} name="Extractions" />
            <Line type="monotone" dataKey="analyses" stroke="#82ca9d" strokeWidth={2} name="Analyses" />
            <Line type="monotone" dataKey="alerts" stroke="#ffc658" strokeWidth={2} name="Alerts" />
            <Line type="monotone" dataKey="errors" stroke="#ff7300" strokeWidth={2} name="Errors" />
          </LineChart>
        </ResponsiveContainer>
      </Box>
    </Paper>
  )

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Box sx={{ 
        display: 'flex', 
        alignItems: { xs: 'flex-start', sm: 'center' },
        flexDirection: { xs: 'column', sm: 'row' },
        mb: 3,
        gap: { xs: 2, sm: 0 }
      }}>
        <Typography variant="h4" sx={{ 
          flexGrow: 1,
          fontSize: { xs: '1.5rem', sm: '2.125rem' }
        }}>
          System Monitoring Dashboard
        </Typography>
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center',
          gap: { xs: 1, sm: 2 },
          flexWrap: { xs: 'wrap', sm: 'nowrap' }
        }}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Refresh</InputLabel>
            <Select
              value={refreshInterval}
              label="Refresh"
              onChange={(e) => setRefreshInterval(e.target.value)}
            >
              <MenuItem value={10}>10s</MenuItem>
              <MenuItem value={30}>30s</MenuItem>
              <MenuItem value={60}>1m</MenuItem>
              <MenuItem value={300}>5m</MenuItem>
            </Select>
          </FormControl>
          <IconButton onClick={fetchDashboardData} color="primary" title="Refresh Dashboard">
            <RefreshIcon />
          </IconButton>
          
          {/* Edit Mode Controls */}
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center',
            gap: 1,
            borderLeft: '1px solid',
            borderColor: 'divider',
            pl: 2,
            ml: 1
          }}>
            <FormControlLabel
              control={
                <Switch
                  checked={editMode}
                  onChange={(e) => setEditMode(e.target.checked)}
                  size="small"
                />
              }
              label={
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                  EDIT
                </Typography>
              }
            />
            {editMode && (
              <>
                <IconButton onClick={saveLayout} color="primary" title="Save Layout">
                  <SaveIcon />
                </IconButton>
                <IconButton onClick={resetLayout} color="secondary" title="Reset Layout">
                  <ResetIcon />
                </IconButton>
              </>
            )}
          </Box>
          
          {/* Monitoring Tools Group */}
          <Box sx={{ 
            display: 'flex', 
            gap: 1, 
            flexWrap: 'wrap',
            alignItems: 'center',
            borderLeft: '1px solid',
            borderColor: 'divider',
            pl: 2,
            ml: 1
          }}>
            <Typography variant="caption" color="text.secondary" sx={{ mr: 1, fontWeight: 600 }}>
              MONITORING:
            </Typography>
            <Button
              variant="outlined"
              startIcon={<TrendingUp />}
              onClick={() => window.open('/grafana/', '_blank')}
              size="small"
              sx={{ minWidth: 'auto' }}
            >
              Grafana
            </Button>
            <Button
              variant="outlined"
              startIcon={<SpeedIcon />}
              onClick={() => window.open('/prometheus/', '_blank')}
              size="small"
              sx={{ minWidth: 'auto' }}
            >
              Prometheus
            </Button>
            <Button
              variant="outlined"
              startIcon={<TimelineIcon />}
              onClick={() => window.open('/loki/', '_blank')}
              size="small"
              sx={{ minWidth: 'auto' }}
            >
              Loki
            </Button>
            <Button
              variant="outlined"
              startIcon={<ComputerIcon />}
              onClick={() => window.open('/cadvisor/', '_blank')}
              size="small"
              sx={{ minWidth: 'auto' }}
            >
              cAdvisor
            </Button>
          </Box>
        </Box>
      </Box>
      
      {/* Responsive Dashboard Layout */}
      <Box sx={{ 
        '& .react-grid-item': {
          border: editMode ? '2px dashed rgba(0, 229, 255, 0.3)' : 'none',
          borderRadius: 1,
          transition: 'border 0.2s ease-in-out'
        },
        '& .react-grid-item.react-grid-placeholder': {
          background: 'rgba(0, 229, 255, 0.1)',
          border: '2px dashed rgba(0, 229, 255, 0.5)',
          borderRadius: 1
        },
        '& .react-resizable-handle': {
          display: editMode ? 'block' : 'none'
        }
      }}>
        <ResponsiveGridLayout
          className="layout"
          layouts={layouts}
          onLayoutChange={onLayoutChange}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
          cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
          rowHeight={60}
          isDraggable={editMode}
          isResizable={editMode}
          compactType="vertical"
          preventCollision={false}
          margin={[16, 16]}
        >
          <div key="cpu-metric">
            <CPUMetricWidget />
          </div>
          <div key="memory-metric">
            <MemoryMetricWidget />
          </div>
          <div key="jobs-metric">
            <JobsMetricWidget />
          </div>
          <div key="errors-metric">
            <ErrorsMetricWidget />
          </div>
          <div key="monitoring-tools">
            <MonitoringToolsWidget />
          </div>
          <div key="recent-jobs">
            <RecentJobsWidget />
          </div>
          <div key="system-resources">
            <SystemResourcesWidget />
          </div>
          <div key="recent-errors">
            <RecentErrorsWidget />
          </div>
          <div key="container-logs">
            <ContainerLogsWidget />
          </div>
          <div key="activity-chart">
            <ActivityChartWidget />
          </div>
        </ResponsiveGridLayout>
      </Box>
      
      {/* Edit Mode Floating Action Button */}
      {editMode && (
        <Fab
          color="primary"
          sx={{ position: 'fixed', bottom: 16, right: 16 }}
          onClick={saveLayout}
        >
          <SaveIcon />
        </Fab>
      )}
      
      {/* Info Dialog */}
      <Dialog
        open={infoDialog.open}
        onClose={() => setInfoDialog({ open: false, title: '', content: '' })}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <InfoIcon color="primary" />
          {infoDialog.title}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ lineHeight: 1.6 }}>
            {infoDialog.content}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInfoDialog({ open: false, title: '', content: '' })}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default Dashboard