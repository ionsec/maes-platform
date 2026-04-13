import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, IconButton, Tooltip, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button,
  FormControl, InputLabel, Select, MenuItem, Paper, Stack, Divider
} from '@mui/material';
import {
  Delete, Save, Refresh, Search, Warning, Security, Link as LinkIcon
} from '@mui/icons-material';
import axios from '../utils/axios';

const SavedIOCs = () => {
  const [savedIOCs, setSavedIOCs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newIOC, setNewIOC] = useState({ value: '', type: 'ip', notes: '' });
  const [error, setError] = useState(null);

  const fetchSavedIOCs = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/threat-intel/saved');
      setSavedIOCs(res.data.iocs || []);
    } catch (err) {
      setError('Failed to load saved IOCs');
      setSavedIOCs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddIOC = async () => {
    try {
      await axios.post('/threat-intel/saved', newIOC);
      setAddDialogOpen(false);
      setNewIOC({ value: '', type: 'ip', notes: '' });
      fetchSavedIOCs();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save IOC');
    }
  };

  const handleDeleteIOC = async (iocId) => {
    try {
      await axios.delete(`/threat-intel/saved/${iocId}`);
      fetchSavedIOCs();
    } catch (err) {
      setError('Failed to delete IOC');
    }
  };

  const handleEnrichIOC = async (ioc) => {
    try {
      const type = ioc.type;
      await axios.get(`/threat-intel/enrich/${type}/${encodeURIComponent(ioc.value)}`);
      fetchSavedIOCs();
    } catch (err) {
      setError('Failed to enrich IOC');
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'ip': return <Security fontSize="small" />;
      case 'domain': return <LinkIcon fontSize="small" />;
      case 'hash': return <Search fontSize="small" />;
      default: return <Security fontSize="small" />;
    }
  };

  const getRiskColor = (level) => {
    const colors = { critical: 'error', high: 'warning', medium: 'info', low: 'success', clean: 'default' };
    return colors[level] || 'default';
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>Saved Indicators of Compromise</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Track and monitor IOCs over time. Saved IOCs can be re-enriched on demand.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <Button variant="outlined" startIcon={<Refresh />} onClick={fetchSavedIOCs} size="small">
          Refresh
        </Button>
        <Button variant="contained" startIcon={<Save />} onClick={() => setAddDialogOpen(true)} size="small">
          Add IOC
        </Button>
      </Stack>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Type</TableCell>
              <TableCell>Value</TableCell>
              <TableCell>Risk Level</TableCell>
              <TableCell>Notes</TableCell>
              <TableCell>Added</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {savedIOCs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  <Typography color="text.secondary" sx={{ py: 3 }}>
                    No saved IOCs yet. Add an IOC to start tracking.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              savedIOCs.map((ioc) => (
                <TableRow key={ioc.id} hover>
                  <TableCell>
                    <Chip icon={getTypeIcon(ioc.type)} label={ioc.type} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{ioc.value}</Typography>
                  </TableCell>
                  <TableCell>
                    {ioc.risk_level ? (
                      <Chip label={ioc.risk_level} color={getRiskColor(ioc.risk_level)} size="small" />
                    ) : (
                      <Typography variant="caption" color="text.secondary">Not enriched</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption">{ioc.notes || '—'}</Typography>
                  </TableCell>
                  <TableCell>{new Date(ioc.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Tooltip title="Enrich">
                      <IconButton size="small" onClick={() => handleEnrichIOC(ioc)}>
                        <Search fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton size="small" onClick={() => handleDeleteIOC(ioc.id)}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)}>
        <DialogTitle>Save IOC</DialogTitle>
        <DialogContent sx={{ minWidth: 400, pt: 2 }}>
          <TextField
            fullWidth
            label="IOC Value"
            placeholder="1.2.3.4, evil.com, or file hash"
            value={newIOC.value}
            onChange={(e) => setNewIOC({ ...newIOC, value: e.target.value })}
            sx={{ mb: 2 }}
          />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Type</InputLabel>
            <Select
              value={newIOC.type}
              label="Type"
              onChange={(e) => setNewIOC({ ...newIOC, type: e.target.value })}
            >
              <MenuItem value="ip">IP Address</MenuItem>
              <MenuItem value="domain">Domain</MenuItem>
              <MenuItem value="hash">File Hash</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="Notes"
            multiline
            rows={2}
            value={newIOC.notes}
            onChange={(e) => setNewIOC({ ...newIOC, notes: e.target.value })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleAddIOC} disabled={!newIOC.value}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SavedIOCs;
