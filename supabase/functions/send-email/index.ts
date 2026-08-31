// POST /functions/v1/send-email — internal email dispatcher.
// Called by the database via pg_net (_send_email() in
// 20260831000003_email_notify_infra.sql). verify_jwt = false; auth is the
// x-email-secret shared secret (EMAIL_FN_SECRET env = Vault 'email_fn_secret').
// Always fire-and-forget from the caller's perspective: a template/Resend
// failure logs and still returns 200 so pg_net never retries into duplicates.

import {
  sendNewDeviceAlert,
  sendDeviceRemovedAlert,
  sendFreeTrialConfirmation,
  sendSubscriptionCancelled,
  sendSubscriptionExpiring,
} from '../_shared/emails.ts'

Deno.serve(async (req) => {
  const secret = Deno.env.get('EMAIL_FN_SECRET')
  if (!secret || req.headers.get('x-email-secret') !== secret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { kind, to, data = {} } = await req.json()
    if (!kind || !to) return Response.json({ error: 'Missing kind or to' }, { status: 400 })

    switch (kind) {
      case 'new_device':
        await sendNewDeviceAlert({ to, deviceLabel: data.device_label || 'Unknown Device', boundAt: data.bound_at })
        break
      case 'device_removed':
        await sendDeviceRemovedAlert({ to, deviceLabel: data.device_label || 'Unknown Device', removedAt: data.removed_at })
        break
      case 'trial_started':
        await sendFreeTrialConfirmation({ to, trialEndAt: data.trial_end_at })
        break
      case 'subscription_cancelled':
        await sendSubscriptionCancelled({ to })
        break
      case 'subscription_expiring':
        await sendSubscriptionExpiring({ to, expiresAt: data.expires_at })
        break
      default:
        console.warn('send-email: unknown kind', kind)
        return Response.json({ error: `Unknown kind: ${kind}` }, { status: 400 })
    }

    return Response.json({ ok: true })
  } catch (err) {
    console.error('send-email error:', err)
    return Response.json({ ok: false }, { status: 200 })
  }
})
