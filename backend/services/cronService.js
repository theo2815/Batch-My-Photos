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
 * Helper to fetch emails for a batch of user IDs using the secure RPC.
 * Chunks the requests into batches of 100 to prevent oversized queries.
 */
async function getEmailsForUsers(supabaseAdmin, userIds) {
  const uniqueIds = [...new Set(userIds)].filter(Boolean)
  if (uniqueIds.length === 0) return {}

  const emailMap = {}
  const chunkSize = 100

  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize)
    const { data, error } = await supabaseAdmin.rpc('get_user_emails', { user_ids: chunk })
    
    if (error) {
      console.error('Cron: Failed to fetch user emails chunk:', error)
      continue
    }

    if (data) {
      for (const row of data) {
        if (row.email) emailMap[row.id] = row.email
      }
    }
  }

  return emailMap
}

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

      const userIdsToEmail = []

      if (!expiringSubs || expiringSubs.length === 0) {
        console.log('Cron: No paid subscriptions expiring in the next 3 days.')
      } else {
        console.log(`Cron: Found ${expiringSubs.length} expiring subscription(s)`)
        userIdsToEmail.push(...expiringSubs.map(s => s.user_id))
      }

      // ── Free trial expiry reminders ────────────────────────────────
      const { data: expiringTrials, error: trialError } = await supabaseAdmin
        .from('subscriptions')
        .select('user_id, free_trial_end_at')
        .eq('free_trial_used', true)
        .eq('status', 'active')
        .gte('free_trial_end_at', now.toISOString())
        .lte('free_trial_end_at', threeDaysLater.toISOString())

      if (!trialError && expiringTrials && expiringTrials.length > 0) {
        console.log(`Cron: Found ${expiringTrials.length} expiring free trial(s)`)
        userIdsToEmail.push(...expiringTrials.map(t => t.user_id))
      }

      if (userIdsToEmail.length === 0) {
        console.log('Cron: No emails to send today.')
        return
      }

      // ── Bulk Fetch Emails and Send ──────────────────────────────────
      const emailMap = await getEmailsForUsers(supabaseAdmin, userIdsToEmail)
      let emailsSent = 0

      // Process Paid Subs
      if (expiringSubs && expiringSubs.length > 0) {
        for (const sub of expiringSubs) {
          const email = emailMap[sub.user_id]
          if (!email) {
            console.warn(`Cron: Could not fetch email for user ${sub.user_id}`)
            continue
          }
          await sendSubscriptionExpiring({
            to: email,
            expiresAt: sub.expires_at,
          }).catch(() => {})
          emailsSent++
        }
      }

      // Process Free Trials
      if (!trialError && expiringTrials && expiringTrials.length > 0) {
        for (const trial of expiringTrials) {
          const email = emailMap[trial.user_id]
          if (!email) continue
          await sendSubscriptionExpiring({
            to: email,
            expiresAt: trial.free_trial_end_at,
          }).catch(() => {})
          emailsSent++
        }
      }

      console.log(`Cron: Expiry reminder job complete. Sent ${emailsSent} emails.`)
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

      console.log(`Cron: Fetching emails and plans for ${usageRows.length} user(s)`)

      const userIds = usageRows.map(r => r.user_id)
      
      // Fetch all emails in bulk
      const emailMap = await getEmailsForUsers(supabaseAdmin, userIds)

      // Fetch all subscription plans in bulk using chunking for .in()
      const planMap = {}
      const chunkSize = 100
      for (let i = 0; i < userIds.length; i += chunkSize) {
        const chunk = userIds.slice(i, i + chunkSize)
        const { data: subData } = await supabaseAdmin
          .from('subscriptions')
          .select('user_id, plan')
          .in('user_id', chunk)
        
        if (subData) {
          for (const sub of subData) {
            planMap[sub.user_id] = sub.plan
          }
        }
      }

      let emailsSent = 0
      for (const row of usageRows) {
        const email = emailMap[row.user_id]
        if (!email) continue

        const plan = planMap[row.user_id] || 'free'

        await sendMonthlyUsageSummary({
          to: email,
          monthLabel,
          batchesUsed: row.batch_count,
          plan,
        }).catch(() => {})
        emailsSent++
      }

      console.log(`Cron: Monthly summary job complete. Sent ${emailsSent} emails.`)
    } catch (err) {
      console.error('Cron: Monthly summary error:', err)
    }
  }, { timezone: 'UTC' })

  console.log('✅ Cron jobs initialized (expiry reminder: daily 9AM UTC, usage summary: 1st of month 10AM UTC)')
}

module.exports = { initCronJobs }
