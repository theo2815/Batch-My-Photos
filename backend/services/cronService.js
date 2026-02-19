/**
 * Cron Service — Scheduled background tasks
 *
 * Jobs:
 *   1. Daily 9:00 AM UTC — Check for subscriptions expiring in 3 days, send reminder email
 *   2. Monthly 1st at 10:00 AM UTC — Send usage summary to all users who had activity
 */

const cron = require('node-cron')
const {
  sendSubscriptionExpiring,
  sendMonthlyUsageSummary,
} = require('./emailService')

/**
 * Initialize all cron jobs. Call once after the server starts.
 * @param {object} supabaseAdmin — Service-role Supabase client
 */
function initCronJobs(supabaseAdmin) {
  if (!supabaseAdmin) {
    console.warn('Cron: supabaseAdmin not provided — skipping cron setup')
    return
  }

  // ── Daily: Subscription expiry reminder (9:00 AM UTC) ───────────────────
  cron.schedule('0 9 * * *', async () => {
    console.log('⏰ Cron: Checking for expiring subscriptions...')
    try {
      // Find active Pro subscriptions expiring within the next 3 days
      const now = new Date()
      const threeDaysLater = new Date(now.getTime() + 3 * 86400000)

      // Window: expiring between now and 3 days from now
      const { data: expiringSubs, error } = await supabaseAdmin
        .from('subscriptions')
        .select('user_id, expires_at')
        .eq('status', 'active')
        .eq('plan', 'pro')
        .gte('expires_at', now.toISOString())
        .lte('expires_at', threeDaysLater.toISOString())

      if (error) {
        console.error('Cron: Failed to fetch expiring subs:', error)
        return
      }

      if (!expiringSubs || expiringSubs.length === 0) {
        console.log('Cron: No subscriptions expiring in the next 3 days.')
        return
      }

      console.log(`Cron: Found ${expiringSubs.length} expiring subscription(s)`)

      for (const sub of expiringSubs) {
        // Look up user email from Supabase Auth
        const { data: userData, error: userErr } = await supabaseAdmin
          .auth.admin.getUserById(sub.user_id)

        if (userErr || !userData?.user?.email) {
          console.warn(`Cron: Could not fetch email for user ${sub.user_id}`)
          continue
        }

        await sendSubscriptionExpiring({
          to: userData.user.email,
          expiresAt: sub.expires_at,
        })
      }

      console.log('Cron: Expiry reminder job complete.')
    } catch (err) {
      console.error('Cron: Expiry check error:', err)
    }
  }, { timezone: 'UTC' })

  // ── Monthly: Usage summary (1st of every month at 10:00 AM UTC) ─────────
  cron.schedule('0 10 1 * *', async () => {
    console.log('⏰ Cron: Generating monthly usage summaries...')
    try {
      // Last month label (e.g., "January 2026")
      const now = new Date()
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const monthLabel = lastMonth.toLocaleDateString('en-US', {
        month: 'long', year: 'numeric',
      })
      const monthYear = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`

      // Fetch usage records for that month
      const { data: usageRows, error } = await supabaseAdmin
        .from('batch_usage')
        .select('user_id, batch_count')
        .eq('month_year', monthYear)

      if (error) {
        console.error('Cron: Failed to fetch usage:', error)
        return
      }

      if (!usageRows || usageRows.length === 0) {
        console.log('Cron: No usage data for', monthYear)
        return
      }

      console.log(`Cron: Sending summary to ${usageRows.length} user(s)`)

      for (const row of usageRows) {
        // Look up user's email + plan
        const { data: userData, error: userErr } = await supabaseAdmin
          .auth.admin.getUserById(row.user_id)

        if (userErr || !userData?.user?.email) continue

        const { data: sub } = await supabaseAdmin
          .from('subscriptions')
          .select('plan')
          .eq('user_id', row.user_id)
          .single()

        await sendMonthlyUsageSummary({
          to: userData.user.email,
          monthLabel,
          batchesUsed: row.batch_count,
          plan: sub?.plan || 'free',
        })
      }

      console.log('Cron: Monthly summary job complete.')
    } catch (err) {
      console.error('Cron: Monthly summary error:', err)
    }
  }, { timezone: 'UTC' })

  console.log('✅ Cron jobs initialized (expiry reminder: daily 9AM UTC, usage summary: 1st of month 10AM UTC)')
}

module.exports = { initCronJobs }
