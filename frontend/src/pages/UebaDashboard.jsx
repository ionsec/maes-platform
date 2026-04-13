import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, LinearProgress, Paper,
  IconButton, Tooltip, Alert, Divider, Stack, Avatar
} from '@mui/material';
import {
  Security, Warning, TrendingUp, People, Refresh, Shield,
  LocationOn, Schedule, DeviceHub
} from '@mui/icons-material';
import axios from '../utils/axios';

const UebaDashboard = () => {
  const [baselines, setBaselines] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [riskDetail, setRiskDetail] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [baselinesRes, statsRes] = await Promise.all([
        axios.get('/ueba/baselines', { params: { limit: 50 } }),
        axios.get('/ueba/stats')
      ]);
      setBaselines(baselinesRes.data.baselines || []);
      setStats(statsRes.data.stats || {});
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch UEBA data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleViewRisk = async (userId) => {
    try {
      const res = await axios.get(`/ueba/risk/${userId}`);
      setRiskDetail(res.data.riskScore);
      setSelectedUser(userId);
    } catch (err) {
      console.error('Failed to fetch risk score:', err);
    }
  };

  const getRiskColor = (score) => {
    if (score >= 70) return 'error';
    if (score >= 40) return 'warning';
    if (score >= 20) return 'info';
    return 'success';
  };

  const getRiskLabel = (score) => {
    if (score >= 70) return 'Critical';
    if (score >= 40) return 'High';
    if (score >= 20) return 'Elevated';
    if (score > 0) return 'Low';
    return 'Normal';
  };

  const statCards = [
    { title: 'Total Baselines', value: stats?.total_baselines || 0, icon: <People />, color: 'primary' },
    { title: 'High Confidence', value: stats?.high_confidence || 0, icon: <Shield />, color: 'success' },
    { title: 'Elevated Risk', value: stats?.elevated_risk || 0, icon: <Warning />, color: 'warning' },
    { title: 'Avg Risk Score', value: Math.round(parseFloat(stats?.avg_risk_score || 0)), icon: <TrendingUp />, color: 'info' }
  ];

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" gutterBottom>
          User Behavior Analytics
        </Typography>
        <Tooltip title="Refresh">
          <IconButton onClick={fetchData} disabled={loading}>
            <Refresh />
          </IconButton>
        </Tooltip>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {statCards.map((stat, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <Card sx={{ bgcolor: `${stat.color}.light`, height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography color="text.secondary" variant="caption">{stat.title}</Typography>
                    <Typography variant="h4">{stat.value}</Typography>
                  </Box>
                  <Avatar sx={{ bgcolor: `${stat.color}.main`, width: 48, height: 48 }}>{stat.icon}</Avatar>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Baselines Table */}
      {loading ? (
        <LinearProgress />
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>User</TableCell>
                <TableCell>Confidence</TableCell>
                <TableCell>Risk Score</TableCell>
                <TableCell>Risk Level</TableCell>
                <TableCell>Primary Country</TableCell>
                <TableCell>Unique IPs</TableCell>
                <TableCell>Last Updated</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {baselines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center">
                    <Typography color="text.secondary" sx={{ py: 4 }}>
                      No user baselines found. Baselines are created automatically from audit activity.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                baselines.map((baseline) => (
                  <TableRow key={baseline.id} hover>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">{baseline.username}</Typography>
                      <Typography variant="caption" color="text.secondary">{baseline.email}</Typography>
                    </TableCell>
                    <TableCell>
                      <LinearProgress
                        variant="determinate"
                        value={baseline.confidence_level || 0}
                        sx={{ width: 80 }}
                      />
                      <Typography variant="caption">{baseline.confidence_level || 0}%</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">
                        {baseline.risk_score || 0}/100
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={getRiskLabel(baseline.risk_score || 0)}
                        color={getRiskColor(baseline.risk_score || 0)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{baseline.baseline_data?.primary_country || 'N/A'}</TableCell>
                    <TableCell>{baseline.baseline_data?.unique_ips || 0}</TableCell>
                    <TableCell>
                      {new Date(baseline.updated_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Tooltip title="View Risk Details">
                        <IconButton size="small" onClick={() => handleViewRisk(baseline.user_id)}>
                          <Security fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Risk Detail Panel */}
      {riskDetail && (
        <Card sx={{ mt: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Risk Assessment Detail</Typography>
            <Divider sx={{ mb: 2 }} />
            <Grid container spacing={3}>
              <Grid item xs={12} md={4}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h2" color={getRiskColor(riskDetail.risk_score)}>
                    {riskDetail.risk_score}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">Risk Score</Typography>
                  <Chip
                    label={getRiskLabel(riskDetail.risk_score)}
                    color={getRiskColor(riskDetail.risk_score)}
                    sx={{ mt: 1 }}
                  />
                </Box>
              </Grid>
              <Grid item xs={12} md={8}>
                <Stack spacing={2}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Shield fontSize="small" color="action" />
                    <Typography variant="body2"><strong>Confidence:</strong> {riskDetail.confidence}%</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LocationOn fontSize="small" color="action" />
                    <Typography variant="body2"><strong>Primary Country:</strong> {riskDetail.primary_country || 'Unknown'}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <DeviceHub fontSize="small" color="action" />
                    <Typography variant="body2"><strong>Unique IPs:</strong> {riskDetail.unique_ips || 0}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Schedule fontSize="small" color="action" />
                    <Typography variant="body2"><strong>Unique Countries:</strong> {riskDetail.unique_countries || 0}</Typography>
                  </Box>
                </Stack>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default UebaDashboard;
