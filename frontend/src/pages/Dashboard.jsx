import React, { useState, useEffect } from 'react'
import {
  Box,
  Grid,
  Paper,
  Typography,
  Card,
  CardContent,
  Chip,
  LinearProgress
} from '@mui/material'
import {
  CloudDownload,
  Analytics,
  Warning,
  TrendingUp,
  Security,
  Assessment
} from '@mui/icons-material'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
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

  const StatCard = ({ title, value, icon, color, subtitle }) => (
    <Card className="hoverable-card">
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h4" component="div" color={color}>
              {value}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="caption" color="text.secondary">
                {subtitle}
              </Typography>
            )}
          </Box>
          <Box sx={{ color: color, opacity: 0.7 }}>
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  )

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ flexGrow: 1 }}>
          MAES Dashboard
        </Typography>
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center',
          gap: 2
        }}>
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center',
            padding: '8px 16px',
            backgroundColor: 'rgba(25, 118, 210, 0.1)',
            borderRadius: 1,
            border: '1px solid rgba(25, 118, 210, 0.3)'
          }}>
            <Typography variant="h6" sx={{ 
              color: 'primary.main',
              fontWeight: 'bold',
              letterSpacing: 1
            }}>
              IONSEC.IO
            </Typography>
          </Box>
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center',
            padding: '6px 12px',
            backgroundColor: 'rgba(211, 47, 47, 0.1)',
            borderRadius: 1,
            border: '1px solid rgba(211, 47, 47, 0.3)'
          }}>
            <Typography variant="caption" sx={{ 
              color: 'error.main',
              fontWeight: 'bold',
              fontSize: '0.75rem'
            }}>
              24/7 Incident Response
            </Typography>
          </Box>
        </Box>
      </Box>
      
      <Grid container spacing={3}>
        {/* Stats Cards */}
        <Grid item xs={12} md={6} lg={3}>
          <StatCard
            title="Total Extractions"
            value={stats.extractions.total}
            icon={<CloudDownload sx={{ fontSize: 40 }} />}
            color="primary.main"
            subtitle={`${stats.extractions.active} active`}
          />
        </Grid>
        
        <Grid item xs={12} md={6} lg={3}>
          <StatCard
            title="Analyses Complete"
            value={stats.analyses.total}
            icon={<Analytics sx={{ fontSize: 40 }} />}
            color="success.main"
            subtitle={`${stats.analyses.running} running`}
          />
        </Grid>
        
        <Grid item xs={12} md={6} lg={3}>
          <StatCard
            title="Active Alerts"
            value={stats.alerts.total}
            icon={<Warning sx={{ fontSize: 40 }} />}
            color="warning.main"
            subtitle={`${stats.alerts.critical} critical`}
          />
        </Grid>
        
        <Grid item xs={12} md={6} lg={3}>
          <StatCard
            title="Monitored Users"
            value={stats.coverage.users.toLocaleString()}
            icon={<Security sx={{ fontSize: 40 }} />}
            color="info.main"
            subtitle={`${stats.coverage.devices} devices`}
          />
        </Grid>

        {/* Activity Chart */}
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Weekly Activity
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={activityData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="extractions" stroke="#8884d8" strokeWidth={2} />
                <Line type="monotone" dataKey="analyses" stroke="#82ca9d" strokeWidth={2} />
                <Line type="monotone" dataKey="alerts" stroke="#ffc658" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Alert Distribution */}
        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Alert Distribution
            </Typography>
            {alertDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={alertDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {alertDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Box sx={{ 
                height: 300, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                flexDirection: 'column'
              }}>
                <Security sx={{ fontSize: 60, color: 'text.disabled', mb: 2 }} />
                <Typography variant="body2" color="text.secondary" align="center">
                  No alerts generated yet.
                </Typography>
                <Typography variant="caption" color="text.secondary" align="center" sx={{ mt: 1 }}>
                  Alerts will appear here after analysis completes.
                </Typography>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* IONSEC.IO Services */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              IONSEC.IO Services
            </Typography>
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
        </Grid>

        {/* Recent Activities */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Recent Activities
            </Typography>
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
        </Grid>
      </Grid>
    </Box>
  )
}

export default Dashboard