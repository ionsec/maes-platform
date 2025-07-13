/**
 * API configuration for handling dynamic endpoints based on deployment environment
 */

// Determine the API URL based on current location and environment
export const getApiUrl = () => {
  // Use VITE_API_URL if explicitly set
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL
  }
  
  // Otherwise, construct API URL based on current location
  const protocol = window.location.protocol
  const hostname = window.location.hostname
  const port = window.location.port
  
  // In Docker setup, API is served through nginx on the same host/port
  // API routes are proxied from /api/* to the backend
  if (port) {
    return `${protocol}//${hostname}:${port}`
  } else {
    return `${protocol}//${hostname}`
  }
}

// API configuration object
export const apiConfig = {
  baseURL: getApiUrl(),
  timeout: 30000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
}

// Helper to construct API endpoints
export const apiEndpoints = {
  auth: {
    login: '/api/auth/login',
    register: '/api/registration',
    refresh: '/api/auth/refresh',
    logout: '/api/auth/logout',
    me: '/api/auth/me'
  },
  organizations: {
    base: '/api/organizations',
    byId: (id) => `/api/organizations/${id}`,
    users: (id) => `/api/organizations/${id}/users`
  },
  extractions: {
    base: '/api/extractions',
    byId: (id) => `/api/extractions/${id}`,
    upload: '/api/upload'
  },
  analysis: {
    base: '/api/analysis',
    byId: (id) => `/api/analysis/${id}`
  },
  alerts: {
    base: '/api/alerts',
    byId: (id) => `/api/alerts/${id}`
  },
  reports: {
    base: '/api/reports',
    byId: (id) => `/api/reports/${id}`
  }
}

// Export a function to check if API is reachable
export const checkApiHealth = async () => {
  try {
    const response = await fetch(`${getApiUrl()}/health`)
    return response.ok
  } catch (error) {
    console.error('API health check failed:', error)
    return false
  }
}