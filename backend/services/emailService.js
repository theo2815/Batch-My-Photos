/**
 * Email Service — Transactional email notifications via Resend
 *
 * Handles all email sending for BatchMyPhotos:
 *   - Payment confirmation
 *   - Subscription expiring reminder
 *   - New device bound alert
 *   - Device removed alert
 *   - Monthly usage summary
 *
 * Requires env vars:
 *   RESEND_API_KEY   — API key from https://resend.com
 *   EMAIL_FROM       — Sender address (default: BatchMyPhotos <notifications@batchmyphotos.com>)
 */

const { Resend } = require('resend')

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null

const EMAIL_FROM = process.env.EMAIL_FROM || 'BatchMyPhotos <notifications@batchmyphotos.com>'
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || 'batchmyphotos@gmail.com'

// ── Core Send Function ──────────────────────────────────────────────────────

/**
 * Send an email via Resend. Fails silently (logs error) so it never
 * blocks the main request flow.
 */
async function sendEmail({ to, subject, html }) {
  if (!resend) {
    console.warn('Email: RESEND_API_KEY not set — skipping email to', to)
    return null
  }

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      reply_to: [EMAIL_REPLY_TO],
      to,
      subject,
      html,
    })

    if (error) {
      console.error('Email send error:', error)
      return null
    }

    console.log(`📧 Email sent to ${to}: "${subject}" (id: ${data?.id})`)
    return data
  } catch (err) {
    console.error('Email send exception:', err.message)
    return null
  }
}

// ── Shared Styles ───────────────────────────────────────────────────────────
// Table-based layout for universal email client compatibility
// Dark mode color scheme matching the BatchMyPhotos desktop app

const LOGO_URL = 'https://www.batchmyphotos.com/app_icon.png'
const DASHBOARD_URL = 'https://www.batchmyphotos.com/login'

const COLORS = {
  bgOuter:    '#141414',  // outer background
  bgPrimary:  '#1e1e1e',  // main container bg  (--bg-primary)
  bgCard:     '#2d2d2d',  // card/highlight bg   (--bg-secondary)
  bgInput:    '#383838',  // input/hover          (--bg-tertiary)
  accent:     '#3b82f6',  // electric blue        (--accent-primary)
  accentHov:  '#2563eb',  // darker blue          (--accent-secondary)
  success:    '#10b981',  // emerald
  warning:    '#f59e0b',  // amber
  error:      '#ef4444',  // red
  textPri:    '#ffffff',  // primary text
  textSec:    '#a1a1aa',  // secondary text       (--text-secondary)
  textMuted:  '#71717a',  // muted/footer         (--text-muted)
  border:     'rgba(255,255,255,0.08)',
}

/**
 * Build a detail row (label + value) using a table for reliable spacing.
 */
function detailRow(label, value, isLast = false) {
  return `
    <tr>
      <td style="padding: 10px 16px; color: ${COLORS.textSec}; font-size: 14px; white-space: nowrap; border-bottom: ${isLast ? 'none' : `1px solid ${COLORS.border}`};">
        ${label}
      </td>
      <td style="padding: 10px 16px; color: ${COLORS.textPri}; font-size: 14px; font-weight: 600; text-align: right; border-bottom: ${isLast ? 'none' : `1px solid ${COLORS.border}`};">
        ${value}
      </td>
    </tr>`
}

/**
 * Build a CTA button centered in the email.
 */
