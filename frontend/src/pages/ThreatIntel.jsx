import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, TextField, Button, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, Chip,
  Paper, Alert, Tabs, Tab, IconButton, Tooltip, Stack, Divider
} from '@mui/material';
import {
  Search, Refresh, Security, Warning, Info, Link as LinkIcon,
  Dns, Delete, Save
} from '@mui/icons-material';
import axios from '../utils/axios';
import SavedIOCs from './SavedIOCs';
import { detectIocType } from '../utils/iocType';

const ThreatIntel = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [bulkInput, setBulkInput] = useState('');
  const [bulkResults, setBulkResults] = useState(null);
  const [providerStats, setProviderStats] = useState(null);
  const [providerStatsError, setProviderStatsError] = useState(null);

  const fetchProviderStats = async () => {
    try {
      const response = await axios.get('/api/threat-intel/stats');
      setProviderStats(response.data);
    } catch (err) {
      // Swallowing this left the provider card as a blank box with no
      // indication that anything had gone wrong.
      console.error('Failed to fetch provider stats:', err);
      setProviderStatsError(
        err.response?.status === 403
          ? 'You do not have permission to view provider status.'
          : 'Could not load threat intelligence provider status.'
      );
      setProviderStats(null);
    }
  };

  useEffect(() => {
    fetchProviderStats();
  }, []);

  const handleSingleEnrich = async (type) => {
    setLoading(true);
    setError(null);
    setResults(null);

    // Resolve the requested type. The backend exposes /enrich/{ip|domain|hash}
    // only, so 'auto' maps to a client-side detection of the entered value.
    const resolvedType = type === 'auto' ? detectIocType(query) : type;

    try {
      const response = await axios.get(`/api/threat-intel/enrich/${resolvedType}/${encodeURIComponent(query)}`);
      setResults(response.data.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to enrich IOC');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkEnrich = async () => {
    setLoading(true);
    setError(null);
    setBulkResults(null);

    try {
      const iocs = bulkInput.split('\n').filter(line => line.trim()).map(line => {
        const [value, type] = line.split(',').map(s => s.trim());
        return { value, type: type || 'ip' };
      });

      const response = await axios.post('/api/threat-intel/enrich/bulk', { iocs });
      setBulkResults(response.data.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to bulk enrich');
    } finally {
      setLoading(false);
    }
  };

  const getRiskColor = (level) => {
    const colors = { critical: 'error', high: 'warning', medium: 'info', low: 'success', clean: 'default' };
    return colors[level] || 'default';
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Threat Intelligence
      </Typography>

      {/* Provider Status */}
      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle2" gutterBottom>Threat Intelligence Providers</Typography>

          {providerStatsError ? (
            <Alert severity="warning">{providerStatsError}</Alert>
          ) : !providerStats?.providers ? (
            <Typography variant="body2" color="text.secondary">
              Loading provider status…
            </Typography>
          ) : (
            <>
              <Stack direction="row" spacing={2} flexWrap="wrap">
                {Object.entries(providerStats.providers).map(([name, enabled]) => (
                  <Chip
                    key={name}
                    label={`${name}: ${enabled ? 'Active' : 'Inactive'}`}
                    color={enabled ? 'success' : 'default'}
                    variant={enabled ? 'filled' : 'outlined'}
                    icon={enabled ? <Security /> : <Info />}
                  />
                ))}
              </Stack>

              {/* Without this, an all-provider-disabled lookup returns a
                  confident "clean, 0/100" that looks like a real result. */}
              {Object.values(providerStats.providers).every((enabled) => !enabled) && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  No threat intelligence providers are configured, so lookups will return an empty
                  result rather than a verdict. Set the provider API keys in your environment
                  (<code>VIRUSTOTAL_API_KEY</code>, <code>ABUSEIPDB_API_KEY</code>,{' '}
                  <code>SHODAN_API_KEY</code>, <code>IPQUALITYSCORE_API_KEY</code>) and restart the API.
                </Alert>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)}>
          <Tab label="Single IOC Lookup" />
          <Tab label="Bulk Enrichment" />
          <Tab label="Saved IOCs" />
        </Tabs>
      </Paper>

      {/* Single IOC Lookup */}
      {activeTab === 0 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle1" gutterBottom>IOC Lookup</Typography>
                <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
                  <TextField
                    fullWidth
                    placeholder="Enter IP, domain, or hash"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSingleEnrich('auto')}
                  />
                </Stack>
                <Stack direction="row" spacing={1}>
                  <Button variant="contained" onClick={() => handleSingleEnrich('auto')} disabled={!query}>
                    Auto Detect
                  </Button>
                  <Button variant="contained" onClick={() => handleSingleEnrich('ip')} disabled={!query}>
                    Check IP
                  </Button>
                  <Button variant="contained" onClick={() => handleSingleEnrich('domain')} disabled={!query}>
                    Check Domain
                  </Button>
                  <Button variant="contained" onClick={() => handleSingleEnrich('hash')} disabled={!query}>
                    Check Hash
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          {results && (
            <Grid item xs={12} md={6}>
              <Card variant="outlined">
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="subtitle1">Enrichment Results</Typography>
                    <Chip label={results.risk_level} color={getRiskColor(results.risk_level)} />
                  </Box>

                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary">Risk Score</Typography>
                    <Typography variant="h4">{results.risk_score}/100</Typography>
                  </Box>

                  <Divider sx={{ my: 2 }} />

                  <Typography variant="subtitle2" gutterBottom>Findings</Typography>
                  {results.findings?.map((finding, idx) => (
                    <Alert key={idx} severity={finding.severity} sx={{ mb: 1 }}>
                      <Typography variant="body2" fontWeight="bold">{finding.provider}</Typography>
                      <Typography variant="caption">{finding.type}</Typography>
                    </Alert>
                  ))}

                  {results.metadata && Object.keys(results.metadata).length > 0 && (
                    <>
                      <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>Metadata</Typography>
                      {Object.entries(results.metadata).map(([key, value]) => (
                        <Typography key={key} variant="caption" display="block">
                          <strong>{key}:</strong> {value?.toString()}
                        </Typography>
                      ))}
                    </>
                  )}
                </CardContent>
              </Card>
            </Grid>
          )}
        </Grid>
      )}

      {/* Bulk Enrichment */}
      {activeTab === 1 && (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="subtitle1" gutterBottom>Bulk IOC Enrichment</Typography>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 2 }}>
                  Enter one IOC per line: value,type (ip, domain, or hash)
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  rows={10}
                  placeholder="1.2.3.4,ip&#10;evil.com,domain&#10;abc123...,hash"
                  value={bulkInput}
                  onChange={(e) => setBulkInput(e.target.value)}
                  sx={{ mb: 2 }}
                />
                <Button 
                  variant="contained" 
                  onClick={handleBulkEnrich} 
                  disabled={!bulkInput || loading}
                  startIcon={<Search />}
                >
                  Enrich All ({bulkInput.split('\n').filter(l => l.trim()).length} IOCs)
                </Button>
              </CardContent>
            </Card>
          </Grid>

          {bulkResults && (
            <Grid item xs={12} md={6}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle1" gutterBottom>Summary</Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      {/* Labels previously ran one severity hotter than the
                          buckets they read: high_risk was shown as "Critical". */}
                      <Alert severity="error">High: {bulkResults.summary?.high_risk || 0}</Alert>
                    </Grid>
                    <Grid item xs={6}>
                      <Alert severity="warning">Medium: {bulkResults.summary?.medium_risk || 0}</Alert>
                    </Grid>
                    <Grid item xs={6}>
                      <Alert severity="info">Low: {bulkResults.summary?.low_risk || 0}</Alert>
                    </Grid>
                    <Grid item xs={6}>
                      <Alert severity="success">Clean: {bulkResults.summary?.clean || 0}</Alert>
                    </Grid>
                    {bulkResults.summary?.unrecognized > 0 && (
                      <Grid item xs={12}>
                        <Alert severity="warning">
                          {bulkResults.summary.unrecognized} entr
                          {bulkResults.summary.unrecognized === 1 ? 'y was' : 'ies were'} not a
                          recognisable IP, domain, or hash and {bulkResults.summary.unrecognized === 1 ? 'was' : 'were'} skipped
                          {bulkResults.unrecognized?.length > 0 && `: ${bulkResults.unrecognized.join(', ')}`}.
                        </Alert>
                      </Grid>
                    )}
                  </Grid>

                  <Divider sx={{ my: 2 }} />

                  <Typography variant="subtitle2" gutterBottom>IPs</Typography>
                  {bulkResults.ips?.map((ip, idx) => (
                    <Chip
                      key={idx}
                      label={`${ip.ip} (${ip.risk_level})`}
                      color={getRiskColor(ip.risk_level)}
                      size="small"
                      sx={{ m: 0.5 }}
                    />
                  ))}
                </CardContent>
              </Card>
            </Grid>
          )}
        </Grid>
      )}

      {/* Saved IOCs */}
      {activeTab === 2 && (
        <SavedIOCs />
      )}
    </Box>
  );
};

export default ThreatIntel;
