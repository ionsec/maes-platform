import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  FormGroup,
  Alert,
  Tooltip,
  Avatar,
  Menu,
  ListItemIcon,
  ListItemText,
  Divider,
  Grid,
  InputAdornment,
  Pagination
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Search as SearchIcon,
  MoreVert as MoreVertIcon,
  Block as BlockIcon,
  CheckCircle as CheckCircleIcon,
  VpnKey as VpnKeyIcon,
  PersonAdd as PersonAddIcon,
  Shield as ShieldIcon,
  Refresh as RefreshIcon,
  Download as DownloadIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { useAuthStore } from '../stores/authStore';
import axios from '../utils/axios';
import dayjs from 'dayjs';

const UserManagement = () => {
  const { user: currentUser } = useAuthStore();
  const { enqueueSnackbar } = useSnackbar();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [editDialog, setEditDialog] = useState({ open: false, user: null });
  const [permissionsDialog, setPermissionsDialog] = useState({ open: false, user: null });
  const [createDialog, setCreateDialog] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [showAllOrganizations, setShowAllOrganizations] = useState(false);
  const [createUserData, setCreateUserData] = useState({
    email: '',
    username: '',
    firstName: '',
    lastName: '',
    password: '',
    role: 'viewer',
    organizationId: '',
    accessibleOrganizations: []
  });
  const [organizationAccessDialog, setOrganizationAccessDialog] = useState({ open: false, user: null });

  // Available permissions based on the backend ROLE_PERMISSIONS
  const availablePermissions = {
    canManageExtractions: 'Manage Extractions',
    canRunAnalysis: 'Run Analysis',
    canViewReports: 'View Reports',
    canManageAlerts: 'Manage Alerts',
    canManageUsers: 'Manage Users',
    canManageOrganization: 'Manage Organization',
    canManageClients: 'Manage Clients',
    canAccessAllClients: 'Access All Clients',
    canManageMsspSettings: 'Manage MSSP Settings',
    canViewBilling: 'View Billing',
    canManageSubscriptions: 'Manage Subscriptions',
    canUseAdvancedAnalytics: 'Use Advanced Analytics',
    canAccessThreatIntel: 'Access Threat Intelligence',
    canManageIntegrations: 'Manage Integrations',
    canExportData: 'Export Data',
    canViewAuditLogs: 'View Audit Logs',
    canManageSystemSettings: 'Manage System Settings',
    canAccessApi: 'Access API',
    canCreateOrganizations: 'Create Organizations',
    canDeleteOrganizations: 'Delete Organizations',
    canManageAllUsers: 'Manage All Users',
    canImpersonateUsers: 'Impersonate Users',
    canViewSystemLogs: 'View System Logs',
    canManageApiKeys: 'Manage API Keys',
    canManageLicenses: 'Manage Licenses',
    canConfigureGlobalSettings: 'Configure Global Settings',
    canManageBackups: 'Manage Backups',
    canAccessDeveloperTools: 'Access Developer Tools'
  };

  const isSuperAdmin = currentUser?.role === 'admin' || currentUser?.role === 'super_admin';
  const roles = isSuperAdmin ? ['super_admin', 'admin', 'analyst', 'viewer'] : ['admin', 'analyst', 'viewer'];

  useEffect(() => {
    fetchUsers();
  }, [page, searchQuery, roleFilter, statusFilter, showAllOrganizations]);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchOrganizations();
    }
  }, [isSuperAdmin]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 10,
        search: searchQuery,
        role: roleFilter !== 'all' ? roleFilter : undefined,
        isActive: statusFilter !== 'all' ? statusFilter === 'active' : undefined,
        allOrganizations: isSuperAdmin && showAllOrganizations
      };

      const response = await axios.get('/api/users', { params });
      setUsers(response.data.users);
      setTotalPages(response.data.pagination.totalPages);
    } catch (error) {
      enqueueSnackbar('Failed to fetch users', { variant: 'error' });
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrganizations = async () => {
    try {
      const response = await axios.get('/api/users/organizations/all');
      setOrganizations(response.data.organizations);
    } catch (error) {
      console.error('Failed to fetch organizations:', error);
    }
  };

  const handleEditUser = async (userData) => {
    try {
      await axios.put(`/api/users/${userData.id}`, {
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.role,
        isActive: userData.isActive
      });
      
      enqueueSnackbar('User updated successfully', { variant: 'success' });
      setEditDialog({ open: false, user: null });
      fetchUsers();
    } catch (error) {
      enqueueSnackbar(error.response?.data?.error || 'Failed to update user', { variant: 'error' });
    }
  };

  const handleUpdatePermissions = async (userId, permissions) => {
    try {
      await axios.patch(`/api/users/${userId}/permissions`, { permissions });
      enqueueSnackbar('Permissions updated successfully', { variant: 'success' });
      setPermissionsDialog({ open: false, user: null });
      fetchUsers();
    } catch (error) {
      enqueueSnackbar(error.response?.data?.error || 'Failed to update permissions', { variant: 'error' });
    }
  };

  const handleCreateUser = async () => {
    try {
      await axios.post('/api/users', createUserData);
      enqueueSnackbar('User created successfully', { variant: 'success' });
      setCreateDialog(false);
      setCreateUserData({
        email: '',
        username: '',
        firstName: '',
        lastName: '',
        password: '',
        role: 'viewer',
        organizationId: '',
        accessibleOrganizations: []
      });
      fetchUsers();
    } catch (error) {
      enqueueSnackbar(error.response?.data?.error || 'Failed to create user', { variant: 'error' });
    }
  };

  const handleUpdateOrganizationAccess = async (userId, accessibleOrganizations) => {
    try {
      await axios.patch(`/api/users/${userId}/organization-access`, { accessibleOrganizations });
      enqueueSnackbar('Organization access updated successfully', { variant: 'success' });
      setOrganizationAccessDialog({ open: false, user: null });
      fetchUsers();
    } catch (error) {
      enqueueSnackbar(error.response?.data?.error || 'Failed to update organization access', { variant: 'error' });
    }
  };

  const handleDeactivateUser = async (userId) => {
    try {
      await axios.patch(`/api/users/${userId}/deactivate`);
      enqueueSnackbar('User deactivated successfully', { variant: 'success' });
      fetchUsers();
    } catch (error) {
      enqueueSnackbar('Failed to deactivate user', { variant: 'error' });
    }
  };

  const handleReactivateUser = async (userId) => {
    try {
      await axios.patch(`/api/users/${userId}/reactivate`);
      enqueueSnackbar('User reactivated successfully', { variant: 'success' });
      fetchUsers();
    } catch (error) {
      enqueueSnackbar('Failed to reactivate user', { variant: 'error' });
    }
  };

  const handleResetPassword = async (userId) => {
    try {
      await axios.patch(`/api/users/${userId}/password`, {
        newPassword: 'TempPassword123!' // In production, generate a secure random password
      });
      enqueueSnackbar('Password reset successfully. Temporary password: TempPassword123!', { 
        variant: 'success',
        persist: true
      });
    } catch (error) {
      enqueueSnackbar('Failed to reset password', { variant: 'error' });
    }
  };

  const exportUsers = () => {
    const csvContent = [
      ['ID', 'Email', 'Username', 'Name', 'Role', 'Status', 'Created At'],
      ...users.map(user => [
        user.id,
        user.email,
        user.username,
        `${user.firstName} ${user.lastName}`,
        user.role,
        user.isActive ? 'Active' : 'Inactive',
        dayjs(user.createdAt).format('YYYY-MM-DD HH:mm:ss')
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `users-${dayjs().format('YYYY-MM-DD')}.csv`;
    a.click();
  };

  const handleMenuOpen = (event, user) => {
    setAnchorEl(event.currentTarget);
    setSelectedUser(user);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedUser(null);
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4">User Management</Typography>
          {isSuperAdmin && (
            <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={showAllOrganizations}
                    onChange={(e) => setShowAllOrganizations(e.target.checked)}
                    size="small"
                  />
                }
                label="Show users from all organizations"
              />
              <Chip 
                label="Super Admin" 
                color="error" 
                size="small" 
                icon={<ShieldIcon />}
              />
            </Box>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={exportUsers}
            size="small"
          >
            Export
          </Button>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchUsers}
            size="small"
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<PersonAddIcon />}
            onClick={() => setCreateDialog(true)}
          >
            Add User
          </Button>
        </Box>
      </Box>

      {/* Filters */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                size="small"
                placeholder="Search by name, email, or username..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Role</InputLabel>
                <Select
                  value={roleFilter}
                  label="Role"
                  onChange={(e) => setRoleFilter(e.target.value)}
                >
                  <MenuItem value="all">All Roles</MenuItem>
                  <MenuItem value="admin">Admin</MenuItem>
                  <MenuItem value="analyst">Analyst</MenuItem>
                  <MenuItem value="viewer">Viewer</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Status</InputLabel>
                <Select
                  value={statusFilter}
                  label="Status"
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <MenuItem value="all">All Status</MenuItem>
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="inactive">Inactive</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={2}>
              <Typography variant="body2" color="text.secondary">
                Total: {users.length} users
              </Typography>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* Users Table */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>User</TableCell>
              <TableCell>Role</TableCell>
              {showAllOrganizations && <TableCell>Organization</TableCell>}
              <TableCell>Status</TableCell>
              <TableCell>Permissions</TableCell>
              <TableCell>Last Login</TableCell>
              <TableCell>Created</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Avatar sx={{ width: 32, height: 32 }}>
                      {user.firstName?.[0]}{user.lastName?.[0]}
                    </Avatar>
                    <Box>
                      <Typography variant="body2" fontWeight={500}>
                        {user.firstName} {user.lastName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {user.email}
                      </Typography>
                    </Box>
                  </Box>
                </TableCell>
                <TableCell>
                  <Chip 
                    label={user.role} 
                    size="small"
                    color={user.role === 'admin' ? 'error' : user.role === 'analyst' ? 'warning' : 'default'}
                  />
                </TableCell>
                {showAllOrganizations && (
                  <TableCell>
                    <Box>
                      <Typography variant="body2" fontWeight={500}>
                        {user.organizationName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {user.organizationType}
                      </Typography>
                    </Box>
                  </TableCell>
                )}
                <TableCell>
                  <Chip
                    icon={user.isActive ? <CheckCircleIcon /> : <BlockIcon />}
                    label={user.isActive ? 'Active' : 'Inactive'}
                    size="small"
                    color={user.isActive ? 'success' : 'default'}
                  />
                </TableCell>
                <TableCell>
                  <Tooltip title="View/Edit Permissions">
                    <Button
                      size="small"
                      startIcon={<ShieldIcon />}
                      onClick={() => setPermissionsDialog({ open: true, user })}
                    >
                      {Object.keys(user.permissions || {}).filter(k => user.permissions[k]).length} Active
                    </Button>
                  </Tooltip>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {user.lastLoginAt ? dayjs(user.lastLoginAt).fromNow() : 'Never'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {dayjs(user.createdAt).format('MMM DD, YYYY')}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <IconButton
                    size="small"
                    onClick={(e) => handleMenuOpen(e, user)}
                    disabled={user.id === currentUser?.id && !isSuperAdmin}
                  >
                    <MoreVertIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination */}
      {totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(e, value) => setPage(value)}
            color="primary"
          />
        </Box>
      )}

      {/* Action Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => {
          setEditDialog({ open: true, user: selectedUser });
          handleMenuClose();
        }}>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Edit User</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => {
          setPermissionsDialog({ open: true, user: selectedUser });
          handleMenuClose();
        }}>
          <ListItemIcon><ShieldIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Manage Permissions</ListItemText>
        </MenuItem>
        {isSuperAdmin && (
          <MenuItem onClick={() => {
            setOrganizationAccessDialog({ open: true, user: selectedUser });
            handleMenuClose();
          }}>
            <ListItemIcon><AddIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Organization Access</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={() => {
          handleResetPassword(selectedUser.id);
          handleMenuClose();
        }}>
          <ListItemIcon><VpnKeyIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Reset Password</ListItemText>
        </MenuItem>
        <Divider />
        {selectedUser?.isActive ? (
          <MenuItem onClick={() => {
            handleDeactivateUser(selectedUser.id);
            handleMenuClose();
          }}>
            <ListItemIcon><BlockIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Deactivate User</ListItemText>
          </MenuItem>
        ) : (
          <MenuItem onClick={() => {
            handleReactivateUser(selectedUser.id);
            handleMenuClose();
          }}>
            <ListItemIcon><CheckCircleIcon fontSize="small" /></ListItemIcon>
            <ListItemText>Reactivate User</ListItemText>
          </MenuItem>
        )}
      </Menu>

      {/* Edit User Dialog */}
      <Dialog open={editDialog.open} onClose={() => setEditDialog({ open: false, user: null })} maxWidth="sm" fullWidth>
        <DialogTitle>Edit User</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              fullWidth
              label="First Name"
              value={editDialog.user?.firstName || ''}
              onChange={(e) => setEditDialog({
                ...editDialog,
                user: { ...editDialog.user, firstName: e.target.value }
              })}
            />
            <TextField
              fullWidth
              label="Last Name"
              value={editDialog.user?.lastName || ''}
              onChange={(e) => setEditDialog({
                ...editDialog,
                user: { ...editDialog.user, lastName: e.target.value }
              })}
            />
            <FormControl fullWidth>
              <InputLabel>Role</InputLabel>
              <Select
                value={editDialog.user?.role || ''}
                label="Role"
                onChange={(e) => setEditDialog({
                  ...editDialog,
                  user: { ...editDialog.user, role: e.target.value }
                })}
              >
                {roles.map(role => (
                  <MenuItem key={role} value={role}>
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControlLabel
              control={
                <Switch
                  checked={editDialog.user?.isActive || false}
                  onChange={(e) => setEditDialog({
                    ...editDialog,
                    user: { ...editDialog.user, isActive: e.target.checked }
                  })}
                />
              }
              label="Active"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog({ open: false, user: null })}>Cancel</Button>
          <Button variant="contained" onClick={() => handleEditUser(editDialog.user)}>
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Permissions Dialog */}
      <Dialog 
        open={permissionsDialog.open} 
        onClose={() => setPermissionsDialog({ open: false, user: null })} 
        maxWidth="sm" 
        fullWidth
      >
        <DialogTitle>
          Manage Permissions - {permissionsDialog.user?.firstName} {permissionsDialog.user?.lastName}
        </DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            Permissions override role-based defaults. Toggle individual permissions as needed.
          </Alert>
          <FormGroup>
            {Object.entries(availablePermissions).map(([key, label]) => (
              <FormControlLabel
                key={key}
                control={
                  <Switch
                    checked={permissionsDialog.user?.permissions?.[key] || false}
                    onChange={(e) => setPermissionsDialog({
                      ...permissionsDialog,
                      user: {
                        ...permissionsDialog.user,
                        permissions: {
                          ...permissionsDialog.user.permissions,
                          [key]: e.target.checked
                        }
                      }
                    })}
                  />
                }
                label={label}
              />
            ))}
          </FormGroup>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPermissionsDialog({ open: false, user: null })}>Cancel</Button>
          <Button 
            variant="contained" 
            onClick={() => handleUpdatePermissions(
              permissionsDialog.user.id, 
              permissionsDialog.user.permissions
            )}
          >
            Save Permissions
          </Button>
        </DialogActions>
      </Dialog>

      {/* Organization Access Dialog */}
      <Dialog 
        open={organizationAccessDialog.open} 
        onClose={() => setOrganizationAccessDialog({ open: false, user: null })} 
        maxWidth="sm" 
        fullWidth
      >
        <DialogTitle>
          Organization Access - {organizationAccessDialog.user?.firstName} {organizationAccessDialog.user?.lastName}
        </DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            Select which organizations this user can access. This enables cross-organization permissions.
          </Alert>
          <FormGroup>
            {organizations.map((org) => (
              <FormControlLabel
                key={org.id}
                control={
                  <Switch
                    checked={organizationAccessDialog.user?.accessibleOrganizations?.includes(org.id) || false}
                    onChange={(e) => {
                      const currentAccess = organizationAccessDialog.user?.accessibleOrganizations || [];
                      const newAccess = e.target.checked
                        ? [...currentAccess, org.id]
                        : currentAccess.filter(id => id !== org.id);
                      
                      setOrganizationAccessDialog({
                        ...organizationAccessDialog,
                        user: {
                          ...organizationAccessDialog.user,
                          accessibleOrganizations: newAccess
                        }
                      });
                    }}
                  />
                }
                label={`${org.name} (${org.organizationType})`}
              />
            ))}
          </FormGroup>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOrganizationAccessDialog({ open: false, user: null })}>Cancel</Button>
          <Button 
            variant="contained" 
            onClick={() => handleUpdateOrganizationAccess(
              organizationAccessDialog.user.id, 
              organizationAccessDialog.user.accessibleOrganizations
            )}
          >
            Update Access
          </Button>
        </DialogActions>
      </Dialog>

      {/* Create User Dialog */}
      <Dialog open={createDialog} onClose={() => setCreateDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New User</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              fullWidth
              label="Email"
              type="email"
              value={createUserData.email}
              onChange={(e) => setCreateUserData({ ...createUserData, email: e.target.value })}
              required
            />
            <TextField
              fullWidth
              label="Username"
              value={createUserData.username}
              onChange={(e) => setCreateUserData({ ...createUserData, username: e.target.value })}
              required
            />
            <TextField
              fullWidth
              label="First Name"
              value={createUserData.firstName}
              onChange={(e) => setCreateUserData({ ...createUserData, firstName: e.target.value })}
              required
            />
            <TextField
              fullWidth
              label="Last Name"
              value={createUserData.lastName}
              onChange={(e) => setCreateUserData({ ...createUserData, lastName: e.target.value })}
              required
            />
            <TextField
              fullWidth
              label="Password"
              type="password"
              value={createUserData.password}
              onChange={(e) => setCreateUserData({ ...createUserData, password: e.target.value })}
              required
              helperText="Minimum 8 characters"
            />
            <FormControl fullWidth>
              <InputLabel>Role</InputLabel>
              <Select
                value={createUserData.role}
                label="Role"
                onChange={(e) => setCreateUserData({ ...createUserData, role: e.target.value })}
              >
                {roles.map(role => (
                  <MenuItem key={role} value={role}>
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {isSuperAdmin && (
              <FormControl fullWidth>
                <InputLabel>Organization</InputLabel>
                <Select
                  value={createUserData.organizationId}
                  label="Organization"
                  onChange={(e) => setCreateUserData({ ...createUserData, organizationId: e.target.value })}
                >
                  <MenuItem value="">Current Organization</MenuItem>
                  {organizations.map(org => (
                    <MenuItem key={org.id} value={org.id}>
                      {org.name} ({org.organizationType})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreateUser}>Create User</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default UserManagement;