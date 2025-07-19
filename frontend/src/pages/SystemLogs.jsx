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
  LinearProgress
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
  CloudDownload as CloudDownloadIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import dayjs from 'dayjs';
import axios from '../utils/axios';

const logLevels = ['all', 'info', 'warning', 'error', 'debug'];
const logSources = ['all', 'api', 'database', 'extractor', 'analyzer', 'storage', 'auth', 'system'];

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

const sourceIcons = {
  api: <ComputerIcon />,
  database: <StorageIcon />,
  extractor: <CloudDownloadIcon />,
  analyzer: <AnalyticsIcon />,
  storage: <StorageIcon />,
  auth: <SecurityIcon />,
  system: <ComputerIcon />
};

const SystemLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    level: 'all',
    source: 'all',
    search: '',
    startDate: '',
    endDate: ''
  });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const { enqueueSnackbar } = useSnackbar();

  // Generate mock log data
  const generateMockLogs = () => {
    const sources = ['api', 'database', 'extractor', 'analyzer', 'storage', 'auth', 'system'];
    const levels = ['info', 'warning', 'error', 'debug'];
    const messages = {
      info: [
        'User authentication successful',
        'Data extraction completed',
        'Analysis job started',
        'System health check passed',
        'Configuration updated',
        'Backup completed successfully'
      ],
      warning: [
        'High memory usage detected',
        'Slow database query performance',
        'Rate limit approaching threshold',
        'Certificate expiring soon',
        'Disk space getting low'
      ],
      error: [
        'Failed to connect to Microsoft Graph API',
        'Database connection timeout',
        'Analysis job failed with exception',
        'Authentication token expired',
        'Storage service unavailable'
      ],
      debug: [
        'Processing user request',
        'Validating input parameters',
        'Executing database query',
        'Parsing response data',
        'Cleaning up temporary files'
      ]
    };

    const mockLogs = [];
    for (let i = 0; i < 100; i++) {
      const level = levels[Math.floor(Math.random() * levels.length)];
      const source = sources[Math.floor(Math.random() * sources.length)];
      const message = messages[level][Math.floor(Math.random() * messages[level].length)];
      
      mockLogs.push({
        id: i + 1,
        timestamp: dayjs().subtract(Math.floor(Math.random() * 24 * 7), 'hours').toISOString(),
        level,
        source,
        message,
        details: `Additional context for ${message.toLowerCase()}`,
        requestId: `req_${Math.random().toString(36).substr(2, 9)}`,
        userId: Math.random() > 0.5 ? `user_${Math.floor(Math.random() * 100)}` : null
      });
    }

    return mockLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      // In a real application, this would be an API call
      // const response = await axios.get('/api/system/logs', { params: { ...filters, page } });
      
      // For now, use mock data
      const mockLogs = generateMockLogs();
      
      // Apply filters to mock data
      let filteredLogs = mockLogs.filter(log => {
        if (filters.level !== 'all' && log.level !== filters.level) return false;
        if (filters.source !== 'all' && log.source !== filters.source) return false;
        if (filters.search && !log.message.toLowerCase().includes(filters.search.toLowerCase())) return false;
        if (filters.startDate && dayjs(log.timestamp).isBefore(dayjs(filters.startDate))) return false;
        if (filters.endDate && dayjs(log.timestamp).isAfter(dayjs(filters.endDate))) return false;
        return true;
      });

      // Paginate
      const itemsPerPage = 20;
      const startIndex = (page - 1) * itemsPerPage;
      const paginatedLogs = filteredLogs.slice(startIndex, startIndex + itemsPerPage);
      
      setLogs(paginatedLogs);
      setTotalPages(Math.ceil(filteredLogs.length / itemsPerPage));
    } catch (error) {
      enqueueSnackbar('Failed to fetch system logs', { variant: 'error' });
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
                <InputLabel>Source</InputLabel>
                <Select
                  value={filters.source}
                  label="Source"
                  onChange={(e) => handleFilterChange('source', e.target.value)}
                >
                  {logSources.map(source => (
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