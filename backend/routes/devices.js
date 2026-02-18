/**
 * Device Management Routes — HWID Binding, Heartbeat, Device CRUD
 *
 * Endpoints:
 *   POST   /api/devices/bind       — Bind a device to the user's subscription
 *   POST   /api/devices/heartbeat  — Update last_seen_at + concurrent session enforcement
 *   GET    /api/devices            — List all devices for the authenticated user
 *   DELETE /api/devices/:id        — De-authorize (remove) a device binding
 */

const express = require('express')
const { authenticateUser } = require('../middleware/auth')
const router = express.Router()

// ============================================================================
// POST /api/devices/bind — Bind a device to the user's subscription
// ============================================================================

router.post('/devices/bind', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id
    const hwid = req.body.hwid || req.headers['x-device-id']
    const deviceLabel = req.body.device_label || 'Unknown Device'

    if (!hwid || typeof hwid !== 'string' || hwid.length < 16 || hwid.length > 128) {
      return res.status(400).json({ error: 'Invalid or missing device ID' })
    }

    const supabaseAdmin = req.app.locals.supabaseAdmin

    // 1. Get user's subscription and device_limit
    const { data: sub, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('plan, status, expires_at, device_limit')
      .eq('user_id', userId)
      .single()

    if (subError || !sub) {
      // No subscription = free tier, default limit of 1
      // Still allow binding with limit of 1
    }

    const isExpired = sub?.expires_at && new Date(sub.expires_at) < new Date()
    const isPro = sub && (sub.plan === 'pro' || sub.plan === 'pro_plus') && !isExpired && sub.status === 'active'

    // Determine device limit based on plan
    let deviceLimit = 1 // Free tier default
    if (isPro && sub) {
      deviceLimit = sub.device_limit || (sub.plan === 'pro_plus' ? 5 : 2)
    }

    // 2. Call atomic check_and_bind_device RPC
    const { data: result, error: rpcError } = await supabaseAdmin
      .rpc('check_and_bind_device', {
        p_user_id: userId,
        p_hwid: hwid,
        p_label: deviceLabel.substring(0, 64),
        p_limit: deviceLimit,
      })

    if (rpcError) {
      console.error('Device bind RPC error:', rpcError)
      return res.status(500).json({ error: 'Failed to bind device' })
    }

    // 3. Parse result and respond
    if (result.bound) {
      return res.json({
        bound: true,
        existing: result.existing || false,
        device_limit: deviceLimit,
      })
    }

    // Cooldown active (new device blocked for 24h after a removal)
    if (result.reason === 'cooldown_active') {
      return res.status(403).json({
        error: 'A device was recently removed. Please wait before adding a new device.',
        code: 'COOLDOWN_ACTIVE',
        cooldown_ends: result.cooldown_ends,
      })
    }

    // Device limit reached
    return res.status(403).json({
      error: 'Device limit reached. Remove an existing device to use this one.',
      code: 'DEVICE_LIMIT_REACHED',
      count: result.count,
      limit: result.limit || deviceLimit,
    })
  } catch (err) {
    console.error('Device bind error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})


// ============================================================================
// POST /api/devices/heartbeat — Update last_seen_at + concurrent enforcement
// ============================================================================

router.post('/devices/heartbeat', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id
    const hwid = req.body.hwid || req.headers['x-device-id']

    if (!hwid || typeof hwid !== 'string') {
      return res.status(400).json({ error: 'Missing device ID' })
    }

    const supabaseAdmin = req.app.locals.supabaseAdmin

    // 1. Check device exists for this user
    const { data: device, error: devError } = await supabaseAdmin
      .from('device_bindings')
      .select('id')
      .eq('user_id', userId)
      .eq('hwid_hash', hwid)
      .single()

    if (devError || !device) {
      return res.status(404).json({ error: 'Device not registered', code: 'DEVICE_NOT_FOUND' })
    }

    // 2. Get device_limit from subscription
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('device_limit, plan')
      .eq('user_id', userId)
      .single()

    const deviceLimit = sub?.device_limit || (sub?.plan === 'pro_plus' ? 5 : sub?.plan === 'pro' ? 2 : 1)

    // 3. Enforce concurrent session limits
    const { data: result, error: rpcError } = await supabaseAdmin
      .rpc('enforce_concurrent_sessions', {
        p_user_id: userId,
        p_hwid: hwid,
        p_limit: deviceLimit,
      })

    if (rpcError) {
      console.error('Heartbeat RPC error:', rpcError)
      // Non-fatal — at least update last_seen directly
      await supabaseAdmin
        .from('device_bindings')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('hwid_hash', hwid)

      return res.json({ ok: true })
    }

    if (result && !result.ok && result.invalidated) {
      // A concurrent session was invalidated — inform the client
      return res.status(409).json({
        ok: false,
        invalidated: true,
        message: 'A concurrent session exceeded your plan limit and was removed.',
      })
    }

    return res.json({ ok: true })
  } catch (err) {
    console.error('Heartbeat error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})


// ============================================================================
// GET /api/devices — List all devices for the authenticated user
// ============================================================================

router.get('/devices', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id
    const supabaseAdmin = req.app.locals.supabaseAdmin

    const { data: devices, error } = await supabaseAdmin
      .from('device_bindings')
      .select('id, hwid_hash, device_label, bound_at, last_seen_at')
      .eq('user_id', userId)
      .order('bound_at', { ascending: true })

    if (error) {
      console.error('List devices error:', error)
      return res.status(500).json({ error: 'Failed to fetch devices' })
    }

    // Also get the user's subscription info
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('device_limit, plan, device_removals_limit, device_removals_reset_at')
      .eq('user_id', userId)
      .single()

    const deviceLimit = sub?.device_limit || (sub?.plan === 'pro_plus' ? 5 : sub?.plan === 'pro' ? 2 : 1)
    const removalsLimit = sub?.device_removals_limit ?? 3
    const removalsResetAt = sub?.device_removals_reset_at || null

    // Count removals in current billing period
    let removalsUsed = 0
    let cooldownEndsAt = null

    if (removalsResetAt) {
      const periodStart = new Date(new Date(removalsResetAt).getTime() - 30 * 86400000).toISOString()

      const { data: removals } = await supabaseAdmin
        .from('device_removals')
        .select('removed_at')
        .eq('user_id', userId)
        .gte('removed_at', periodStart)
        .order('removed_at', { ascending: false })

      removalsUsed = removals?.length || 0

      // Check if cooldown is active (last removal < 24h ago)
      if (removals && removals.length > 0) {
        const lastRemoval = new Date(removals[0].removed_at)
        const cooldownEnd = new Date(lastRemoval.getTime() + 24 * 3600000)
        if (cooldownEnd > new Date()) {
          cooldownEndsAt = cooldownEnd.toISOString()
        }
      }
    }

    return res.json({
      devices: devices || [],
      device_limit: deviceLimit,
      device_count: (devices || []).length,
      removals_used: removalsUsed,
      removals_limit: removalsLimit,
      removals_reset_at: removalsResetAt,
      cooldown_ends_at: cooldownEndsAt,
    })
  } catch (err) {
    console.error('List devices error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})


// ============================================================================
// DELETE /api/devices/:id — De-authorize (remove) a device binding
// ============================================================================

router.delete('/devices/:id', authenticateUser, async (req, res) => {
  try {
    const userId = req.user.id
    const deviceId = req.params.id

    // UUID format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(deviceId)) {
      return res.status(400).json({ error: 'Invalid device ID format' })
    }

    const supabaseAdmin = req.app.locals.supabaseAdmin

    // 1. Get subscription for removal limits
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('device_removals_limit, device_removals_reset_at')
      .eq('user_id', userId)
      .single()

    let removalsLimit = sub?.device_removals_limit ?? 3
    let removalsResetAt = sub?.device_removals_reset_at

    // 2. Auto-reset if the period has expired
    if (removalsResetAt && new Date(removalsResetAt) <= new Date()) {
      // Period expired — purge old removal records and reset the date
      const newResetAt = new Date(Date.now() + 30 * 86400000).toISOString()
      await supabaseAdmin
        .from('device_removals')
        .delete()
        .eq('user_id', userId)
        .lt('removed_at', removalsResetAt)

      await supabaseAdmin
        .from('subscriptions')
        .update({ device_removals_reset_at: newResetAt })
        .eq('user_id', userId)

      removalsResetAt = newResetAt
    }

    // 3. Check if removal is allowed (monthly cap)
    const { data: checkResult, error: checkErr } = await supabaseAdmin
      .rpc('check_removal_allowed', {
        p_user_id: userId,
        p_removals_limit: removalsLimit,
        p_reset_at: removalsResetAt || null,
      })

    if (checkErr) {
      console.error('check_removal_allowed RPC error:', checkErr)
      // Fail-open: allow removal if the RPC itself errors
    } else if (checkResult && !checkResult.allowed) {
      return res.status(403).json({
        error: `You've used all ${removalsLimit} device removals for this billing period. Removals reset on ${new Date(removalsResetAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`,
        code: 'REMOVAL_LIMIT_REACHED',
        removals_used: checkResult.used,
        removals_limit: checkResult.limit,
        removals_reset_at: removalsResetAt,
      })
    }

    // 4. Fetch the device row BEFORE deleting (need hwid_hash for audit)
    const { data: deviceRow, error: fetchErr } = await supabaseAdmin
      .from('device_bindings')
      .select('id, hwid_hash, device_label')
      .eq('id', deviceId)
      .eq('user_id', userId)
      .single()

    if (fetchErr || !deviceRow) {
      return res.status(404).json({ error: 'Device not found or not owned by you' })
    }

    // 5. Delete the device binding
    const { error: delError } = await supabaseAdmin
      .from('device_bindings')
      .delete()
      .eq('id', deviceId)
      .eq('user_id', userId)

    if (delError) {
      console.error('Delete device error:', delError)
      return res.status(500).json({ error: 'Failed to remove device' })
    }

    // 6. Record the removal in device_removals audit table
    await supabaseAdmin
      .from('device_removals')
      .insert({
        user_id: userId,
        removed_hwid: deviceRow.hwid_hash,
        device_label: deviceRow.device_label,
      })

    // 7. Calculate response metrics
    const removalsUsed = (checkResult?.used ?? 0) + 1
    const cooldownEndsAt = new Date(Date.now() + 24 * 3600000).toISOString()

    return res.json({
      success: true,
      removed: deviceRow,
      removals_used: removalsUsed,
      removals_limit: removalsLimit,
      cooldown_ends_at: cooldownEndsAt,
      removals_reset_at: removalsResetAt,
    })
  } catch (err) {
    console.error('Delete device error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

module.exports = router
