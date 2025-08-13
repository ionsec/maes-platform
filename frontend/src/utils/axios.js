import axios from 'axios'
import { useAuthStore } from '../stores/authStore'
import { apiConfig } from '../config/api'
import { getCurrentOrganizationId } from '../stores/organizationStore'

// Store navigation function globally
let navigate = null

export const setNavigate = (nav) => {
  navigate = nav
}

// Create axios instance with base configuration
const axiosInstance = axios.create(apiConfig)

// Request interceptor to add auth token and organization header
axiosInstance.interceptors.request.use(
  (config) => {
    // Add auth token
    const token = useAuthStore.getState().token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    
    // Add organization ID header if available
    const organizationId = getCurrentOrganizationId()
    if (organizationId) {
      config.headers['x-organization-id'] = organizationId
    }
    
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor to handle auth errors
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Handle network errors
    if (!error.response) {
      console.error('Network error:', error.message)
      // Check if it's a CORS error
      if (error.message === 'Network Error') {
        console.error('Possible CORS issue or API is unreachable')
      }
      return Promise.reject({
        ...error,
        message: 'Network error: Unable to reach the server'
      })
    }

    const originalRequest = error.config

    // Handle 401 Unauthorized
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Don't retry for login requests
      if (originalRequest.url?.includes('/auth/login')) {
        return Promise.reject(error)
      }
      
      originalRequest._retry = true
      
      // Try to refresh token
      const currentToken = useAuthStore.getState().token
      
      // If no token exists, redirect to login immediately
      if (!currentToken) {
        if (navigate && window.location.pathname !== '/login') {
          navigate('/login')
        } else if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
        return Promise.reject(error)
      }
      
      // Try to refresh the token
      const refreshed = await useAuthStore.getState().refreshToken()
      if (refreshed) {
        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${useAuthStore.getState().token}`
        return axiosInstance(originalRequest)
      } else {
        // Refresh failed, logout and redirect
        useAuthStore.getState().logout()
        if (navigate && window.location.pathname !== '/login') {
          navigate('/login')
        } else if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
        return Promise.reject(error)
      }
    }
    
    // Handle 403 Forbidden - user is authenticated but lacks permissions
    if (error.response?.status === 403) {
      console.warn('Access forbidden:', error.response?.data?.error || 'Insufficient permissions')
      // Don't redirect on 403, let the component handle it
      return Promise.reject(error)
    }
    
    // Handle CORS errors specifically
    if (error.response?.status === 0 || error.code === 'ERR_NETWORK') {
      console.error('CORS or network connectivity issue detected')
      return Promise.reject({
        ...error,
        message: 'Unable to connect to the API. Please check your network connection.'
      })
    }
    
    return Promise.reject(error)
  }
)

export default axiosInstance