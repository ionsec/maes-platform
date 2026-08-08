import { io } from 'socket.io-client'
import { useAuthStore } from '../stores/authStore'

/**
 * Shared Socket.IO connection.
 *
 * One socket is kept for the whole app rather than one per hook: the server
 * scopes events by organization room, so several consumers can subscribe to
 * the same connection without multiplying it.
 *
 * The server authenticates the handshake with the same JWT the REST API uses
 * and decides room membership itself, so `joinOrganization` is a request, not
 * an instruction — it can be refused.
 */

let socket = null
let joinedOrganizationId = null

/** Connect (or return the existing connection). Returns null when signed out. */
export const getSocket = () => {
  const token = useAuthStore.getState().token
  if (!token) return null

  if (socket && socket.auth?.token === token) return socket

  // A changed token means a new session; drop the old socket rather than
  // leaving it connected under stale credentials.
  if (socket) {
    socket.disconnect()
    socket = null
    joinedOrganizationId = null
  }

  socket = io({
    path: '/socket.io',
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  })

  socket.on('connect_error', (error) => {
    // Auth failures are terminal until the user signs in again; log once
    // rather than reconnecting into the same rejection forever.
    if (/Authentication|token|Access denied/i.test(error.message)) {
      console.warn('Socket authentication failed:', error.message)
      socket?.disconnect()
    }
  })

  // Re-join after a reconnect, since rooms do not survive the socket.
  socket.on('connect', () => {
    if (joinedOrganizationId) {
      socket.emit('join-organization', joinedOrganizationId)
    }
  })

  return socket
}

/** Ask the server to place this socket in an organization's room. */
export const joinOrganization = (organizationId) => {
  if (!organizationId) return
  const active = getSocket()
  if (!active) return

  if (joinedOrganizationId && joinedOrganizationId !== organizationId) {
    active.emit('leave-organization', joinedOrganizationId)
  }

  joinedOrganizationId = organizationId
  active.emit('join-organization', organizationId, (ack) => {
    if (ack && ack.success === false) {
      console.warn(`Socket denied access to organization ${organizationId}: ${ack.error}`)
      joinedOrganizationId = null
    }
  })
}

/**
 * Subscribe to an event. Returns an unsubscribe function, so callers can clean
 * up in a useEffect without tearing down the shared connection.
 */
export const subscribe = (event, handler) => {
  const active = getSocket()
  if (!active) return () => {}

  active.on(event, handler)
  return () => active.off(event, handler)
}

/** Drop the connection, e.g. on sign-out. */
export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect()
    socket = null
    joinedOrganizationId = null
  }
}
