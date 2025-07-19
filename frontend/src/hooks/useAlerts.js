import { useState, useEffect, useCallback } from 'react'
import axios from '../utils/axios'

export const useAlerts = () => {
  const [alerts, setAlerts] = useState([])
  const [alertStats, setAlertStats] = useState({
    total: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    unread: 0
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await axios.get('/api/alerts')
      const alertsData = response.data.alerts || []
      
      setAlerts(alertsData)
      
      // Calculate alert statistics
      const stats = {
        total: alertsData.length,
        critical: alertsData.filter(a => a.severity === 'critical').length,
        high: alertsData.filter(a => a.severity === 'high').length,
        medium: alertsData.filter(a => a.severity === 'medium').length,
        low: alertsData.filter(a => a.severity === 'low').length,
        unread: alertsData.filter(a => !a.read).length
      }
      
      setAlertStats(stats)
    } catch (err) {
      console.error('Failed to fetch alerts:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAlerts()
  }, [fetchAlerts])

  const markAsRead = useCallback(async (alertId) => {
    try {
      await axios.patch(`/api/alerts/${alertId}`, { read: true })
      
      // Update local state
      setAlerts(prev => prev.map(alert => 
        alert.id === alertId ? { ...alert, read: true } : alert
      ))
      
      // Update stats
      setAlertStats(prev => ({
        ...prev,
        unread: Math.max(0, prev.unread - 1)
      }))
    } catch (err) {
      console.error('Failed to mark alert as read:', err)
    }
  }, [])

  const markAllAsRead = useCallback(async () => {
    try {
      await axios.patch('/api/alerts/mark-all-read')
      
      // Update local state
      setAlerts(prev => prev.map(alert => ({ ...alert, read: true })))
      
      // Update stats
      setAlertStats(prev => ({
        ...prev,
        unread: 0
      }))
    } catch (err) {
      console.error('Failed to mark all alerts as read:', err)
    }
  }, [])

  const dismissAlert = useCallback(async (alertId) => {
    try {
      await axios.delete(`/api/alerts/${alertId}`)
      
      // Update local state
      setAlerts(prev => prev.filter(alert => alert.id !== alertId))
      
      // Recalculate stats
      const updatedAlerts = alerts.filter(alert => alert.id !== alertId)
      const stats = {
        total: updatedAlerts.length,
        critical: updatedAlerts.filter(a => a.severity === 'critical').length,
        high: updatedAlerts.filter(a => a.severity === 'high').length,
        medium: updatedAlerts.filter(a => a.severity === 'medium').length,
        low: updatedAlerts.filter(a => a.severity === 'low').length,
        unread: updatedAlerts.filter(a => !a.read).length
      }
      setAlertStats(stats)
    } catch (err) {
      console.error('Failed to dismiss alert:', err)
    }
  }, [alerts])

  return {
    alerts,
    alertStats,
    loading,
    error,
    fetchAlerts,
    markAsRead,
    markAllAsRead,
    dismissAlert
  }
}