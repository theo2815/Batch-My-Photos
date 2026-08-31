'use client'

/**
 * useDevices Hook
 *
 * Manages device bindings via Supabase RPCs (list_my_devices / remove_device).
 * Used on the website Dashboard to list and de-authorize devices.
 *
 * Exposes removal-limit metadata:
 *   removalsUsed, removalsLimit, cooldownEndsAt, removalsResetAt
 */

import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useDevices() {
  const [devices, setDevices] = useState([])
  const [deviceLimit, setDeviceLimit] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Removal-limit state
  const [removalsUsed, setRemovalsUsed] = useState(0)
  const [removalsLimit, setRemovalsLimit] = useState(3)
  const [cooldownEndsAt, setCooldownEndsAt] = useState(null)
  const [removalsResetAt, setRemovalsResetAt] = useState(null)

  /**
   * Fetch the authenticated user's bound devices + removal-limit info
   */
  const fetchDevices = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('Not authenticated')
        setLoading(false)
        return
      }

      const { data, error: rpcError } = await supabase.rpc('list_my_devices')
      if (rpcError) {
        throw new Error(rpcError.message || 'Failed to load devices')
      }

      setDevices(data.devices || [])
      setDeviceLimit(data.device_limit || 1)

      // Removal-limit metadata
      setRemovalsUsed(data.removals_used ?? 0)
      setRemovalsLimit(data.removals_limit ?? 3)
      setCooldownEndsAt(data.cooldown_ends_at ?? null)
      setRemovalsResetAt(data.removals_reset_at ?? null)
    } catch (err) {
      setError(err.message || 'Failed to load devices')
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * Remove a device binding.
   * REMOVAL_LIMIT_REACHED comes back as a body `code` field (200), not a 403.
   * On success returns { success, removalsUsed, removalsLimit, cooldownEndsAt }.
   * @param {string} deviceId - UUID of the device_bindings row
   */
  const removeDevice = useCallback(async (deviceId) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const { data: body, error: rpcError } = await supabase.rpc('remove_device', { p_device_id: deviceId })
      if (rpcError) {
        throw new Error(rpcError.message || 'Failed to remove device')
      }

      if (body.code === 'REMOVAL_LIMIT_REACHED') {
        setRemovalsUsed(body.removals_used ?? removalsUsed)
        setRemovalsLimit(body.removals_limit ?? removalsLimit)
        return { success: false, code: 'REMOVAL_LIMIT_REACHED', error: body.error }
      }

      if (!body.success) {
        throw new Error(body.error || 'Failed to remove device')
      }

      // Update metrics from response
      if (body.removals_used != null) setRemovalsUsed(body.removals_used)
      if (body.removals_limit != null) setRemovalsLimit(body.removals_limit)
      if (body.cooldown_ends_at) setCooldownEndsAt(body.cooldown_ends_at)
      if (body.removals_reset_at) setRemovalsResetAt(body.removals_reset_at)

      // Refresh list
      await fetchDevices()
      return {
        success: true,
        removalsUsed: body.removals_used,
        removalsLimit: body.removals_limit,
        cooldownEndsAt: body.cooldown_ends_at,
      }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }, [fetchDevices, removalsUsed, removalsLimit])

  return {
    devices,
    deviceLimit,
    loading,
    error,
    fetchDevices,
    removeDevice,
    // Removal-limit data
    removalsUsed,
    removalsLimit,
    cooldownEndsAt,
    removalsResetAt,
  }
}
