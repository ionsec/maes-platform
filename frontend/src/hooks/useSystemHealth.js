import React from 'react'
import axios from '../utils/axios'

const INITIAL = {
  api: 'unknown',
  database: 'unknown',
  redis: 'unknown',
  extractor: 'unknown',
  analyzer: 'unknown',
  storage: 'unknown',
  lastCheck: null,
  overallStatus: null,
}

export const HEALTH_SERVICES = [
  { key: 'api', label: 'API', description: 'Core application services' },
  { key: 'database', label: 'Database', description: 'Data storage and retrieval' },
  { key: 'redis', label: 'Redis', description: 'Job queues and cache' },
  { key: 'extractor', label: 'Extractor', description: 'M365 data collection' },
  { key: 'analyzer', label: 'Analyzer', description: 'Detection engine' },
  { key: 'storage', label: 'Storage', description: 'File and artifact storage' },
]

/**
 * Poll /api/health once a minute. Shared by the topbar status popover and the
 * sidebar's health footer so both always agree. 'unknown' means the service
 * isn't deployed and is treated as neutral, never as a failure.
 */
export function useSystemHealth(intervalMs = 60000) {
  const [status, setStatus] = React.useState(INITIAL)

  const check = React.useCallback(async () => {
    try {
      const res = await axios.get('/api/health').catch(() => ({ data: { status: 'unhealthy' } }))
      const d = res.data || {}
      const next = {
        api: d.status === 'healthy' ? 'healthy' : 'unhealthy',
        database: d.database || 'unknown',
        redis: d.redis || 'unknown',
        extractor: d.extractor || 'unknown',
        analyzer: d.analyzer || 'unknown',
        storage: d.storage || 'unknown',
        lastCheck: new Date(),
      }
      const known = HEALTH_SERVICES.map((s) => next[s.key]).filter((s) => s === 'healthy' || s === 'unhealthy')
      next.overallStatus = known.includes('unhealthy') ? 'unhealthy' : 'healthy'
      next.healthyCount = known.filter((s) => s === 'healthy').length
      next.knownCount = known.length
      setStatus(next)
    } catch {
      setStatus((prev) => ({ ...prev, api: 'unhealthy', overallStatus: 'unhealthy', lastCheck: new Date() }))
    }
  }, [])

  React.useEffect(() => {
    check()
    const id = setInterval(check, intervalMs)
    return () => clearInterval(id)
  }, [check, intervalMs])

  return { status, refresh: check }
}

export default useSystemHealth
