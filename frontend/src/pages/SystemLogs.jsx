import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Alert,
  Pagination,
  Tooltip,
  Badge,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Collapse
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Download as DownloadIcon,
  FilterList as FilterIcon,
  Clear as ClearIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Computer as ComputerIcon,
  Storage as StorageIcon,
  Security as SecurityIcon,
  Analytics as AnalyticsIcon,
  CloudDownload as CloudDownloadIcon,
  Visibility as VisibilityIcon,
  ExpandMore as ExpandMoreIcon,
  Close as CloseIcon,
  ContentCopy as ContentCopyIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import dayjs from 'dayjs';
import axios from '../utils/axios';

const logLevels = ['all', 'info', 'warning', 'error', 'debug'];
const logContainers = ['all', 'maes-api', 'maes-extractor', 'maes-analyzer', 'maes-postgres', 'maes-redis'];

const levelColors = {
  info: 'info',
  warning: 'warning', 
  error: 'error',
  debug: 'default'
};

const levelIcons = {
  info: <InfoIcon />,
  warning: <WarningIcon />,
  error: <ErrorIcon />,
  debug: <ComputerIcon />
};

const containerIcons = {
  'maes-api': <ComputerIcon />,
  'maes-postgres': <StorageIcon />,
  'maes-extractor': <CloudDownloadIcon />,
  'maes-analyzer': <AnalyticsIcon />,
  'maes-redis': <StorageIcon />,
  'system': <ComputerIcon />
};

const SystemLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    level: 'all',
    container: 'all',
    search: '',
    lines: '100'
  });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [rawLogDialog, setRawLogDialog] = useState({ open: false, log: null });
  const [expandedLogs, setExpandedLogs] = useState(new Set());
  const { enqueueSnackbar } = useSnackbar();

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/system/logs', { 
        params: { 
          ...filters, 
          page,
          limit: 20
        } 
      });
      
      const { logs: fetchedLogs, pagination } = response.data;
      
      setLogs(fetchedLogs);
      setTotalPages(pagination.totalPages);
    } catch (error) {
      enqueueSnackbar('Failed to fetch system logs', { variant: 'error' });
      console.error('System logs fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [filters, page]);

  useEffect(() => {
    let interval;
    if (autoRefresh) {
      interval = setInterval(fetchLogs, 30000); // Refresh every 30 seconds
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, filters, page]);

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({
      level: 'all',
      source: 'all',
      search: '',
      startDate: '',
      endDate: ''
    });
    setPage(1);
  };

  const exportLogs = () => {
    // Mock export functionality
    const dataStr = JSON.stringify(logs, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `system-logs-${dayjs().format('YYYY-MM-DD-HH-mm')}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    
    enqueueSnackbar('Logs exported successfully', { variant: 'success' });
  };

  const getLogStats = () => {
    const stats = {
      total: logs.length,
      info: logs.filter(log => log.level === 'info').length,
      warning: logs.filter(log => log.level === 'warning').length,
      error: logs.filter(log => log.level === 'error').length,
      debug: logs.filter(log => log.level === 'debug').length
    };
    return stats;
  };

  const stats = getLogStats();

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">System Logs</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Auto-refresh">
            <Button
              variant={autoRefresh ? "contained" : "outlined"}
              size="small"
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              {autoRefresh ? 'Auto On' : 'Auto Off'}
            </Button>
          </Tooltip>
          <IconButton onClick={fetchLogs} disabled={loading}>
            <RefreshIcon />
          </IconButton>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={exportLogs}
            size="small"
          >
            Export
          </Button>
        </Box>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={2.4}>
          <Card>
            <CardContent>
              <Typography variant="h6" color="primary">
                {stats.total}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total Logs
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={2.4}>
          <Card>
            <CardContent>
              <Typography variant="h6" color="info.main">
                {stats.info}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Info
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={2.4}>
          <Card>
            <CardContent>
              <Typography variant="h6" color="warning.main">
                {stats.warning}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Warnings
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={2.4}>
          <Card>
            <CardContent>
              <Typography variant="h6" color="error.main">
                {stats.error}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Errors
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={2.4}>
          <Card>
            <CardContent>
              <Typography variant="h6" color="text.secondary">
                {stats.debug}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Debug
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <FilterIcon />
            <Typography variant="h6">Filters</Typography>
            <Button
              size="small"
              startIcon={<ClearIcon />}
              onClick={clearFilters}
            >
              Clear All
            </Button>
          </Box>
          
          <Grid container spacing={2}>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Level</InputLabel>
                <Select
                  value={filters.level}
                  label="Level"
                  onChange={(e) => handleFilterChange('level', e.target.value)}
                >
                  {logLevels.map(level => (
                    <MenuItem key={level} value={level}>
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Container</InputLabel>
                <Select
                  value={filters.container}
                  label="Container"
                  onChange={(e) => handleFilterChange('container', e.target.value)}
                >
                  {logContainers.map(source => (
                    <MenuItem key={source} value={source}>
                      {source.charAt(0).toUpperCase() + source.slice(1)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                size="small"
                label="Search"
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                placeholder="Search log messages..."
              />
            </Grid>
            <Grid item xs={12} md={2.5}>
              <TextField
                fullWidth
                size="small"
                type="datetime-local"
                label="Start Date"
                value={filters.startDate}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} md={2.5}>
              <TextField
                fullWidth
                size="small"
                type="datetime-local"
                label="End Date"
                value={filters.endDate}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {/* Logs Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Timestamp</TableCell>
              <TableCell>Level</TableCell>
              <TableCell>Source</TableCell>
              <TableCell>Message</TableCell>
              <TableCell>Request ID</TableCell>
              <TableCell>User</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell>
                  <Typography variant="body2">
                    {dayjs(log.timestamp).format('MMM DD, HH:mm:ss')}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {dayjs(log.timestamp).fromNow()}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    icon={levelIcons[log.level]}
                    label={log.level.toUpperCase()}
                    color={levelColors[log.level]}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {sourceIcons[log.source]}
                    <Typography variant="body2">
                      {log.source}
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {log.message}
                  </Typography>
                  {log.details && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {log.details}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                    {log.requestId}
                  </Typography>
                </TableCell>
                <TableCell>
                  {log.userId ? (
                    <Typography variant="caption">
                      {log.userId}
                    </Typography>
                  ) : (
                    <Typography variant="caption" color="text.secondary">
                      System
                    </Typography>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {logs.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  <Typography variant="body2" color="text.secondary">
                    No logs found matching the current filters.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination */}
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(event, value) => setPage(value)}
            color="primary"
            showFirstButton
            showLastButton
          />
        </Box>
      )}

      {/* Info Alert */}
      <Alert severity="info" sx={{ mt: 3 }}>
        <Typography variant="body2">
          System logs are automatically rotated and archived. Historical logs beyond 30 days are available upon request.
          {autoRefresh && ' Auto-refresh is enabled - logs update every 30 seconds.'}
        </Typography>
      </Alert>
    </Box>
  );
};

export default SystemLogs;