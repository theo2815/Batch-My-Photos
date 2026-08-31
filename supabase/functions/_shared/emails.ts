// Transactional emails via the Resend REST API.
// Ported from backend/services/emailService.js (monthly summary dropped by
// decision, 2026-08-31). Fire-and-forget: failures log, never throw.

const EMAIL_FROM = Deno.env.get('EMAIL_FROM') || 'BatchMyPhotos <notifications@batchmyphotos.com>'
const EMAIL_REPLY_TO = Deno.env.get('EMAIL_REPLY_TO') || 'batchmyphotos@gmail.com'
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

const LOGO_URL = 'https://www.batchmyphotos.com/app_icon.png'
const DASHBOARD_URL = 'https://www.batchmyphotos.com/login'

const COLORS = {
  bgOuter: '#141414',
  bgPrimary: '#1e1e1e',
  bgCard: '#2d2d2d',
  accent: '#3b82f6',
  accentHov: '#2563eb',
  warning: '#f59e0b',
  textPri: '#ffffff',
  textSec: '#a1a1aa',
  textMuted: '#71717a',
  border: 'rgba(255,255,255,0.08)',
}

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  if (!RESEND_API_KEY) {
    console.warn('Email: RESEND_API_KEY not set — skipping email to', to)
    return null
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: EMAIL_FROM, reply_to: [EMAIL_REPLY_TO], to, subject, html }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error('Email send error:', res.status, JSON.stringify(data))
      return null
    }
    console.log(`Email sent to ${to}: "${subject}" (id: ${data?.id})`)
    return data
  } catch (err) {
    console.error('Email send exception:', (err as Error).message)
    return null
  }
}

// ── Template helpers (verbatim port) ─────────────────────────────────────────