function ctaButton(text, url) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 28px auto 8px;">
      <tr>
        <td style="border-radius: 8px; background: ${COLORS.accent};">
          <a href="${url}" target="_blank"
             style="display: inline-block; padding: 14px 32px; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; letter-spacing: 0.3px;">
            ${text}
          </a>
        </td>
      </tr>
    </table>`
}

/**
 * Wrap body content in the full email shell: outer bg → container → header → body → footer
 */
function wrapTemplate(headerTitle, headerSub, bodyHtml) {
  const year = new Date().getFullYear()

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>${headerTitle}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: ${COLORS.bgOuter}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased;">

<!-- Outer wrapper -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: ${COLORS.bgOuter};">
  <tr>
    <td align="center" style="padding: 40px 16px;">

      <!-- Container -->
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width: 560px; width: 100%; background-color: ${COLORS.bgPrimary}; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.5);">

        <!-- Header -->
        <tr>
          <td style="background: linear-gradient(135deg, ${COLORS.accent} 0%, ${COLORS.accentHov} 100%); padding: 36px 32px; text-align: center;">
            <img src="${LOGO_URL}" alt="BatchMyPhotos" width="56" height="56" style="display: block; width: 56px; height: 56px; margin: 0 auto 16px; border-radius: 14px; border: 2px solid rgba(255,255,255,0.2);" />
            <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: -0.3px;">
              ${headerTitle}
            </h1>
            ${headerSub ? `<p style="margin: 10px 0 0; color: rgba(255,255,255,0.8); font-size: 14px; font-weight: 400;">${headerSub}</p>` : ''}
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding: 36px 32px;">
            ${bodyHtml}
          </td>
        </tr>

        <!-- Divider -->
        <tr>
          <td style="padding: 0 32px;">
            <div style="border-top: 1px solid ${COLORS.border};"></div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding: 24px 32px; text-align: center;">
            <p style="margin: 0 0 12px; color: ${COLORS.textMuted}; font-size: 12px;">
              This is an automated email. If you have any questions, contact us at
              <a href="mailto:batchmyphotos@gmail.com" style="color: ${COLORS.textSec}; text-decoration: underline;">batchmyphotos@gmail.com</a>.
            </p>
            <p style="margin: 0 0 8px; color: ${COLORS.textMuted}; font-size: 12px;">
              &copy; ${year} BatchMyPhotos. All rights reserved.
            </p>
            <p style="margin: 0; font-size: 12px;">
              <a href="${DASHBOARD_URL}" style="color: ${COLORS.textSec}; text-decoration: underline;">Dashboard</a>
              &nbsp;&nbsp;·&nbsp;&nbsp;
              <a href="https://www.batchmyphotos.com" style="color: ${COLORS.textSec}; text-decoration: underline;">Website</a>
              &nbsp;&nbsp;·&nbsp;&nbsp;
              <a href="mailto:batchmyphotos@gmail.com" style="color: ${COLORS.textSec}; text-decoration: underline;">Support</a>
            </p>
            <p style="margin: 12px 0 0; font-size: 11px;">
              <a href="mailto:batchmyphotos@gmail.com?subject=Unsubscribe&body=Please%20unsubscribe%20me%20from%20email%20notifications." style="color: ${COLORS.textMuted}; text-decoration: underline;">Unsubscribe</a>
            </p>
          </td>
        </tr>

      </table>
      <!-- /Container -->

    </td>
  </tr>
</table>
<!-- /Outer wrapper -->

</body>
</html>`
}

/**
 * Helper: build the highlight card (detail table) used across templates
 */
