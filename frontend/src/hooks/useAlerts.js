import { useState, useEffect, useCallback, useRef } from 'react'
import axios from '../utils/axios'
import { useOrganization } from '../contexts/OrganizationContext'
import { joinOrganization, subscribe } from '../utils/socket'

const EMPTY_STATS = {
  total: 0,
  critical: 0,
  high: 0,
  medium: 0,
  low: 0,
  unread: 0
}

/**
 * Alerts for the header dropdown.
 *
 * Counts come from the server's stats endpoint rather than from the page of
 * alerts held here: the list is paginated, so counting it locally reported the
 * page size as the total. Read state is per user and also server-held — it
 * previously did not exist at all, which is why the unread badge never
 * cleared.
 */
export const useAlerts = () => {
  const [alerts, setAlerts] = useState([])
  const [alertStats, setAlertStats] = useState(EMPTY_STATS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const { selectedOrganizationId } = useOrganization()

  // Keeps the live-event handler from closing over a stale fetch.
  const fetchRef = useRef(null)

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const [listResponse, statsResponse] = await Promise.all([
        axios.get('/api/alerts', { params: { limit: 20 } }),
        axios.get('/api/alerts/stats/summary')
      ])

      setAlerts(listResponse.data.alerts || [])

      const summary = statsResponse.data.stats
      if (summary) {
        setAlertStats({
          total: summary.total ?? 0,
          critical: summary.bySeverity?.critical ?? 0,
          high: summary.bySeverity?.high ?? 0,
          medium: summary.bySeverity?.medium ?? 0,
          low: summary.bySeverity?.low ?? 0,
          unread: summary.unread ?? 0
        })
      }
    } catch (err) {
      console.error('Failed to fetch alerts:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  fetchRef.current = fetchAlerts

  useEffect(() => {
    fetchAlerts()
  }, [fetchAlerts])

  // Live updates. The server pushes alert.created into the organization room,
  // so a new critical exposure appears without waiting for a poll.
  useEffect(() => {
    if (!selectedOrganizationId) return undefined

    joinOrganization(selectedOrganizationId)

    const unsubscribe = subscribe('alert.created', () => {
      // Refetch rather than splicing the payload in, so counts and ordering
      // stay authoritative.
      fetchRef.current?.()
    })

    return unsubscribe
  }, [selectedOrganizationId])

  const markAsRead = useCallback(async (alertId) => {
    // Optimistic, then reconciled against the server's authoritative count.
    setAlerts(prev => prev.map(a => (a.id === alertId ? { ...a, read: true } : a)))
    setAlertStats(prev => ({ ...prev, unread: Math.max(0, prev.unread - 1) }))

    try {
      const response = await axios.patch(`/api/alerts/${alertId}`, { read: true })
      if (typeof response.data?.unread === 'number') {
        setAlertStats(prev => ({ ...prev, unread: response.data.unread }))
      }
    } catch (err) {
      console.error('Failed to mark alert as read:', err)
      fetchAlerts()
    }
  }, [fetchAlerts])

  const markAllAsRead = useCallback(async () => {
    setAlerts(prev => prev.map(a => ({ ...a, read: true })))
    setAlertStats(prev => ({ ...prev, unread: 0 }))

    try {
      const response = await axios.patch('/api/alerts/mark-all-read')
      if (typeof response.data?.unread === 'number') {
        setAlertStats(prev => ({ ...prev, unread: response.data.unread }))
      }
    } catch (err) {
      console.error('Failed to mark all alerts as read:', err)
      fetchAlerts()
    }
  }, [fetchAlerts])

  const dismissAlert = useCallback(async (alertId) => {
    try {
      await axios.delete(`/api/alerts/${alertId}`)
      // Deleting changes every count, so take them from the server.
      await fetchAlerts()
    } catch (err) {
      console.error('Failed to dismiss alert:', err)
    }
  }, [fetchAlerts])

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
