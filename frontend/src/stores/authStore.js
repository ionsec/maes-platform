import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      isHydrated: false,

      login: async (credentials) => {
        set({ isLoading: true, error: null })
        try {
          console.log('Login attempt with credentials:', credentials)
          const response = await axios.post(`${API_URL}/api/auth/login`, credentials)
          const { user, token } = response.data
          
          console.log('Login successful, setting auth state:', { user: !!user, token: !!token })
          set({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
            error: null
          })
          
          // Set axios default header for future requests
          axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
          
          console.log('Auth state set, returning success')
          
          // Verify the state was set correctly
          setTimeout(() => {
            const currentState = get()
            console.log('Auth state after set:', { 
              isAuthenticated: currentState.isAuthenticated, 
              token: !!currentState.token, 
              user: !!currentState.user 
            })
          }, 50)
          
          return { success: true }
        } catch (error) {
          console.error('Login error:', error)
          const errorMessage = error.response?.data?.error || 'Login failed'
          set({
            isLoading: false,
            error: errorMessage,
            isAuthenticated: false,
            user: null,
            token: null
          })
          return { success: false, error: errorMessage }
        }
      },

      logout: async () => {
        const { token } = get();
        if (token) {
          try {
            await axios.post(`${API_URL}/api/auth/logout`)
          } catch (error) {
            // Ignore logout errors - we're clearing the session anyway
            console.log('Logout error (ignored):', error.response?.status)
          }
        }
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          error: null
        })
        // Clear axios default header
        delete axios.defaults.headers.common['Authorization']
      },

      refreshToken: async () => {
        const { token } = get()
        if (!token) return false

        try {
          const response = await axios.post(`${API_URL}/api/auth/refresh`, {}, {
            headers: { Authorization: `Bearer ${token}` }
          })
          
          const { user, token: newToken } = response.data
          
          set({
            user,
            token: newToken,
            isAuthenticated: true
          })
          
          // Update axios default header
          axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`
          
          return true
        } catch (error) {
          console.log('Token refresh failed:', error.response?.status)
          // Clear auth state directly without calling logout to avoid loop
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            error: null
          })
          delete axios.defaults.headers.common['Authorization']
          return false
        }
      },

      clearError: () => set({ error: null }),
      
      // Initialize axios headers from stored token
      initializeAuth: () => {
        const { token } = get()
        if (token) {
          axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
          console.log('Auth initialized with stored token')
        }
      },
      
      // Debug function to clear all auth data
      clearAllData: () => {
        localStorage.removeItem('auth-storage')
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
          error: null,
          isHydrated: true
        })
        delete axios.defaults.headers.common['Authorization']
        console.log('All auth data cleared')
      }
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated
      }),
      onRehydrateStorage: () => (state, error) => {
        console.log('Auth store rehydrated:', state)
        // Set axios headers after rehydration
        if (state?.token) {
          axios.defaults.headers.common['Authorization'] = `Bearer ${state.token}`
          console.log('Axios headers set after rehydration')
        }
        // Mark as hydrated when rehydration completes
        if (state) {
          setTimeout(() => {
            useAuthStore.setState({ isHydrated: true })
          }, 50)
        }
      }
    }
  )
)

// Note: Axios interceptors are configured in utils/axios.js