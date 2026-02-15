# Phase 1: Website Payment System - Implementation Complete! 🎉

## Summary
Phase 1 has been successfully implemented. All code changes are complete and ready for testing.

## ✅ What's Been Completed

### 1. Pricing Updates
- **Backend** (`backend/routes/paymongo.js`):
  - Updated from ₱500 → ₱249 in all endpoints
  - Changed free tier from 10 → 5 batches
  - Updated checkout, verify-payment, and webhook handlers

- **Website**:
  - `PricingModal.jsx`: Updated pricing display and added "(Coming Soon)" to blur detection
  - `Dashboard.jsx`: Updated plan card and billing displays

### 2. Batch Usage Tracking System
- **Database Migration** created at:
  - `backend/migrations/001_batch_usage_tracking.sql`
  - Creates `batch_usage` table with RLS policies
  - Adds performance indexes
  - Includes helper function for monthly usage calculation

- **Backend API**:
  - `GET /api/subscription`: Now returns REAL usage data (not hardcoded 0)
  - `POST /api/check-batch-limit`: Pre-flight check for batch execution
  - `POST /api/track-batch`: Records batch executions after completion

### 3. Subscription Expiry Notifications
- Added to `Dashboard.jsx`:
  - Shows warning for 7 days after subscription expires
  - Displays days since expiration
  - Prompts user to renew

---

## 🚀 Next Steps (TESTING REQUIRED BEFORE PHASE 2)

### Step 1: Run Database Migration

1. Open Supabase Dashboard: https://app.supabase.com/project/YOUR_PROJECT/sql
2. Copy and paste the contents of `backend/migrations/001_batch_usage_tracking.sql`
3. Click "Run"
4. Verify success

#### Verification Queries:
```sql
-- Check if table was created
SELECT * FROM batch_usage LIMIT 1;

-- Check if function exists
SELECT get_monthly_usage('YOUR_USER_ID_HERE');
```

### Step 2: Deploy Backend Changes

```bash
cd backend
# Restart backend server to pick up changes
npm start
```

### Step 3: Deploy Website Changes

```bash
cd website
npm run build
# Deploy to your hosting (Vercel/Netlify/etc)
```

---

## 🧪 Testing Checklist

**⚠️ CRITICAL: Complete ALL tests before proceeding to Phase 2**

### Website Display Tests
- [ ] Landing page loads correctly
- [ ] PricingModal shows "₱249/mo" and "5 batches/month"
- [ ] PricingModal shows "Blur detection (Coming Soon)"
- [ ] Dashboard displays correct pricing

### Subscription API Tests
- [ ] `GET /api/subscription` returns correct usage (not hardcoded 0)
- [ ] Free user shows `{used: 0, limit: 5}`
- [ ] Pro user shows `{used: X, limit: Infinity}`

### Payment Flow Tests
1. **New User Signup & Upgrade**
   - [ ] Create new account
   - [ ] See free tier (5 batches)
   - [ ] Click "Upgrade to Pro"
   - [ ] Complete ₱249 payment via QRPh
   - [ ] Verify subscription activates
   - [ ] Check dashboard shows "Pro — ₱249/mo"

2. **Free Tier Limit Enforcement** (requires desktop app or manual API calls)
   - [ ] Create test free user
   - [ ] Manually insert 5 batch records:
   ```sql
   INSERT INTO batch_usage (user_id, batch_count, month_year, executed_at)
   VALUES ('YOUR_TEST_USER_ID', 1, TO_CHAR(NOW(), 'YYYY-MM'), NOW());
   ```
   - [ ] Call `POST /api/check-batch-limit` → should return `can_execute: false`
   - [ ] Verify `GET /api/subscription` shows `{used: 5, limit: 5}`

3. **Pro Tier Unlimited**
   - [ ] Upgrade test user to Pro
   - [ ] Insert 20+ batch records
   - [ ] Verify `POST /api/check-batch-limit` returns `can_execute: true`
   - [ ] Verify dashboard shows "Unlimited" batches

4. **Subscription Expiry**
   - [ ] Manually set `expires_at` to 2 days ago in subscriptions table:
   ```sql
   UPDATE subscriptions
   SET expires_at = NOW() - INTERVAL '2 days'
   WHERE user_id = 'YOUR_TEST_USER_ID';
   ```
   - [ ] Reload dashboard
   - [ ] Verify expiry warning appears
   - [ ] Verify status shows "expired"
   - [ ] Verify falls back to free tier (5 batches)

5. **Monthly Reset**
   - [ ] Insert batch records with last month's `month_year`:
   ```sql
   INSERT INTO batch_usage (user_id, batch_count, month_year, executed_at)
   VALUES ('YOUR_USER_ID', 3, '2026-01', '2026-01-15');
   ```
   - [ ] Verify `GET /api/subscription` shows 0 usage this month
   - [ ] Insert batch record for current month
   - [ ] Verify usage increases correctly