function detailRow(label: string, value: string, isLast = false) {
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

function ctaButton(text: string, url: string) {
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

function highlightCard(rows: Array<{ label: string; value: string }>) {
  const rowsHtml = rows.map((r, i) => detailRow(r.label, r.value, i === rows.length - 1)).join('')
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
           style="background-color: ${COLORS.bgCard}; border-radius: 10px; margin: 24px 0; border: 1px solid ${COLORS.border};">
      ${rowsHtml}
    </table>`
}

function p(text: string) {
  return `<p style="margin: 0 0 18px; color: ${COLORS.textSec}; font-size: 15px; line-height: 1.7;">${text}</p>`
}

function wrapTemplate(headerTitle: string, headerSub: string, bodyHtml: string) {
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
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: ${COLORS.bgOuter};">
  <tr>
    <td align="center" style="padding: 40px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width: 560px; width: 100%; background-color: ${COLORS.bgPrimary}; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.5);">
        <tr>
          <td style="background: linear-gradient(135deg, ${COLORS.accent} 0%, ${COLORS.accentHov} 100%); padding: 36px 32px; text-align: center;">
            <img src="${LOGO_URL}" alt="BatchMyPhotos" width="56" height="56" style="display: block; width: 56px; height: 56px; margin: 0 auto 16px; border-radius: 14px; border: 2px solid rgba(255,255,255,0.2);" />
            <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: -0.3px;">
              ${headerTitle}
            </h1>
            ${headerSub ? `<p style="margin: 10px 0 0; color: rgba(255,255,255,0.8); font-size: 14px; font-weight: 400;">${headerSub}</p>` : ''}
          </td>
        </tr>
        <tr>
          <td style="padding: 36px 32px;">
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding: 0 32px;">
            <div style="border-top: 1px solid ${COLORS.border};"></div>
          </td>
        </tr>
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
              &nbsp;&nbsp;&middot;&nbsp;&nbsp;
              <a href="https://www.batchmyphotos.com" style="color: ${COLORS.textSec}; text-decoration: underline;">Website</a>
              &nbsp;&nbsp;&middot;&nbsp;&nbsp;
              <a href="mailto:batchmyphotos@gmail.com" style="color: ${COLORS.textSec}; text-decoration: underline;">Support</a>
            </p>
            <p style="margin: 12px 0 0; font-size: 11px;">
              <a href="mailto:batchmyphotos@gmail.com?subject=Unsubscribe&body=Please%20unsubscribe%20me%20from%20email%20notifications." style="color: ${COLORS.textMuted}; text-decoration: underline;">Unsubscribe</a>
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}

const longDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

const longDateTime = (d: string) =>
  new Date(d).toLocaleString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })

// ── Templates ────────────────────────────────────────────────────────────────

export function sendPaymentConfirmation({ to, amount, currency, expiresAt }: {
  to: string; amount: number; currency: string; expiresAt: string
}) {
  const formattedAmount = currency === 'PHP'
    ? `₱${(amount / 100).toFixed(2)}`
    : `${(amount / 100).toFixed(2)} ${currency}`
  const html = wrapTemplate(
    'Payment Confirmed', 'Your subscription is now active',
    `${p('Thank you for subscribing to <strong style="color: #ffffff;">BatchMyPhotos Pro</strong>! Your payment has been processed successfully.')}
     ${highlightCard([
       { label: 'Plan', value: 'Pro — Monthly' },
       { label: 'Amount', value: formattedAmount },
       { label: 'Valid Until', value: longDate(expiresAt) },
     ])}
     ${p('You now have access to unlimited batch operations and up to 2 devices. Enjoy!')}
     ${p("Don't have the app yet? Download it now from the Microsoft Store:")}
     ${ctaButton('Download BatchMyPhotos', 'https://apps.microsoft.com/detail/9N1KKMV4NX4J')}`
  )
  return sendEmail({ to, subject: 'Payment Confirmed — BatchMyPhotos Pro', html })
}

export function sendSubscriptionExpiring({ to, expiresAt }: { to: string; expiresAt: string }) {
  const expiryDate = longDate(expiresAt)
  const html = wrapTemplate(
    'Subscription Expiring Soon', 'Your Pro plan expires in 3 days',
    `${p('Hey there! Just a heads-up that your <strong style="color: #ffffff;">BatchMyPhotos Pro</strong> subscription will expire on <strong style="color: #ffffff;">' + expiryDate + '</strong>.')}
     ${highlightCard([{ label: 'Expires On', value: expiryDate }])}
     ${p('To continue using unlimited batch operations and multi-device support, make sure to renew before it expires.')}
     ${p("If you don't renew, your account will revert to the Free plan (2 batches/month, 1 device).")}
     ${ctaButton('Go to Dashboard', DASHBOARD_URL)}`
  )
  return sendEmail({ to, subject: 'Your Pro Plan Expires Soon — BatchMyPhotos', html })
}

export function sendNewDeviceAlert({ to, deviceLabel, boundAt }: {
  to: string; deviceLabel: string; boundAt: string
}) {
  const html = wrapTemplate(
    'New Device Added', 'A new device was registered to your account',
    `${p('A new device has been added to your BatchMyPhotos account:')}
     ${highlightCard([
       { label: 'Device', value: deviceLabel },
       { label: 'Added On', value: longDateTime(boundAt) },
     ])}
     ${p("If this wasn't you, please visit your dashboard immediately to remove the device and secure your account.")}
     ${ctaButton('Review Devices', DASHBOARD_URL)}`
  )
  return sendEmail({ to, subject: 'New Device Added — BatchMyPhotos', html })
}

export function sendDeviceRemovedAlert({ to, deviceLabel, removedAt }: {
  to: string; deviceLabel: string; removedAt: string
}) {
  const html = wrapTemplate(
    'Device Removed', 'A device was removed from your account',
    `${p('A device has been removed from your BatchMyPhotos account:')}
     ${highlightCard([
       { label: 'Device', value: deviceLabel },
       { label: 'Removed On', value: longDateTime(removedAt) },
     ])}
     ${p('A <strong style="color: ' + COLORS.warning + ';">24-hour cooldown</strong> is now in effect before a new device can be added.')}
     ${p("If this wasn't you, please secure your account immediately.")}`
  )
  return sendEmail({ to, subject: 'Device Removed — BatchMyPhotos', html })
}

export function sendSubscriptionCancelled({ to }: { to: string }) {
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
  return sendEmail({ to, subject: 'Subscription Cancelled — BatchMyPhotos', html })
}

export function sendFreeTrialConfirmation({ to, trialEndAt }: { to: string; trialEndAt: string }) {
  const html = wrapTemplate(
    'Free Trial Activated', 'Your 30-day Pro trial is now active',
    `${p('Welcome to <strong style="color: #ffffff;">BatchMyPhotos Pro</strong>! Your free trial has been activated — no payment required.')}
     ${highlightCard([
       { label: 'Plan', value: 'Pro — Free Trial' },
       { label: 'Price', value: '₱0.00' },
       { label: 'Valid Until', value: longDate(trialEndAt) },
     ])}
     ${p('You now have access to <strong style="color: #ffffff;">unlimited batch operations</strong> and up to <strong style="color: #ffffff;">2 devices</strong> for the next 30 days. Enjoy!')}
     ${p("Don't have the app yet? Download it now from the Microsoft Store:")}
     ${ctaButton('Download BatchMyPhotos', 'https://apps.microsoft.com/detail/9N1KKMV4NX4J')}`
  )
  return sendEmail({ to, subject: 'Free Trial Activated — BatchMyPhotos Pro', html })
}
