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

  const activityData = [
    { name: 'Mon', extractions: 12, analyses: 8, alerts: 2 },
    { name: 'Tue', extractions: 15, analyses: 12, alerts: 4 },
    { name: 'Wed', extractions: 8, analyses: 6, alerts: 1 },
    { name: 'Thu', extractions: 18, analyses: 15, alerts: 6 },
    { name: 'Fri', extractions: 22, analyses: 18, alerts: 3 },
    { name: 'Sat', extractions: 5, analyses: 4, alerts: 1 },
    { name: 'Sun', extractions: 3, analyses: 2, alerts: 0 }
  ]

  const alertDistribution = [
    { name: 'Critical', value: 2, color: '#f44336' },
    { name: 'High', value: 8, color: '#ff9800' },
    { name: 'Medium', value: 10, color: '#ffc107' },
    { name: 'Low', value: 3, color: '#4caf50' }
  ]

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
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>
      
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
          </Paper>
        </Grid>

        {/* Recent Activities */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              Recent Activities
            </Typography>
            <Box sx={{ mt: 2 }}>
              {[
                { type: 'extraction', message: 'UAL extraction completed for tenant contoso.com', time: '5 minutes ago', status: 'success' },
                { type: 'analysis', message: 'Sign-in analysis detected suspicious activity', time: '12 minutes ago', status: 'warning' },
                { type: 'alert', message: 'Critical: Possible AiTM attack detected', time: '18 minutes ago', status: 'error' },
                { type: 'extraction', message: 'MFA status extraction started', time: '25 minutes ago', status: 'info' }
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
          </Paper>
        </Grid>
      </Grid>
    </Box>
  )
}

export default Dashboard