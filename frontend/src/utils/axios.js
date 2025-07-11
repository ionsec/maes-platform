import axios from 'axios'
import { useAuthStore } from '../stores/authStore'
import { apiConfig } from '../config/api'

// Store navigation function globally
let navigate = null

export const setNavigate = (nav) => {
  navigate = nav
}

// Create axios instance with base configuration
const axiosInstance = axios.create(apiConfig)

// Request interceptor to add auth token
axiosInstance.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
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
      originalRequest._retry = true
      
      const refreshed = await useAuthStore.getState().refreshToken()
      if (refreshed) {
        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${useAuthStore.getState().token}`
        return axiosInstance(originalRequest)
      } else {
        // Refresh failed, logout
        useAuthStore.getState().logout()
        if (navigate) {
          navigate('/login')
        } else {
          window.location.href = '/login'
        }
      }
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