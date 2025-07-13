import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Paper,
  Grid,
  InputAdornment,
  IconButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip
} from '@mui/material';
import {
  Person as PersonIcon,
  Email as EmailIcon,
  Lock as LockIcon,
  Visibility,
  VisibilityOff,
  ExpandMore as ExpandMoreIcon,
  CloudQueue as CloudIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon
} from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from '../utils/axios';

const Register = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [tenantInfo, setTenantInfo] = useState(null);
  const [consentStatus, setConsentStatus] = useState(null);
  const [consentData, setConsentData] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  const { control, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      username: '',
      password: '',
      confirmPassword: ''
    }
  });

  const password = watch('password');

  // Check for consent status from URL params and fetch tenant info
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const consent = searchParams.get('consent');
    const tenant = searchParams.get('tenant');
    const token = searchParams.get('token');
    const consentError = searchParams.get('error');

    console.log('Registration page - URL params:', { consent, tenant, token, consentError });

    if (consent === 'success' && tenant) {
      console.log('Setting consent status to success');
      setConsentStatus('success');
      setConsentData({ tenant, token });
      setSuccess('✅ Microsoft 365 tenant consent completed successfully! You can now register your account.');
    } else if (consent === 'failed') {
      console.log('Setting consent status to failed');
      setConsentStatus('failed');
      setError(`❌ Tenant consent failed: ${consentError || 'Unknown error'}`);
    } else if (consent === 'error') {
      console.log('Setting consent status to error');
      setConsentStatus('error');
      setError('❌ There was an error processing your consent. Please try again.');
    } else {
      console.log('No consent status in URL, showing normal registration page');
    }

    const fetchTenantInfo = async () => {
      try {
        const response = await axios.get('/api/registration/tenant-app-info');
        setTenantInfo(response.data.appInfo);
      } catch (error) {
        console.error('Failed to fetch tenant info:', error);
      }
    };
    fetchTenantInfo();
  }, [location]);

  const onSubmit = async (data) => {
    // Consent is now optional, users can register without it

    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await axios.post('/api/registration/user', {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        username: data.username,
        password: data.password,
        tenantId: consentData?.tenant,
        consentToken: consentData?.token
      });

      const hasConsent = consentStatus === 'success';
      
      if (hasConsent) {
        setSuccess('Registration successful! Redirecting to login...');
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      } else {
        setSuccess('Registration successful! Redirecting to complete setup...');
        setTimeout(() => {
          navigate('/onboarding');
        }, 2000);
      }

    } catch (error) {
      setError(error.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: 2
      }}
    >
      <Paper elevation={10} sx={{ maxWidth: 600, width: '100%' }}>
        <Card>
          <CardContent sx={{ p: 4 }}>
            <Box sx={{ textAlign: 'center', mb: 4 }}>
              <Typography variant="h4" component="h1" gutterBottom color="primary">
                MAES Platform
              </Typography>
              <Typography variant="body1" color="text.secondary" gutterBottom>
                M365 Analyzer & Extractor Suite
              </Typography>
              <Typography variant="h6" color="primary" gutterBottom>
                Create Your Account
              </Typography>
              
              {/* Debug info */}
              {process.env.NODE_ENV === 'development' && (
                <Box sx={{ mt: 2, p: 1, bgcolor: 'grey.100', borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Debug: URL = {location.search} | Consent Status = {consentStatus || 'none'}
                  </Typography>
                  <br />
                  <Button 
                    size="small" 
                    onClick={() => window.location.href = '/register?consent=success&tenant=test-tenant-123&token=test-token-456'}
                  >
                    Test Consent Success
                  </Button>
                </Box>
              )}
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                mt: 2
              }}>
                <Typography variant="caption" color="text.secondary">
                  Powered by
                </Typography>
                <Box sx={{ 
                  padding: '4px 8px',
                  backgroundColor: 'rgba(25, 118, 210, 0.1)',
                  borderRadius: 1,
                  border: '1px solid rgba(25, 118, 210, 0.3)'
                }}>
                  <Typography variant="caption" sx={{ 
                    color: 'primary.main',
                    fontWeight: 'bold',
                    letterSpacing: 0.5
                  }}>
                    IONSEC.IO
                  </Typography>
                </Box>
              </Box>
            </Box>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            {success && (
              <Alert severity="success" sx={{ mb: 2 }}>
                {success}
              </Alert>
            )}

            {/* Consent Status Display */}
            {consentStatus && (
              <Alert 
                severity={consentStatus === 'success' ? 'success' : 'error'} 
                sx={{ mb: 2 }}
                icon={consentStatus === 'success' ? <CheckCircleIcon /> : <ErrorIcon />}
              >
                {consentStatus === 'success' && consentData && (
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                      Microsoft 365 Tenant Consent Completed
                    </Typography>
                    <Typography variant="caption">
                      Tenant ID: {consentData.tenant}
                    </Typography>
                  </Box>
                )}
                {consentStatus !== 'success' && (
                  <Typography variant="body2">
                    Please complete the Microsoft 365 tenant consent process below before registering.
                  </Typography>
                )}
              </Alert>
            )}

            {tenantInfo && (
              <Accordion sx={{ mb: 3 }} defaultExpanded={!consentStatus || consentStatus !== 'success'}>
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon />}
                  aria-controls="tenant-content"
                  id="tenant-header"
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CloudIcon color="primary" />
                    <Typography>Microsoft 365 Tenant App Setup</Typography>
                    {consentStatus === 'success' && (
                      <Chip 
                        label="Completed" 
                        color="success" 
                        size="small" 
                        icon={<CheckCircleIcon />}
                      />
                    )}
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Alert severity="info" sx={{ mb: 2 }}>
                    To use MAES with your Microsoft 365 tenant, you need to install our app in your tenant first.
                  </Alert>
                  <Typography variant="body2" paragraph>
                    <strong>Display Name:</strong> {tenantInfo.displayName}
                  </Typography>
                  <Typography variant="body2" paragraph>
                    <strong>Application (Client) ID:</strong>
                  </Typography>
                  <Box sx={{ 
                    p: 2, 
                    bgcolor: 'grey.100', 
                    borderRadius: 1,
                    fontFamily: 'monospace',
                    fontSize: '0.875rem',
                    wordBreak: 'break-all',
                    mb: 2
                  }}>
                    {tenantInfo.applicationId}
                  </Box>
                  <Typography variant="body2" paragraph>
                    {tenantInfo.instructions}
                  </Typography>
                  <Box sx={{ textAlign: 'center', mt: 3 }}>
                    <Button
                      variant="contained"
                      size="large"
                      href={tenantInfo.adminConsentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{
                        backgroundColor: '#0078D4',
                        color: 'white',
                        padding: '12px 24px',
                        '&:hover': {
                          backgroundColor: '#106EBE',
                        },
                        textTransform: 'none',
                        fontWeight: 500
                      }}
                      startIcon={<CloudIcon />}
                    >
                      Install MAES in Your Tenant
                    </Button>
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block', textAlign: 'center' }}>
                    You will be redirected to Microsoft to grant admin consent for the required permissions.
                  </Typography>
                </AccordionDetails>
              </Accordion>
            )}

            <form onSubmit={handleSubmit(onSubmit)}>
              <Grid container spacing={2}>
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
                        variant="outlined"
                        error={!!errors.firstName}
                        helperText={errors.firstName?.message}
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <PersonIcon color="action" />
                            </InputAdornment>
                          ),
                        }}
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
                        variant="outlined"
                        error={!!errors.lastName}
                        helperText={errors.lastName?.message}
                      />
                    )}
                  />
                </Grid>

                <Grid item xs={12}>
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
                        label="Email Address"
                        variant="outlined"
                        type="email"
                        error={!!errors.email}
                        helperText={errors.email?.message}
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <EmailIcon color="action" />
                            </InputAdornment>
                          ),
                        }}
                      />
                    )}
                  />
                </Grid>

                <Grid item xs={12}>
                  <Controller
                    name="username"
                    control={control}
                    rules={{ 
                      required: 'Username is required',
                      minLength: { value: 3, message: 'Username must be at least 3 characters' }
                    }}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        fullWidth
                        label="Username"
                        variant="outlined"
                        error={!!errors.username}
                        helperText={errors.username?.message}
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <PersonIcon color="action" />
                            </InputAdornment>
                          ),
                        }}
                      />
                    )}
                  />
                </Grid>

                <Grid item xs={12}>
                  <Controller
                    name="password"
                    control={control}
                    rules={{ 
                      required: 'Password is required',
                      minLength: { value: 6, message: 'Password must be at least 6 characters' }
                    }}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        fullWidth
                        label="Password"
                        variant="outlined"
                        type={showPassword ? 'text' : 'password'}
                        error={!!errors.password}
                        helperText={errors.password?.message}
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <LockIcon color="action" />
                            </InputAdornment>
                          ),
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton
                                onClick={() => setShowPassword(!showPassword)}
                                edge="end"
                              >
                                {showPassword ? <VisibilityOff /> : <Visibility />}
                              </IconButton>
                            </InputAdornment>
                          ),
                        }}
                      />
                    )}
                  />
                </Grid>

                <Grid item xs={12}>
                  <Controller
                    name="confirmPassword"
                    control={control}
                    rules={{ 
                      required: 'Please confirm your password',
                      validate: value => value === password || 'Passwords do not match'
                    }}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        fullWidth
                        label="Confirm Password"
                        variant="outlined"
                        type={showConfirmPassword ? 'text' : 'password'}
                        error={!!errors.confirmPassword}
                        helperText={errors.confirmPassword?.message}
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <LockIcon color="action" />
                            </InputAdornment>
                          ),
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                edge="end"
                              >
                                {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                              </IconButton>
                            </InputAdornment>
                          ),
                        }}
                      />
                    )}
                  />
                </Grid>
              </Grid>

              <Button
                type="submit"
                fullWidth
                variant="contained"
                disabled={isLoading}
                sx={{ 
                  mt: 3, 
                  mb: 2, 
                  py: 1.5
                }}
              >
                {isLoading ? (
                  <CircularProgress size={24} color="inherit" />
                ) : (
                  consentStatus === 'success' ? '✅ Create Account' : '📝 Create Account'
                )}
              </Button>
              
              {consentStatus !== 'success' && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  <Typography variant="body2">
                    <strong>Note:</strong> You can register without completing tenant consent. 
                    You can always configure Microsoft 365 credentials later in the Settings page.
                  </Typography>
                </Alert>
              )}
            </form>

            <Box sx={{ mt: 3, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Already have an account?{' '}
                <Button
                  variant="text"
                  onClick={() => navigate('/login')}
                  sx={{ textTransform: 'none' }}
                >
                  Sign in here
                </Button>
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Paper>
    </Box>
  );
};

export default Register;