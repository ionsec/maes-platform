import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  TextField,
  Button,
  Avatar,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Alert,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemSecondaryAction,
  Tab,
  Tabs,
  Paper,
  Badge,
  Tooltip,
  LinearProgress
} from '@mui/material';
import {
  Edit as EditIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  PhotoCamera as PhotoCameraIcon,
  Security as SecurityIcon,
  Notifications as NotificationsIcon,
  Language as LanguageIcon,
  Palette as PaletteIcon,
  Shield as ShieldIcon,
  Person as PersonIcon,
  Email as EmailIcon,
  Phone as PhoneIcon,
  Business as BusinessIcon,
  LocationOn as LocationIcon,
  AccessTime as AccessTimeIcon,
  VpnKey as VpnKeyIcon,
  History as HistoryIcon,
  Logout as LogoutIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  Computer as ComputerIcon
} from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { useSnackbar } from 'notistack';
import { useAuthStore } from '../stores/authStore';
import { useTheme } from '../theme/ThemeProvider';
import { themes } from '../theme/themes';
import ThemeSelector from '../components/ThemeSelector';
import dayjs from 'dayjs';
import axios from '../utils/axios';

const UserProfile = () => {
  const { user, updateUser } = useAuthStore();
  const { currentThemeId } = useTheme();
  const { enqueueSnackbar } = useSnackbar();
  const [tabValue, setTabValue] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [profilePicture, setProfilePicture] = useState(null);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [userSessions, setUserSessions] = useState([]);
  const [userActivity, setUserActivity] = useState([]);
  const [preferences, setPreferences] = useState({
    emailNotifications: true,
    pushNotifications: false,
    securityAlerts: true,
    systemUpdates: true,
    reportNotifications: true,
    language: 'en',
    timezone: 'UTC',
    dateFormat: 'YYYY-MM-DD',
    theme: currentThemeId
  });

  const { control, handleSubmit, reset, formState: { errors, isDirty } } = useForm({
    defaultValues: {
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      email: user?.email || '',
      phone: user?.phone || '',
      organization: user?.organization || '',
      department: user?.department || '',
      jobTitle: user?.jobTitle || '',
      location: user?.location || '',
      bio: user?.bio || ''
    }
  });

  const { control: passwordControl, handleSubmit: handlePasswordSubmit, reset: resetPassword } = useForm({
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    }
  });

  useEffect(() => {
    fetchUserPreferences();
    fetchUserSessions();
    fetchUserActivity();
  }, []);

  const fetchUserPreferences = async () => {
    try {
      const response = await axios.get('/api/user/preferences');
      setPreferences(prev => ({ ...prev, ...response.data.preferences }));
    } catch (error) {
      console.error('Failed to fetch preferences:', error);
    }
  };

  const fetchUserSessions = async () => {
    try {
      const response = await axios.get('/api/user/sessions');
      setUserSessions(response.data.sessions || []);
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    }
  };

  const fetchUserActivity = async () => {
    try {
      const response = await axios.get('/api/user/activity');
      setUserActivity(response.data.activities || []);
    } catch (error) {
      console.error('Failed to fetch activity:', error);
    }
  };

  const onSubmitProfile = async (data) => {
    setLoading(true);
    try {
      const response = await axios.put('/api/user/profile', data);
      updateUser(response.data.user);
      enqueueSnackbar('Profile updated successfully', { variant: 'success' });
      setEditMode(false);
    } catch (error) {
      enqueueSnackbar(error.response?.data?.error || 'Failed to update profile', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const onSubmitPassword = async (data) => {
    if (data.newPassword !== data.confirmPassword) {
      enqueueSnackbar('Passwords do not match', { variant: 'error' });
      return;
    }

    setLoading(true);
    try {
      await axios.put('/api/user/password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword
      });
      enqueueSnackbar('Password changed successfully', { variant: 'success' });
      setChangePasswordOpen(false);
      resetPassword();
    } catch (error) {
      enqueueSnackbar(error.response?.data?.error || 'Failed to change password', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handlePreferenceChange = async (key, value) => {
    const updatedPreferences = { ...preferences, [key]: value };
    setPreferences(updatedPreferences);
    
    try {
      await axios.put('/api/user/preferences', { preferences: updatedPreferences });
      enqueueSnackbar('Preferences updated', { variant: 'success' });
    } catch (error) {
      enqueueSnackbar('Failed to update preferences', { variant: 'error' });
      // Revert on error
      setPreferences(preferences);
    }
  };

  const handleProfilePictureUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      enqueueSnackbar('File size must be less than 5MB', { variant: 'error' });
      return;
    }

    const formData = new FormData();
    formData.append('profilePicture', file);

    setLoading(true);
    try {
      const response = await axios.post('/api/user/profile-picture', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      updateUser(response.data.user);
      enqueueSnackbar('Profile picture updated', { variant: 'success' });
    } catch (error) {
      enqueueSnackbar('Failed to upload profile picture', { variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const terminateSession = async (sessionId) => {
    try {
      await axios.delete(`/api/user/sessions/${sessionId}`);
      setUserSessions(prev => prev.filter(session => session.id !== sessionId));
      enqueueSnackbar('Session terminated', { variant: 'success' });
    } catch (error) {
      enqueueSnackbar('Failed to terminate session', { variant: 'error' });
    }
  };

  const terminateAllOtherSessions = async () => {
    try {
      await axios.post('/api/user/sessions/terminate-others');
      fetchUserSessions();
      enqueueSnackbar('All other sessions terminated', { variant: 'success' });
    } catch (error) {
      enqueueSnackbar('Failed to terminate sessions', { variant: 'error' });
    }
  };

  const TabPanel = ({ children, value, index }) => (
    <div hidden={value !== index}>
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">User Profile</Typography>
        <Box>
          {editMode && (
            <>
              <Button
                variant="outlined"
                startIcon={<CancelIcon />}
                onClick={() => {
                  setEditMode(false);
                  reset();
                }}
                sx={{ mr: 1 }}
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={handleSubmit(onSubmitProfile)}
                disabled={loading || !isDirty}
              >
                Save Changes
              </Button>
            </>
          )}
          {!editMode && (
            <Button
              variant="contained"
              startIcon={<EditIcon />}
              onClick={() => setEditMode(true)}
            >
              Edit Profile
            </Button>
          )}
        </Box>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      <Paper sx={{ width: '100%' }}>
        <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)}>
          <Tab icon={<PersonIcon />} label="Personal Info" />
          <Tab icon={<NotificationsIcon />} label="Preferences" />
          <Tab icon={<SecurityIcon />} label="Security" />
          <Tab icon={<HistoryIcon />} label="Activity" />
        </Tabs>

        {/* Personal Information Tab */}
        <TabPanel value={tabValue} index={0}>
          <Grid container spacing={3}>
            {/* Profile Picture and Basic Info */}
            <Grid item xs={12} md={4}>
              <Card>
                <CardContent sx={{ textAlign: 'center' }}>
                  <Box sx={{ position: 'relative', display: 'inline-block', mb: 2 }}>
                    <Avatar
                      sx={{ width: 120, height: 120, mx: 'auto', mb: 2 }}
                      src={user?.profilePicture}
                    >
                      {user?.firstName?.[0]}{user?.lastName?.[0]}
                    </Avatar>
                    {editMode && (
                      <IconButton
                        component="label"
                        sx={{
                          position: 'absolute',
                          bottom: 8,
                          right: -8,
                          backgroundColor: 'primary.main',
                          color: 'white',
                          '&:hover': { backgroundColor: 'primary.dark' }
                        }}
                      >
                        <PhotoCameraIcon />
                        <input
                          type="file"
                          hidden
                          accept="image/*"
                          onChange={handleProfilePictureUpload}
                        />
                      </IconButton>
                    )}
                  </Box>
                  <Typography variant="h6">
                    {user?.firstName} {user?.lastName}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {user?.jobTitle || 'Security Analyst'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {user?.organization || 'IONSEC Organization'}
                  </Typography>
                  
                  <Divider sx={{ my: 2 }} />
                  
                  <Box sx={{ textAlign: 'left' }}>
                    <Typography variant="subtitle2" gutterBottom>Account Status</Typography>
                    <Chip 
                      label="Active" 
                      color="success" 
                      size="small" 
                      icon={<CheckIcon />}
                      sx={{ mb: 1 }}
                    />
                    <Typography variant="caption" display="block" color="text.secondary">
                      Member since {dayjs(user?.createdAt).format('MMMM YYYY')}
                    </Typography>
                    <Typography variant="caption" display="block" color="text.secondary">
                      Last login: {dayjs(user?.lastLoginAt).format('MMM DD, YYYY HH:mm')}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            {/* Profile Form */}
            <Grid item xs={12} md={8}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>Personal Information</Typography>
                  <form onSubmit={handleSubmit(onSubmitProfile)}>
                    <Grid container spacing={3}>
                      <Grid item xs={12} sm={6}>
                        <Controller
                          name="firstName"
                          control={control}
                          rules={{ required: 'First name is required' }}
                          render={({ field }) => (
                            <TextField
                              {...field}
                              fullWidth
                              label="First Name"
                              disabled={!editMode}
                              error={!!errors.firstName}
                              helperText={errors.firstName?.message}
                            />
                          )}
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Controller
                          name="lastName"
                          control={control}
                          rules={{ required: 'Last name is required' }}
                          render={({ field }) => (
                            <TextField
                              {...field}
                              fullWidth
                              label="Last Name"
                              disabled={!editMode}
                              error={!!errors.lastName}
                              helperText={errors.lastName?.message}
                            />
                          )}
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Controller
                          name="email"
                          control={control}
                          rules={{ 
                            required: 'Email is required',
                            pattern: {
                              value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                              message: 'Invalid email address'
                            }
                          }}
                          render={({ field }) => (
                            <TextField
                              {...field}
                              fullWidth
                              label="Email"
                              type="email"
                              disabled={!editMode}
                              error={!!errors.email}
                              helperText={errors.email?.message}
                            />
                          )}
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Controller
                          name="phone"
                          control={control}
                          render={({ field }) => (
                            <TextField
                              {...field}
                              fullWidth
                              label="Phone Number"
                              disabled={!editMode}
                            />
                          )}
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Controller
                          name="organization"
                          control={control}
                          render={({ field }) => (
                            <TextField
                              {...field}
                              fullWidth
                              label="Organization"
                              disabled={!editMode}
                            />
                          )}
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Controller
                          name="department"
                          control={control}
                          render={({ field }) => (
                            <TextField
                              {...field}
                              fullWidth
                              label="Department"
                              disabled={!editMode}
                            />
                          )}
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Controller
                          name="jobTitle"
                          control={control}
                          render={({ field }) => (
                            <TextField
                              {...field}
                              fullWidth
                              label="Job Title"
                              disabled={!editMode}
                            />
                          )}
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Controller
                          name="location"
                          control={control}
                          render={({ field }) => (
                            <TextField
                              {...field}
                              fullWidth
                              label="Location"
                              disabled={!editMode}
                            />
                          )}
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <Controller
                          name="bio"
                          control={control}
                          render={({ field }) => (
                            <TextField
                              {...field}
                              fullWidth
                              label="Bio"
                              multiline
                              rows={3}
                              disabled={!editMode}
                              placeholder="Tell us about yourself..."
                            />
                          )}
                        />
                      </Grid>
                    </Grid>
                  </form>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>

        {/* Preferences Tab */}
        <TabPanel value={tabValue} index={1}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    <NotificationsIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Notification Preferences
                  </Typography>
                  <List>
                    <ListItem>
                      <ListItemText
                        primary="Email Notifications"
                        secondary="Receive alerts and updates via email"
                      />
                      <ListItemSecondaryAction>
                        <Switch
                          checked={preferences.emailNotifications}
                          onChange={(e) => handlePreferenceChange('emailNotifications', e.target.checked)}
                        />
                      </ListItemSecondaryAction>
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Push Notifications"
                        secondary="Browser push notifications for urgent alerts"
                      />
                      <ListItemSecondaryAction>
                        <Switch
                          checked={preferences.pushNotifications}
                          onChange={(e) => handlePreferenceChange('pushNotifications', e.target.checked)}
                        />
                      </ListItemSecondaryAction>
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Security Alerts"
                        secondary="Critical security notifications"
                      />
                      <ListItemSecondaryAction>
                        <Switch
                          checked={preferences.securityAlerts}
                          onChange={(e) => handlePreferenceChange('securityAlerts', e.target.checked)}
                        />
                      </ListItemSecondaryAction>
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="System Updates"
                        secondary="Platform updates and maintenance notices"
                      />
                      <ListItemSecondaryAction>
                        <Switch
                          checked={preferences.systemUpdates}
                          onChange={(e) => handlePreferenceChange('systemUpdates', e.target.checked)}
                        />
                      </ListItemSecondaryAction>
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Report Notifications"
                        secondary="Analysis and report completion alerts"
                      />
                      <ListItemSecondaryAction>
                        <Switch
                          checked={preferences.reportNotifications}
                          onChange={(e) => handlePreferenceChange('reportNotifications', e.target.checked)}
                        />
                      </ListItemSecondaryAction>
                    </ListItem>
                  </List>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card sx={{ mb: 3 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    <LanguageIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Regional Settings
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <FormControl fullWidth>
                        <InputLabel>Language</InputLabel>
                        <Select
                          value={preferences.language}
                          label="Language"
                          onChange={(e) => handlePreferenceChange('language', e.target.value)}
                        >
                          <MenuItem value="en">English</MenuItem>
                          <MenuItem value="es">Español</MenuItem>
                          <MenuItem value="fr">Français</MenuItem>
                          <MenuItem value="de">Deutsch</MenuItem>
                          <MenuItem value="he">עברית</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12}>
                      <FormControl fullWidth>
                        <InputLabel>Timezone</InputLabel>
                        <Select
                          value={preferences.timezone}
                          label="Timezone"
                          onChange={(e) => handlePreferenceChange('timezone', e.target.value)}
                        >
                          <MenuItem value="UTC">UTC</MenuItem>
                          <MenuItem value="America/New_York">Eastern Time</MenuItem>
                          <MenuItem value="America/Chicago">Central Time</MenuItem>
                          <MenuItem value="America/Denver">Mountain Time</MenuItem>
                          <MenuItem value="America/Los_Angeles">Pacific Time</MenuItem>
                          <MenuItem value="Europe/London">London</MenuItem>
                          <MenuItem value="Europe/Paris">Paris</MenuItem>
                          <MenuItem value="Asia/Jerusalem">Jerusalem</MenuItem>
                          <MenuItem value="Asia/Tokyo">Tokyo</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12}>
                      <FormControl fullWidth>
                        <InputLabel>Date Format</InputLabel>
                        <Select
                          value={preferences.dateFormat}
                          label="Date Format"
                          onChange={(e) => handlePreferenceChange('dateFormat', e.target.value)}
                        >
                          <MenuItem value="YYYY-MM-DD">YYYY-MM-DD</MenuItem>
                          <MenuItem value="MM/DD/YYYY">MM/DD/YYYY</MenuItem>
                          <MenuItem value="DD/MM/YYYY">DD/MM/YYYY</MenuItem>
                          <MenuItem value="DD-MM-YYYY">DD-MM-YYYY</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    <PaletteIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Appearance
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Typography variant="body2">
                      Current theme: {themes[currentThemeId]?.name}
                    </Typography>
                    <ThemeSelector variant="compact" size="small" />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>

        {/* Security Tab */}
        <TabPanel value={tabValue} index={2}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    <VpnKeyIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                    Password & Authentication
                  </Typography>
                  <Box sx={{ mb: 3 }}>
                    <Button
                      variant="outlined"
                      onClick={() => setChangePasswordOpen(true)}
                      fullWidth
                    >
                      Change Password
                    </Button>
                  </Box>
                  
                  <Divider sx={{ my: 2 }} />
                  
                  <Typography variant="subtitle2" gutterBottom>
                    Two-Factor Authentication
                  </Typography>
                  <Alert severity="warning" sx={{ mb: 2 }}>
                    Two-factor authentication is not enabled. Enable it for better security.
                  </Alert>
                  <Button variant="contained" color="primary" size="small">
                    Enable 2FA
                  </Button>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6">
                      <ShieldIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                      Active Sessions
                    </Typography>
                    <Button
                      size="small"
                      color="error"
                      onClick={terminateAllOtherSessions}
                    >
                      Terminate All Others
                    </Button>
                  </Box>
                  <List>
                    {userSessions.map((session) => (
                      <ListItem key={session.id}>
                        <ListItemIcon>
                          <ComputerIcon />
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              {session.deviceType} {session.browser}
                              {session.current && (
                                <Chip label="Current" size="small" color="primary" />
                              )}
                            </Box>
                          }
                          secondary={
                            <Box>
                              <Typography variant="caption" display="block">
                                {session.ipAddress} • {session.location}
                              </Typography>
                              <Typography variant="caption" display="block">
                                Last active: {dayjs(session.lastActivity).fromNow()}
                              </Typography>
                            </Box>
                          }
                        />
                        {!session.current && (
                          <ListItemSecondaryAction>
                            <IconButton
                              edge="end"
                              size="small"
                              onClick={() => terminateSession(session.id)}
                            >
                              <LogoutIcon />
                            </IconButton>
                          </ListItemSecondaryAction>
                        )}
                      </ListItem>
                    ))}
                  </List>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>

        {/* Activity Tab */}
        <TabPanel value={tabValue} index={3}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <HistoryIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                Recent Activity
              </Typography>
              <List>
                {userActivity.map((activity, index) => (
                  <ListItem key={index}>
                    <ListItemIcon>
                      <AccessTimeIcon />
                    </ListItemIcon>
                    <ListItemText
                      primary={activity.action}
                      secondary={
                        <Box>
                          <Typography variant="caption" display="block">
                            {dayjs(activity.timestamp).format('MMM DD, YYYY HH:mm:ss')}
                          </Typography>
                          {activity.details && (
                            <Typography variant="caption" color="text.secondary">
                              {activity.details}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                    <Chip
                      label={activity.type}
                      size="small"
                      color={activity.type === 'security' ? 'error' : 'default'}
                    />
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        </TabPanel>
      </Paper>

      {/* Change Password Dialog */}
      <Dialog open={changePasswordOpen} onClose={() => setChangePasswordOpen(false)}>
        <form onSubmit={handlePasswordSubmit(onSubmitPassword)}>
          <DialogTitle>Change Password</DialogTitle>
          <DialogContent>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <Controller
                  name="currentPassword"
                  control={passwordControl}
                  rules={{ required: 'Current password is required' }}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Current Password"
                      type="password"
                      autoComplete="current-password"
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12}>
                <Controller
                  name="newPassword"
                  control={passwordControl}
                  rules={{ 
                    required: 'New password is required',
                    minLength: { value: 8, message: 'Password must be at least 8 characters' }
                  }}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="New Password"
                      type="password"
                      autoComplete="new-password"
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12}>
                <Controller
                  name="confirmPassword"
                  control={passwordControl}
                  rules={{ required: 'Please confirm your password' }}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Confirm New Password"
                      type="password"
                      autoComplete="new-password"
                    />
                  )}
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setChangePasswordOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={loading}>
              Change Password
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
};

export default UserProfile;