import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import axios from 'axios'
import { getApiUrl } from '../config/api'

// Use the same-origin API base as the rest of the app (proxied by nginx via
// /api/*). A hardcoded absolute fallback like http://localhost:3000 violates
// the frontend CSP (connect-src 'self') because the app is served over https.
const API_URL = getApiUrl()

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
            await axios.post(`${API_URL}/api/auth/logout`, {}, {
              headers: { Authorization: `Bearer ${token}` }
            })
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
          return false
        }
      },

      clearError: () => set({ error: null }),

      // Revalidate the stored user against the server on app start / hydration.
      // authenticateToken re-fetches the user from the DB, so this refreshes
      // role + permissions and clears the persisted copy if the token is invalid.
      revalidateUser: async () => {
        const { token } = get()
        if (!token) {
          set({ isHydrated: true })
          return false
        }
        try {
          const response = await axios.get(`${API_URL}/api/auth/me`, {
            headers: { Authorization: `Bearer ${token}` }
          })
          const freshUser = response.data?.user
          if (freshUser) {
            set({ user: freshUser, isAuthenticated: true, isHydrated: true })
            return true
          }
          set({ isHydrated: true })
          return false
        } catch (error) {
          // Invalid/expired token — clear persisted session.
          localStorage.removeItem('auth-storage')
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isHydrated: true,
            error: null
          })
          return false
        }
      },

      updateUser: (updates) => {
        const { user } = get()
        if (user) {
          set({ user: { ...user, ...updates } })
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
        console.log('Auth store rehydrated:', {
          isAuthenticated: !!state?.isAuthenticated,
          hasToken: !!state?.token,
          hasUser: !!state?.user
        })
        // Auth headers are injected per-request by the interceptor in
        // utils/axios.js, so nothing to set here.
        if (state?.token) {
          // Revalidate the persisted user against the server so role/permissions
          // are current (and so an invalid/expired token clears the session).
          setTimeout(() => {
            useAuthStore.getState().revalidateUser()
          }, 0)
        } else {
          // No token — still mark hydration complete so the app can render.
          useAuthStore.setState({ isHydrated: true })
        }
      }
    }
  )
)

// Note: Axios interceptors are configured in utils/axios.js