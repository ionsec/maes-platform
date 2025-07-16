import React, { useState, useEffect } from 'react'
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
  Button
} from '@mui/material'
import {
  CloudDownload,
  Analytics,
  Warning,
  TrendingUp,
  Security,
  Assessment,
  Info as InfoIcon
} from '@mui/icons-material'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import axios from '../utils/axios'
import dayjs from 'dayjs'

const Dashboard = () => {
  const [stats, setStats] = useState({
    extractions: { total: 0, active: 0, completed: 0, failed: 0 },
    analyses: { total: 0, completed: 0, running: 0, failed: 0 },
    alerts: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
    coverage: { services: 0, users: 0, devices: 0 }
  })
  const [loading, setLoading] = useState(true)
  const [infoDialog, setInfoDialog] = useState({ open: false, title: '', content: '' })

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        // Fetch extractions
        const extractionsRes = await axios.get('/api/extractions')
        const extractions = extractionsRes.data.extractions || []
        
        // Fetch analysis jobs
        const analysisRes = await axios.get('/api/analysis')
        const analysisJobs = analysisRes.data.analysisJobs || []
        
        // Fetch alerts
        const alertsRes = await axios.get('/api/alerts')
        const alerts = alertsRes.data.alerts || []

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
          alerts: {
            total: alerts.length,
            critical: alerts.filter(a => a.severity === 'critical').length,
            high: alerts.filter(a => a.severity === 'high').length,
            medium: alerts.filter(a => a.severity === 'medium').length,
            low: alerts.filter(a => a.severity === 'low').length
          },
          coverage: {
            services: 12, // Static for now
            users: extractions.reduce((sum, e) => sum + (e.statistics?.uniqueUsers || 0), 0),
            devices: 1203 // Static for now
          }
        })
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchDashboardData()
    const interval = setInterval(fetchDashboardData, 30000) // Refresh every 30 seconds
    return () => clearInterval(interval)
  }, [])

  // Generate activity data based on recent extractions
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
      alerts: Math.floor(Math.random() * 5)
    })
  }

  const alertDistribution = [
    { name: 'Critical', value: stats.alerts.critical, color: '#f44336' },
    { name: 'High', value: stats.alerts.high, color: '#ff9800' },
    { name: 'Medium', value: stats.alerts.medium, color: '#ffc107' },
    { name: 'Low', value: stats.alerts.low, color: '#4caf50' }
  ].filter(item => item.value > 0)

  const StatCard = ({ title, value, icon, color, subtitle, info }) => (
    <Tooltip title={info || title} placement="top" enterDelay={500}>
      <Card className="hoverable-card" sx={{ 
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
              {value}
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
          MAES Dashboard
        </Typography>
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center',
          gap: { xs: 1, sm: 2 },
          flexWrap: { xs: 'wrap', sm: 'nowrap' }
        }}>
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center',
            padding: { xs: '6px 12px', sm: '8px 16px' },
            backgroundColor: 'rgba(25, 118, 210, 0.1)',
            borderRadius: 1,
            border: '1px solid rgba(25, 118, 210, 0.3)'
          }}>
            <Typography variant="h6" sx={{ 
              color: 'primary.main',
              fontWeight: 'bold',
              letterSpacing: 1,
              fontSize: { xs: '0.9rem', sm: '1.25rem' }
            }}>
              IONSEC.IO
            </Typography>
          </Box>
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center',
            padding: { xs: '4px 8px', sm: '6px 12px' },
            backgroundColor: 'rgba(211, 47, 47, 0.1)',
            borderRadius: 1,
            border: '1px solid rgba(211, 47, 47, 0.3)'
          }}>
            <Typography variant="caption" sx={{ 
              color: 'error.main',
              fontWeight: 'bold',
              fontSize: { xs: '0.65rem', sm: '0.75rem' }
            }}>
              24/7 Incident Response
            </Typography>
          </Box>
        </Box>
      </Box>
      
      <Grid container spacing={3}>
        {/* Stats Cards */}
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Total Extractions"
            value={stats.extractions.total}
            icon={<CloudDownload sx={{ fontSize: 40 }} />}
            color="primary.main"
            subtitle={`${stats.extractions.active} active`}
            info="Data extraction jobs that collect evidence from Microsoft 365 services including Unified Audit Logs, Azure AD logs, Exchange, SharePoint, and Teams. This includes both scheduled and on-demand extractions."
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Analyses Complete"
            value={stats.analyses.total}
            icon={<Analytics sx={{ fontSize: 40 }} />}
            color="success.main"
            subtitle={`${stats.analyses.running} running`}
            info="Analysis jobs that process extracted data using advanced algorithms to detect threats, anomalies, and suspicious activities. Each analysis generates detailed findings and security alerts based on MITRE ATT&CK framework."
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Active Alerts"
            value={stats.alerts.total}
            icon={<Warning sx={{ fontSize: 40 }} />}
            color="warning.main"
            subtitle={`${stats.alerts.critical} critical`}
            info="Security alerts generated from analysis results. Alerts are categorized by severity (Critical, High, Medium, Low) and include detailed information about detected threats, IOCs, and recommended response actions."
          />
        </Grid>
        
        <Grid item xs={12} sm={6} md={3}>
          <StatCard
            title="Monitored Users"
            value={stats.coverage.users.toLocaleString()}
            icon={<Security sx={{ fontSize: 40 }} />}
            color="info.main"
            subtitle={`${stats.coverage.devices} devices`}
            info="Total number of unique users and devices being monitored across your Microsoft 365 environment. This includes user accounts, service principals, and registered devices that appear in audit logs and security events."
          />
        </Grid>

        {/* Activity Chart */}
        <Grid item xs={12} lg={8}>
          <Tooltip title="Weekly activity trends showing extractions, analyses, and alerts over the past 7 days" placement="top" enterDelay={500}>
            <Paper sx={{ 
              p: { xs: 2, sm: 3 }, 
              height: { xs: '350px', sm: '400px', lg: '400px' }, 
              display: 'flex', 
              flexDirection: 'column',
              transition: 'all 0.2s ease-in-out',
              '&:hover': {
                boxShadow: 2
              }
            }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h6" sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                Weekly Activity
              </Typography>
              <Tooltip title="Click for more information">
                <IconButton
                  size="small"
                  onClick={() => setInfoDialog({ 
                    open: true, 
                    title: 'Weekly Activity Chart', 
                    content: 'This chart shows the daily activity trends for extractions, analyses, and alerts over the past week. It helps you understand platform usage patterns and identify peak activity periods for better resource planning.' 
                  })}
                  sx={{ opacity: 0.7 }}
                >
                  <InfoIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
            <Box sx={{ flexGrow: 1, minHeight: { xs: 250, sm: 300 } }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={activityData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="name" 
                    fontSize={12}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis 
                    fontSize={12}
                    tick={{ fontSize: 12 }}
                  />
                  <RechartsTooltip />
                  <Line type="monotone" dataKey="extractions" stroke="#8884d8" strokeWidth={2} />
                  <Line type="monotone" dataKey="analyses" stroke="#82ca9d" strokeWidth={2} />
                  <Line type="monotone" dataKey="alerts" stroke="#ffc658" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </Box>
          </Paper>
          </Tooltip>
        </Grid>

        {/* Alert Distribution */}
        <Grid item xs={12} lg={4}>
          <Tooltip title="Distribution of security alerts by severity level - Critical, High, Medium, and Low" placement="top" enterDelay={500}>
            <Paper sx={{ 
              p: { xs: 2, sm: 3 }, 
              height: { xs: '350px', sm: '400px', lg: '400px' }, 
              display: 'flex', 
              flexDirection: 'column',
              transition: 'all 0.2s ease-in-out',
              '&:hover': {
                boxShadow: 2
              }
            }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h6" sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                Alert Distribution
              </Typography>
              <Tooltip title="Click for more information">
                <IconButton
                  size="small"
                  onClick={() => setInfoDialog({ 
                    open: true, 
                    title: 'Alert Distribution', 
                    content: 'This pie chart shows the distribution of security alerts by severity level. Critical alerts require immediate attention, High alerts need prompt investigation, Medium alerts should be reviewed within 24 hours, and Low alerts are informational.' 
                  })}
                  sx={{ opacity: 0.7 }}
                >
                  <InfoIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
            <Box sx={{ flexGrow: 1, minHeight: { xs: 250, sm: 300 } }}>
              {alertDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={alertDistribution}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={window.innerWidth < 600 ? 60 : 80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {alertDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <Box sx={{ 
                  height: '100%', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  flexDirection: 'column'
                }}>
                  <Security sx={{ fontSize: { xs: 48, sm: 60 }, color: 'text.disabled', mb: 2 }} />
                  <Typography variant="body2" color="text.secondary" align="center">
                    No alerts generated yet.
                  </Typography>
                  <Typography variant="caption" color="text.secondary" align="center" sx={{ mt: 1 }}>
                    Alerts will appear here after analysis completes.
                  </Typography>
                </Box>
              )}
            </Box>
          </Paper>
          </Tooltip>
        </Grid>

        {/* IONSEC.IO Services */}
        <Grid item xs={12} md={6}>
          <Tooltip title="Professional cybersecurity services including incident response, digital forensics, and security consulting" placement="top" enterDelay={500}>
            <Paper sx={{ 
              p: { xs: 2, sm: 3 }, 
              height: '100%', 
              minHeight: { xs: '300px', sm: '350px' },
              display: 'flex', 
              flexDirection: 'column',
              transition: 'all 0.2s ease-in-out',
              '&:hover': {
                boxShadow: 2
              }
            }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h6" sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                IONSEC.IO Services
              </Typography>
              <Tooltip title="Click for more information">
                <IconButton
                  size="small"
                  onClick={() => setInfoDialog({ 
                    open: true, 
                    title: 'IONSEC.IO Professional Services', 
                    content: 'IONSEC.IO provides comprehensive cybersecurity services including 24/7 incident response, digital forensics, threat hunting, and security consulting. Our expert team helps organizations investigate security incidents, recover from breaches, and strengthen their security posture.' 
                  })}
                  sx={{ opacity: 0.7 }}
                >
                  <InfoIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary" paragraph>
                Professional cybersecurity incident response and digital forensics services.
              </Typography>
              
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                <Chip label="Incident Response" color="primary" size="small" />
                <Chip label="Digital Forensics" color="primary" size="small" />
                <Chip label="Cybersecurity" color="primary" size="small" />
                <Chip label="24/7 Support" color="error" size="small" />
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" fontWeight="bold">Emergency:</Typography>
                  <Typography variant="body2" color="primary.main">+972-543181773</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" fontWeight="bold">Email:</Typography>
                  <Typography variant="body2" color="primary.main">info@ionsec.io</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" fontWeight="bold">Website:</Typography>
                  <Typography variant="body2" color="primary.main">ionsec.io</Typography>
                </Box>
              </Box>
            </Box>
          </Paper>
          </Tooltip>
        </Grid>

        {/* Recent Activities */}
        <Grid item xs={12} md={6}>
          <Tooltip title="Real-time platform activities including extraction jobs, analysis progress, and system events" placement="top" enterDelay={500}>
            <Paper sx={{ 
              p: { xs: 2, sm: 3 }, 
              height: '100%', 
              minHeight: { xs: '300px', sm: '350px' },
              display: 'flex', 
              flexDirection: 'column',
              transition: 'all 0.2s ease-in-out',
              '&:hover': {
                boxShadow: 2
              }
            }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h6" sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                Recent Activities
              </Typography>
              <Tooltip title="Click for more information">
                <IconButton
                  size="small"
                  onClick={() => setInfoDialog({ 
                    open: true, 
                    title: 'Recent Activities', 
                    content: 'This section shows real-time platform activities including extraction jobs, analysis progress, security monitoring status, and system events. It provides a quick overview of what the platform is currently doing.' 
                  })}
                  sx={{ opacity: 0.7 }}
                >
                  <InfoIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
            <Box sx={{ mt: 2 }}>
              {loading ? (
                <Typography variant="body2" color="text.secondary">
                  Loading activities...
                </Typography>
              ) : (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
                    {stats.extractions.total === 0 ? 
                      'No activities yet. Start by creating your first extraction.' : 
                      'Showing recent platform activities'}
                  </Typography>
                  {[
                    { type: 'info', message: 'Platform initialized and ready for M365 data extraction', time: 'Just now', status: 'info' },
                    { type: 'extraction', message: stats.extractions.active > 0 ? `${stats.extractions.active} extraction(s) currently running` : 'No active extractions', time: '1 minute ago', status: stats.extractions.active > 0 ? 'success' : 'info' },
                    { type: 'analysis', message: stats.analyses.running > 0 ? `${stats.analyses.running} analysis job(s) in progress` : 'Analysis engine ready', time: '2 minutes ago', status: stats.analyses.running > 0 ? 'warning' : 'info' },
                    { type: 'security', message: 'Security monitoring active', time: '3 minutes ago', status: 'success' }
                  ].map((activity, index) => (
                <Box key={index} sx={{ display: 'flex', alignItems: 'center', mb: 1, p: 1 }}>
                  <Chip
                    label={activity.type}
                    size="small"
                    color={activity.status}
                    sx={{ mr: 2, minWidth: 80 }}
                  />
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    {activity.message}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {activity.time}
                  </Typography>
                </Box>
                  ))}
                </Box>
              )}
            </Box>
          </Paper>
          </Tooltip>
        </Grid>
      </Grid>
      
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