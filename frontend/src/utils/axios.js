import axios from 'axios'
import { useAuthStore } from '../stores/authStore'

// Store navigation function globally
let navigate = null

export const setNavigate = (nav) => {
  navigate = nav
}

// Create axios instance with base configuration
const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

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
    const originalRequest = error.config

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
    
    return Promise.reject(error)
  }
)

export default axiosInstance