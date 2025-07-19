import React, { useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Paper
} from '@mui/material'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

const Login = () => {
  const { register, handleSubmit, formState: { errors } } = useForm()
  const { login, isLoading, error } = useAuthStore()
  const navigate = useNavigate()
  
  const onSubmit = async (data) => {
    console.log('Login form submitted with data:', data)
    const result = await login(data)
    console.log('Login result:', result)
    if (result.success) {
      console.log('Login successful, navigating to dashboard')
      navigate('/dashboard', { replace: true })
    } else {
      console.log('Login failed:', result.error)
    }
  }

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
      <Paper elevation={10} sx={{ maxWidth: 400, width: '100%' }}>
        <Card>
          <CardContent sx={{ p: 4 }}>
            <Box sx={{ textAlign: 'center', mb: 3 }}>
              <Box sx={{ mb: 2 }}>
                <img 
                  src="/MAES_Logo.png" 
                  alt="MAES Logo"
                  style={{
                    maxWidth: '200px',
                    height: 'auto',
                    maxHeight: '80px'
                  }}
                />
              </Box>
              <Typography variant="h4" component="h1" gutterBottom color="primary">
                MAES
              </Typography>
              <Typography variant="body1" color="text.secondary" gutterBottom>
                The M365 Analyzer & Extractor Suite
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

            <form onSubmit={handleSubmit(onSubmit)}>
              <TextField
                fullWidth
                label="Username or Email"
                variant="outlined"
                margin="normal"
                {...register('username', { required: 'Username is required' })}
                error={!!errors.username}
                helperText={errors.username?.message}
                disabled={isLoading}
              />

              <TextField
                fullWidth
                label="Password"
                type="password"
                variant="outlined"
                margin="normal"
                {...register('password', { required: 'Password is required' })}
                error={!!errors.password}
                helperText={errors.password?.message}
                disabled={isLoading}
              />

              <Button
                type="submit"
                fullWidth
                variant="contained"
                sx={{ mt: 3, mb: 2, py: 1.5 }}
                disabled={isLoading}
              >
                {isLoading ? (
                  <CircularProgress size={24} color="inherit" />
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>

            <Box sx={{ mt: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Don't have an account?{' '}
                <Button
                  variant="text"
                  onClick={() => navigate('/register')}
                  sx={{ textTransform: 'none', p: 0, minWidth: 'auto' }}
                >
                  Register here
                </Button>
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Paper>
    </Box>
  )
}

export default Login