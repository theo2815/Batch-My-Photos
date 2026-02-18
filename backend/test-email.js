/**
 * Quick test — sends one of each email template to YOUR email.
 *
 * Usage:
 *   node test-email.js <your-email@example.com>
 *
 * Requires RESEND_API_KEY (and optionally EMAIL_FROM) in backend/.env
 */

require('dotenv').config()

const {
  sendPaymentConfirmation,
  sendSubscriptionExpiring,
  sendSubscriptionCancelled,
  sendNewDeviceAlert,
  sendDeviceRemovedAlert,
  sendMonthlyUsageSummary,
} = require('./services/emailService')

const to = process.argv[2]

if (!to) {
  console.error('Usage: node test-email.js <your-email@example.com>')
  process.exit(1)
}

if (!process.env.RESEND_API_KEY) {
  console.error('Missing RESEND_API_KEY in .env')
  process.exit(1)
}

async function runTests() {
  console.log(`\nSending test emails to: ${to}\n`)
  const delay = ms => new Promise(r => setTimeout(r, ms))

  console.log('1/5 — Payment Confirmation...')
  await sendPaymentConfirmation({
    to,
    amount: 24900,
    currency: 'PHP',
    plan: 'pro',
    expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
  })

  await delay(600)

  console.log('2/5 — Subscription Expiring...')
  await sendSubscriptionExpiring({
    to,
    expiresAt: new Date(Date.now() + 3 * 86400000).toISOString(),
  })

  await delay(600)

  console.log('3/5 — New Device Alert...')
  await sendNewDeviceAlert({
    to,
    deviceLabel: 'Theo\'s Windows PC',
    boundAt: new Date().toISOString(),
  })

  await delay(600)

  console.log('4/5 — Device Removed Alert...')
  await sendDeviceRemovedAlert({
    to,
    deviceLabel: 'Old Laptop',
    removedAt: new Date().toISOString(),
  })

  await delay(600)

  console.log('5/6 — Monthly Usage Summary...')
  await sendMonthlyUsageSummary({
    to,
    monthLabel: 'January 2026',
    batchesUsed: 47,
    plan: 'pro',
  })

  await delay(600)

  console.log('6/6 — Subscription Cancelled...')
  await sendSubscriptionCancelled({ to })

  console.log('\n\u2705 All 6 test emails sent! Check your inbox (and spam folder).\n')
}

runTests().catch(err => {
  console.error('Test failed:', err)
  process.exit(1)
})
