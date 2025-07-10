import React, { useState } from 'react';
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
  Stepper,
  Step,
  StepLabel,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Divider,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Business as BusinessIcon,
  Person as PersonIcon,
  Security as SecurityIcon,
  Payment as PaymentIcon
} from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import axios from '../utils/axios';

const Register = () => {
  const [activeStep, setActiveStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  const { control, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    defaultValues: {
      // Organization details
      organizationName: '',
      organizationType: 'standalone',
      tenantId: '',
      domain: '',
      industry: '',
      employeeCount: '',
      
      // Admin user details
      firstName: '',
      lastName: '',
      email: '',
      username: '',
      password: '',
      confirmPassword: '',
      
      // MSSP specific
      msspId: '',
      serviceTier: 'basic',
      subscriptionPlan: 'monthly',
      billingEmail: '',
      
      // Security settings
      enableMFA: true,
      enableAuditLogging: true,
      dataRetentionDays: 90,
      
      // Service configuration
      enableAutoExtraction: true,
      enableAutoAnalysis: true,
      enableThreatIntel: false,
      enableMachineLearning: false
    }
  });

  const organizationType = watch('organizationType');
  const password = watch('password');

  const steps = [
    'Organization Details',
    'Admin Account',
    'Service Configuration',
    'Review & Submit'
  ];

  const handleNext = () => {
    setActiveStep((prevStep) => prevStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevStep) => prevStep - 1);
  };

  const onSubmit = async (data) => {
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      // Register organization and admin user
      const response = await axios.post('/api/registration/organization', {
        organization: {
          name: data.organizationName,
          organizationType: data.organizationType,
          tenantId: data.tenantId,
          domain: data.domain,
          industry: data.industry,
          employeeCount: parseInt(data.employeeCount),
          serviceTier: data.serviceTier,
          subscriptionPlan: data.subscriptionPlan,
          billingEmail: data.billingEmail,
          settings: {
            security: {
              enableMFA: data.enableMFA,
              enableAuditLogging: data.enableAuditLogging,
              dataRetentionDays: parseInt(data.dataRetentionDays)
            },
            extraction: {
              enableAutoExtraction: data.enableAutoExtraction,
              schedule: {
                enabled: data.enableAutoExtraction,
                interval: 'daily',
                time: '02:00'
              }
            },
            analysis: {
              enableAutoAnalysis: data.enableAutoAnalysis,
              enableThreatIntel: data.enableThreatIntel,
              enableMachineLearning: data.enableMachineLearning
            },
            alerting: {
              emailNotifications: true,
              severityThreshold: 'medium'
            }
          }
        },
        adminUser: {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          username: data.username,
          password: data.password,
          role: data.organizationType === 'mssp' ? 'mssp_admin' : 
                data.organizationType === 'client' ? 'client_admin' : 'standalone_admin'
        }
      });

      setSuccess('Registration successful! Redirecting to login...');
      setTimeout(() => {
        navigate('/login');
      }, 2000);

    } catch (error) {
      setError(error.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderOrganizationStep = () => (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <Typography variant="h6" gutterBottom>
          <BusinessIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Organization Information
        </Typography>
      </Grid>
      
      <Grid item xs={12} md={6}>
        <Controller
          name="organizationName"
          control={control}
          rules={{ required: 'Organization name is required' }}
          render={({ field }) => (
            <TextField
              {...field}
              fullWidth
              label="Organization Name"
              variant="outlined"
              error={!!errors.organizationName}
              helperText={errors.organizationName?.message}
            />
          )}
        />
      </Grid>

      <Grid item xs={12} md={6}>
        <Controller
          name="organizationType"
          control={control}
          rules={{ required: 'Organization type is required' }}
          render={({ field }) => (
            <FormControl fullWidth error={!!errors.organizationType}>
              <InputLabel>Organization Type</InputLabel>
              <Select {...field} label="Organization Type">
                <MenuItem value="standalone">Standalone Organization</MenuItem>
                <MenuItem value="mssp">MSSP (Managed Security Service Provider)</MenuItem>
                <MenuItem value="client">MSSP Client</MenuItem>
              </Select>
            </FormControl>
          )}
        />
      </Grid>

      <Grid item xs={12} md={6}>
        <Controller
          name="tenantId"
          control={control}
          rules={{ required: 'Tenant ID is required' }}
          render={({ field }) => (
            <TextField
              {...field}
              fullWidth
              label="Microsoft 365 Tenant ID"
              variant="outlined"
              placeholder="e.g., 12345678-1234-1234-1234-123456789012"
              error={!!errors.tenantId}
              helperText={errors.tenantId?.message}
            />
          )}
        />
      </Grid>

      <Grid item xs={12} md={6}>
        <Controller
          name="domain"
          control={control}
          rules={{ required: 'Domain is required' }}
          render={({ field }) => (
            <TextField
              {...field}
              fullWidth
              label="Primary Domain"
              variant="outlined"
              placeholder="e.g., company.com"
              error={!!errors.domain}
              helperText={errors.domain?.message}
            />
          )}
        />
      </Grid>

      <Grid item xs={12} md={6}>
        <Controller
          name="industry"
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              fullWidth
              label="Industry"
              variant="outlined"
              placeholder="e.g., Technology, Healthcare, Finance"
            />
          )}
        />
      </Grid>

      <Grid item xs={12} md={6}>
        <Controller
          name="employeeCount"
          control={control}
          render={({ field }) => (
            <FormControl fullWidth>
              <InputLabel>Employee Count</InputLabel>
              <Select {...field} label="Employee Count">
                <MenuItem value="1-50">1-50</MenuItem>
                <MenuItem value="51-200">51-200</MenuItem>
                <MenuItem value="201-1000">201-1000</MenuItem>
                <MenuItem value="1001-5000">1001-5000</MenuItem>
                <MenuItem value="5000+">5000+</MenuItem>
              </Select>
            </FormControl>
          )}
        />
      </Grid>

      {organizationType === 'mssp' && (
        <>
          <Grid item xs={12}>
            <Divider sx={{ my: 2 }}>
              <Chip label="MSSP Configuration" color="primary" />
            </Divider>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Controller
              name="serviceTier"
              control={control}
              render={({ field }) => (
                <FormControl fullWidth>
                  <InputLabel>Service Tier</InputLabel>
                  <Select {...field} label="Service Tier">
                    <MenuItem value="basic">Basic</MenuItem>
                    <MenuItem value="professional">Professional</MenuItem>
                    <MenuItem value="enterprise">Enterprise</MenuItem>
                    <MenuItem value="premium">Premium</MenuItem>
                  </Select>
                </FormControl>
              )}
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <Controller
              name="subscriptionPlan"
              control={control}
              render={({ field }) => (
                <FormControl fullWidth>
                  <InputLabel>Subscription Plan</InputLabel>
                  <Select {...field} label="Subscription Plan">
                    <MenuItem value="monthly">Monthly</MenuItem>
                    <MenuItem value="annual">Annual (20% discount)</MenuItem>
                  </Select>
                </FormControl>
              )}
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <Controller
              name="billingEmail"
              control={control}
              rules={{ 
                required: 'Billing email is required',
                pattern: {
                  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                  message: 'Invalid email address'
                }
              }}
              render={({ field }) => (
                <TextField
                  {...field}
                  fullWidth
                  label="Billing Email"
                  variant="outlined"
                  error={!!errors.billingEmail}
                  helperText={errors.billingEmail?.message}
                />
              )}
            />
          </Grid>
        </>
      )}
    </Grid>
  );

  const renderAdminStep = () => (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <Typography variant="h6" gutterBottom>
          <PersonIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Administrator Account
        </Typography>
      </Grid>
      
      <Grid item xs={12} md={6}>
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
            />
          )}
        />
      </Grid>

      <Grid item xs={12} md={6}>
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

      <Grid item xs={12} md={6}>
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
            />
          )}
        />
      </Grid>

      <Grid item xs={12} md={6}>
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
            />
          )}
        />
      </Grid>

      <Grid item xs={12} md={6}>
        <Controller
          name="password"
          control={control}
          rules={{ 
            required: 'Password is required',
            minLength: { value: 8, message: 'Password must be at least 8 characters' },
            pattern: {
              value: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
              message: 'Password must contain uppercase, lowercase, number, and special character'
            }
          }}
          render={({ field }) => (
            <TextField
              {...field}
              fullWidth
              label="Password"
              variant="outlined"
              type="password"
              error={!!errors.password}
              helperText={errors.password?.message}
            />
          )}
        />
      </Grid>

      <Grid item xs={12} md={6}>
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
              type="password"
              error={!!errors.confirmPassword}
              helperText={errors.confirmPassword?.message}
            />
          )}
        />
      </Grid>
    </Grid>
  );

  const renderServiceStep = () => (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <Typography variant="h6" gutterBottom>
          <SecurityIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          Service Configuration
        </Typography>
      </Grid>

      <Grid item xs={12}>
        <Accordion defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle1">Security Settings</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Controller
                  name="enableMFA"
                  control={control}
                  render={({ field }) => (
                    <FormControlLabel
                      control={<Switch {...field} checked={field.value} />}
                      label="Enable Multi-Factor Authentication"
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Controller
                  name="enableAuditLogging"
                  control={control}
                  render={({ field }) => (
                    <FormControlLabel
                      control={<Switch {...field} checked={field.value} />}
                      label="Enable Audit Logging"
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Controller
                  name="dataRetentionDays"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Data Retention (days)"
                      variant="outlined"
                      type="number"
                      inputProps={{ min: 30, max: 365 }}
                    />
                  )}
                />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>
      </Grid>

      <Grid item xs={12}>
        <Accordion>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle1">Extraction & Analysis</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Controller
                  name="enableAutoExtraction"
                  control={control}
                  render={({ field }) => (
                    <FormControlLabel
                      control={<Switch {...field} checked={field.value} />}
                      label="Enable Automatic Data Extraction"
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Controller
                  name="enableAutoAnalysis"
                  control={control}
                  render={({ field }) => (
                    <FormControlLabel
                      control={<Switch {...field} checked={field.value} />}
                      label="Enable Automatic Analysis"
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Controller
                  name="enableThreatIntel"
                  control={control}
                  render={({ field }) => (
                    <FormControlLabel
                      control={<Switch {...field} checked={field.value} />}
                      label="Enable Threat Intelligence Integration"
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Controller
                  name="enableMachineLearning"
                  control={control}
                  render={({ field }) => (
                    <FormControlLabel
                      control={<Switch {...field} checked={field.value} />}
                      label="Enable Machine Learning Analysis"
                    />
                  )}
                />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>
      </Grid>
    </Grid>
  );

  const renderReviewStep = () => {
    const formData = watch();
    
    return (
      <Box>
        <Typography variant="h6" gutterBottom>
          Review Your Registration
        </Typography>
        
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" gutterBottom>Organization</Typography>
                <Typography><strong>Name:</strong> {formData.organizationName}</Typography>
                <Typography><strong>Type:</strong> {formData.organizationType}</Typography>
                <Typography><strong>Domain:</strong> {formData.domain}</Typography>
                <Typography><strong>Industry:</strong> {formData.industry}</Typography>
                {formData.organizationType === 'mssp' && (
                  <>
                    <Typography><strong>Service Tier:</strong> {formData.serviceTier}</Typography>
                    <Typography><strong>Plan:</strong> {formData.subscriptionPlan}</Typography>
                  </>
                )}
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" gutterBottom>Admin Account</Typography>
                <Typography><strong>Name:</strong> {formData.firstName} {formData.lastName}</Typography>
                <Typography><strong>Email:</strong> {formData.email}</Typography>
                <Typography><strong>Username:</strong> {formData.username}</Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>
    );
  };

  const getStepContent = (step) => {
    switch (step) {
      case 0:
        return renderOrganizationStep();
      case 1:
        return renderAdminStep();
      case 2:
        return renderServiceStep();
      case 3:
        return renderReviewStep();
      default:
        return 'Unknown step';
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
      <Paper elevation={10} sx={{ maxWidth: 800, width: '100%' }}>
        <Card>
          <CardContent sx={{ p: 4 }}>
            <Box sx={{ textAlign: 'center', mb: 3 }}>
              <Typography variant="h4" component="h1" gutterBottom color="primary">
                MAES Platform
              </Typography>
              <Typography variant="body1" color="text.secondary" gutterBottom>
                M365 Analyzer & Extractor Suite
              </Typography>
              <Typography variant="h6" color="primary" gutterBottom>
                Organization Registration
              </Typography>
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

            <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
              {steps.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>

            <form onSubmit={handleSubmit(onSubmit)}>
              {getStepContent(activeStep)}

              <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
                <Button
                  disabled={activeStep === 0}
                  onClick={handleBack}
                >
                  Back
                </Button>
                
                <Box>
                  {activeStep === steps.length - 1 ? (
                    <Button
                      type="submit"
                      variant="contained"
                      disabled={isLoading}
                      sx={{ minWidth: 120 }}
                    >
                      {isLoading ? (
                        <CircularProgress size={24} color="inherit" />
                      ) : (
                        'Complete Registration'
                      )}
                    </Button>
                  ) : (
                    <Button
                      variant="contained"
                      onClick={handleNext}
                    >
                      Next
                    </Button>
                  )}
                </Box>
              </Box>
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