function highlightCard(rows) {
  const rowsHtml = rows.map((r, i) => detailRow(r.label, r.value, i === rows.length - 1)).join('')
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           style="background-color: ${COLORS.bgCard}; border-radius: 10px; margin: 24px 0; border: 1px solid ${COLORS.border};">
      ${rowsHtml}
    </table>`
}

/**
 * Helper: paragraph text
 */
function p(text) {
  return `<p style="margin: 0 0 18px; color: ${COLORS.textSec}; font-size: 15px; line-height: 1.7;">${text}</p>`
}

// ── Email Templates ─────────────────────────────────────────────────────────

/**
 * Payment confirmed — sent after successful subscription payment
 */
async function sendPaymentConfirmation({ to, amount, currency, plan, expiresAt }) {
  const formattedAmount = currency === 'PHP'
    ? `₱${(amount / 100).toFixed(2)}`
    : `${(amount / 100).toFixed(2)} ${currency}`

  const expiryDate = new Date(expiresAt).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })

  const html = wrapTemplate(
    'Payment Confirmed', 'Your subscription is now active',
    `${p('Thank you for subscribing to <strong style="color: #ffffff;">BatchMyPhotos Pro</strong>! Your payment has been processed successfully.')}
     ${highlightCard([
       { label: 'Plan', value: 'Pro — Monthly' },
       { label: 'Amount', value: formattedAmount },
       { label: 'Valid Until', value: expiryDate },
     ])}
     ${p('You now have access to unlimited batch operations and up to 2 devices. Enjoy!')}
     ${p('Don\'t have the app yet? Download it now from the Microsoft Store:')}
     ${ctaButton('Download BatchMyPhotos', 'https://apps.microsoft.com/detail/9N1KKMV4NX4J')}`
  )

  return sendEmail({ to, subject: 'Payment Confirmed — BatchMyPhotos Pro', html })
}

/**
 * Subscription expiring soon — sent 3 days before expiry (cron)
 */
async function sendSubscriptionExpiring({ to, expiresAt }) {
  const expiryDate = new Date(expiresAt).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })

  const html = wrapTemplate(
    'Subscription Expiring Soon', 'Your Pro plan expires in 3 days',
    `${p('Hey there! Just a heads-up that your <strong style="color: #ffffff;">BatchMyPhotos Pro</strong> subscription will expire on <strong style="color: #ffffff;">' + expiryDate + '</strong>.')}
     ${highlightCard([
       { label: 'Expires On', value: expiryDate },
     ])}
     ${p('To continue using unlimited batch operations and multi-device support, make sure to renew before it expires.')}
     ${p('If you don\'t renew, your account will revert to the Free plan (2 batches/month, 1 device).')}
     ${ctaButton('Go to Dashboard', DASHBOARD_URL)}`
  )

  return sendEmail({ to, subject: 'Your Pro Plan Expires Soon — BatchMyPhotos', html })
}

/**
 * New device bound — security alert when a new device is registered
 */
async function sendNewDeviceAlert({ to, deviceLabel, boundAt }) {
  const dateStr = new Date(boundAt).toLocaleString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })

  const html = wrapTemplate(
    'New Device Added', 'A new device was registered to your account',
    `${p('A new device has been added to your BatchMyPhotos account:')}
     ${highlightCard([
       { label: 'Device', value: deviceLabel },
       { label: 'Added On', value: dateStr },
     ])}
     ${p('If this wasn\'t you, please visit your dashboard immediately to remove the device and secure your account.')}
     ${ctaButton('Review Devices', DASHBOARD_URL)}`
  )

  return sendEmail({ to, subject: 'New Device Added — BatchMyPhotos', html })
}

/**
 * Device removed — security alert when a device is de-authorized
 */
async function sendDeviceRemovedAlert({ to, deviceLabel, removedAt }) {
  const dateStr = new Date(removedAt).toLocaleString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })

  const html = wrapTemplate(
    'Device Removed', 'A device was removed from your account',
    `${p('A device has been removed from your BatchMyPhotos account:')}
     ${highlightCard([
       { label: 'Device', value: deviceLabel },
       { label: 'Removed On', value: dateStr },
     ])}
     ${p('A <strong style="color: ' + COLORS.warning + ';">24-hour cooldown</strong> is now in effect before a new device can be added.')}
     ${p('If this wasn\'t you, please secure your account immediately.')}`
  )

  return sendEmail({ to, subject: 'Device Removed — BatchMyPhotos', html })
}

/**
 * Monthly usage summary — sent on the 1st of each month (cron)
 */
async function sendMonthlyUsageSummary({ to, monthLabel, batchesUsed, plan }) {
  const planLabel = plan === 'pro' ? 'Pro' : plan === 'pro_plus' ? 'Pro+' : 'Free'
  const limitLabel = plan === 'pro' || plan === 'pro_plus' ? 'Unlimited' : '2'

  const html = wrapTemplate(
    'Monthly Usage Summary', monthLabel,
    `${p('Here\'s your BatchMyPhotos usage summary for <strong style="color: #ffffff;">' + monthLabel + '</strong>:')}
     ${highlightCard([
       { label: 'Plan', value: planLabel },
       { label: 'Batches Used', value: String(batchesUsed) },
       { label: 'Batch Limit', value: limitLabel },
     ])}
     ${p('Thanks for using BatchMyPhotos! Keep organizing those photos.')}`
  )

  return sendEmail({ to, subject: `Your ${monthLabel} Usage Summary — BatchMyPhotos`, html })
}

/**
 * Subscription cancelled — sent after user cancels their Pro plan
 */
async function sendSubscriptionCancelled({ to }) {
  const html = wrapTemplate(
    'Subscription Cancelled', 'Your Pro plan has been deactivated',
    `${p('Your <strong style="color: #ffffff;">BatchMyPhotos Pro</strong> subscription has been cancelled and your account has been reverted to the Free plan.')}
     ${highlightCard([
       { label: 'New Plan', value: 'Free' },
       { label: 'Batch Limit', value: '2 per month' },
       { label: 'Device Limit', value: '1 device' },
     ])}
     ${p('You can re-subscribe anytime from your dashboard to regain access to unlimited batch operations and multi-device support.')}
     ${ctaButton('Re-subscribe', DASHBOARD_URL)}`
  )

  return sendEmail({ to, subject: 'Subscription Cancelled \u2014 BatchMyPhotos', html })
}

/**
 * Free trial activated — sent after user starts their 30-day free trial
 */
async function sendFreeTrialConfirmation({ to, trialEndAt }) {
  const expiryDate = new Date(trialEndAt).toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })

  const html = wrapTemplate(
    'Free Trial Activated', 'Your 30-day Pro trial is now active',
    `${p('Welcome to <strong style="color: #ffffff;">BatchMyPhotos Pro</strong>! Your free trial has been activated \u2014 no payment required.')}
     ${highlightCard([
       { label: 'Plan', value: 'Pro \u2014 Free Trial' },
       { label: 'Price', value: '\u20B10.00' },
       { label: 'Valid Until', value: expiryDate },
     ])}
     ${p('You now have access to <strong style="color: #ffffff;">unlimited batch operations</strong> and up to <strong style="color: #ffffff;">2 devices</strong> for the next 30 days. Enjoy!')}
     ${p('Don\'t have the app yet? Download it now from the Microsoft Store:')}
     ${ctaButton('Download BatchMyPhotos', 'https://apps.microsoft.com/detail/9N1KKMV4NX4J')}`
  )

  return sendEmail({ to, subject: 'Free Trial Activated \u2014 BatchMyPhotos Pro', html })
}

// \u2500\u2500 Exports \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

module.exports = {
  sendEmail,
  sendPaymentConfirmation,
  sendSubscriptionExpiring,
  sendSubscriptionCancelled,
  sendNewDeviceAlert,
  sendDeviceRemovedAlert,
  sendMonthlyUsageSummary,
  sendFreeTrialConfirmation,
}