6. **Renewal Flow**
   - [ ] Test expired user clicking "Renew Now"
   - [ ] Complete ₱249 payment
   - [ ] Verify `expires_at` extends by 30 days
   - [ ] Verify status changes to "active"

### Edge Cases
- [ ] User cancels payment → stays on free tier
- [ ] Webhook fails but manual verification works
- [ ] Concurrent subscription requests (shouldn't create duplicates)

---

## 📊 Testing with Postman/Thunder Client

### Test GET /api/subscription
```javascript
GET http://localhost:3000/api/subscription
Authorization: Bearer YOUR_SUPABASE_JWT_TOKEN

// Expected Response:
{
  "plan": "free",
  "status": "active",
  "usage": {
    "used": 0,
    "limit": 5
  }
}
```

### Test POST /api/check-batch-limit
```javascript
POST http://localhost:3000/api/check-batch-limit
Authorization: Bearer YOUR_SUPABASE_JWT_TOKEN

// Expected Response:
{
  "can_execute": true,
  "is_pro": false,
  "usage": {
    "used": 0,
    "limit": 5,
    "remaining": 5
  },
  "subscription_expired": false,
  "needs_renewal": false
}
```

### Test POST /api/track-batch
```javascript
POST http://localhost:3000/api/track-batch
Authorization: Bearer YOUR_SUPABASE_JWT_TOKEN
Content-Type: application/json

{
  "batch_count": 1
}

// Expected Response:
{
  "success": true,
  "usage": {
    "used": 1,
    "limit": 5,
    "remaining": 4
  }
}
```

---

## ⚠️ Before Proceeding to Phase 2

### Phase 1 Success Criteria (ALL must pass):
- ✅ Pricing displays correctly everywhere (₱249, 5 batches)
- ✅ Database migration ran successfully
- ✅ GET /api/subscription returns REAL usage (not 0)
- ✅ POST /api/track-batch records batch executions
- ✅ POST /api/check-batch-limit enforces limits correctly
- ✅ Free users blocked after 5 batches
- ✅ Pro users have unlimited batches
- ✅ Monthly reset works (usage resets on calendar month)
- ✅ Subscription expiry detected and notification shows
- ✅ Expired subscriptions fall back to free tier
- ✅ Renewal flow works (re-payment adds 30 days)
- ✅ PayMongo webhook updates subscription correctly
- ✅ No payment failures or edge cases

**🔴 DO NOT PROCEED TO PHASE 2 UNTIL ALL TESTS PASS**

Phase 2 involves significant desktop app changes (authentication, batch limits). If Phase 1 isn't stable, users will encounter problems and we'll need to rollback.

---

## 🐛 Common Issues & Solutions

### Issue: `batch_usage` table doesn't exist
**Solution**: Run the migration SQL in Supabase Dashboard

### Issue: Usage always shows 0
**Solution**:
1. Check if `batch_usage` table has RLS enabled
2. Verify backend is using `supabaseAdmin` client (not regular client)
3. Check if records are being inserted with correct `month_year` format

### Issue: Subscription status not updating
**Solution**:
1. Check PayMongo webhook is configured: https://dashboard.paymongo.com/developers/webhooks
2. Verify webhook secret matches `.env`
3. Test with `/api/verify-payment` endpoint as fallback

### Issue: Free tier not enforcing limits
**Solution**:
1. Verify `POST /api/check-batch-limit` is being called
2. Check subscription status is correct
3. Ensure usage records have correct `month_year` format

---

## 📁 Files Changed

### Backend
- `backend/routes/paymongo.js` - 7 pricing updates + 3 new features
- `backend/migrations/001_batch_usage_tracking.sql` - NEW

### Website
- `website/src/components/PricingModal.jsx` - 4 pricing updates
- `website/src/pages/Dashboard.jsx` - 3 pricing updates + expiry notifications

---

## 🎯 Phase 2 Preview

Once Phase 1 testing is complete and stable, Phase 2 will add:
- Desktop app authentication (login/logout)
- Batch limit enforcement in desktop app
- Profile dropdown with "View Profile" and "Upgrade to Pro"
- Blur detection disabled with "Coming Soon" messaging
- Update notification system

But ONLY after Phase 1 is production-ready!

---

## 🤝 Need Help?

If you encounter any issues during testing:
1. Check the browser console for errors
2. Check backend logs for API errors
3. Verify database migration ran correctly
4. Test with Postman/Thunder Client to isolate frontend vs backend issues
5. Reach out if you're stuck - I can help debug!

Good luck with testing! 🚀
