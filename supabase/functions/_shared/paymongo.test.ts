// Run: npx deno@2.9.6 test --allow-env supabase/functions/_shared/paymongo.test.ts
// A fake Supabase client that keeps the rows it is given, so a replayed
// checkout sees the transaction the first call wrote.

import { rejects, strictEqual } from 'node:assert'
import { activateSubscription } from './paymongo.ts'

function fakeSupabase({ failTxInsert = false } = {}) {
  const calls: string[] = []
  const transactions: { paymongo_checkout_id: string }[] = []
  let subscription: { expires_at: string } | null = null
  const from = (table: string) => {
    let checkoutId = ''
    const rows = () => transactions.filter((t) => t.paymongo_checkout_id === checkoutId)
    const q = {
      select: () => q,
      eq: (column: string, value: string) => {
        if (column === 'paymongo_checkout_id') checkoutId = value
        return q
      },
      limit: async (n: number) => ({ data: rows().slice(0, n), error: null }),
      single: async () => {
        if (table === 'subscriptions') return { data: subscription, error: null }
        const found = rows()
        return found.length === 1 ? { data: found[0], error: null } : { data: null, error: { message: 'not one row' } }
      },
      upsert: async (row: { expires_at: string }) => {
        calls.push(`${table}.upsert`)
        subscription = { expires_at: row.expires_at }
        return { error: null }
      },
      insert: async (row: { paymongo_checkout_id: string }) => {
        calls.push(`${table}.insert`)
        if (table === 'transactions' && failTxInsert) return { error: { message: 'insert failed' } }
        if (table === 'transactions') transactions.push(row)
        return { error: null }
      },
    }
    return q
  }
  return { client: { from } as never, calls }
}

Deno.test('a replayed checkout does not grant Pro again', async () => {
  const db = fakeSupabase()
  const opts = { userId: 'user-1', checkoutId: 'cs_replayed', couponCode: null }

  const first = await activateSubscription(db.client, opts)
  const second = await activateSubscription(db.client, opts)

  strictEqual(db.calls.filter((c) => c === 'subscriptions.upsert').length, 1)
  strictEqual(first.txCreated, true)
  strictEqual(second.txCreated, false)
  strictEqual(second.expiresAt, first.expiresAt)
})

Deno.test('a failed transaction insert is an error, not a silent grant', async () => {
  const db = fakeSupabase({ failTxInsert: true })
  await rejects(activateSubscription(db.client, { userId: 'user-1', checkoutId: 'cs_lost', couponCode: null }))
})
