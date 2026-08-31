# Manual Test Guide — Persistent Authentication & Session Migration

**Date:** February 21, 2026 (updated 2026-08-31 — Express backend retired; auth now goes directly to Supabase)
**Covers:** Refresh tokens, graceful fallback, offline resilience

> **2026-08-31:** token refresh is now `POST {SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`
> (GoTrue direct) and session verification is the `get_my_subscription` RPC. The legacy
> `exchange-session` migration was removed — pre-refresh-token sessions get a one-time re-login
> (Scenarios 4-5 below describe the OLD behavior and are retired).

---

## Prerequisites

1. **Supabase reachable** — the migrations in `supabase/migrations/` are applied (locally: `npx supabase start`; point the app at it with `BATCH_SUPABASE_URL` / `BATCH_SUPABASE_ANON_KEY`).
2. **App rebuilt** — Run `npm run build` in `desktop/` so the Electron app includes the latest `authService.js` changes.
3. **DevTools open** — In the running Electron app, press `Ctrl+Shift+I` to open DevTools → Console tab. All `[AUTH]` logs appear here.

---

## How to Read the Logs

Every auth event is prefixed with an emoji for quick scanning:

| Prefix | Meaning |
|--------|---------|
| `ℹ️ [AUTH]` | Informational (no action needed) |
| `🔍 [AUTH]` | Verification in progress |
| `🔄 [AUTH]` | Retry / migration / refresh attempt |
| `✅ [AUTH]` | Success |
| `⚠️ [AUTH]` | Warning (non-fatal) |
| `❌ [AUTH]` | Error |

---

## Test Scenarios

### Scenario 1: Fresh Login (New User / Post-Update)

**Goal:** Verify that a brand-new login stores both the access token AND refresh token.

**Steps:**
1. If already logged in, go to **Settings → Log Out** to clear the session.
2. Click **Sign in with Browser**.
3. Complete sign-in in the browser (Google OAuth or magic link).
4. The browser redirects to `batchmyphotos://auth/callback?token=...&refresh_token=...&email=...&name=...`.
5. The app should auto-detect the deep link and transition to the authenticated state.

**Expected Logs:**
```
ℹ️  [AUTH] Deep link received: batchmyphotos://auth/callback?token=...
✅ [AUTH] Session saved
✅ [AUTH] Refresh token saved
```

**Verify:**
- App shows the main dashboard (authenticated view).
- User name and email appear in Settings.
- No "Session refreshed" message — this is a clean login.

---

### Scenario 2: App Restart Within 1 Hour (JWT Still Valid)

**Goal:** Verify the app stays logged in across restarts when the JWT hasn't expired yet.

**Steps:**
1. Complete Scenario 1 (fresh login).
2. Close the app completely.
3. Reopen the app within 1 hour of login.

**Expected Logs:**
```
🔍 [AUTH] Verifying stored session...
✅ [AUTH] Session verified — user authenticated
```

**Verify:**
- App goes directly to the dashboard — no login screen.
- No migration or refresh logs.

---

### Scenario 3: JWT Expires → Silent Token Refresh

**Goal:** Verify that when the JWT expires (~1 hour), the refresh token kicks in and the user stays logged in without any interruption.

**Steps:**
1. Complete Scenario 1 (fresh login).
2. **Wait at least 1 hour** (or change the Supabase JWT expiry to a shorter duration for testing — see "Speeding Up Tests" below).
3. Restart the app.

**Expected Logs:**
```
🔍 [AUTH] Verifying stored session...
🔄 [AUTH] Retrying session verification after 401...
🔄 [AUTH] JWT expired — attempting silent token refresh...
✅ [AUTH] Token refreshed — re-verifying with new token...
✅ [AUTH] Session verified — user authenticated
```

**Verify:**
- App goes directly to the dashboard — **no login screen**.
- User remains logged in transparently.

**Alternative: Test with a batch operation**
1. Instead of restarting the app, wait for the JWT to expire and then run a batch.
2. `checkBatchLimit()` calls `verifySession()` → gets 401 → refreshes → succeeds.
3. Batch should execute normally.

---

### Scenario 4: Legacy Session Migration (Valid JWT, No Refresh Token)

**Goal:** Simulate a user who logged in BEFORE the refresh token update. The app should silently acquire a refresh token on startup.

**Steps:**
1. Complete Scenario 1 (fresh login) so you have a valid session.
2. **Manually delete the refresh token** to simulate a legacy session:
   - Open DevTools Console → Run:
     ```js
     // You'll need to do this from the main process.
     // Easiest method: add a temporary line in authService.js:
     //   store.delete('refresh_token')
     // Then restart the app.
     ```
   - **Or:** Find the encrypted auth store file and delete `refresh_token` from it.
   - **Simpler approach:** Open `src/main/authService.js`, temporarily add `store.delete('refresh_token')` at the top of `checkAuthStatus()`, rebuild, launch once, then remove the line and rebuild again.
3. Restart the app (with the refresh token deleted but access token still valid).

**Expected Logs:**
```
🔄 [AUTH] No refresh token stored — attempting legacy migration...
🔄 [AUTH] Migrating legacy session (acquiring refresh token)...
✅ [AUTH] Legacy session migrated — refresh token acquired
🔍 [AUTH] Verifying stored session...
✅ [AUTH] Session verified — user authenticated
```

**Verify:**
- App goes directly to the dashboard — **no login screen, no interruption**.
- The refresh token is now stored (future JWT expirations will use Scenario 3).

---

### Scenario 5: Legacy Session, JWT Already Expired (Graceful Fallback)

**Goal:** Simulate a user whose old JWT expired AND they have no refresh token. The app should auto-open the login page and show a friendly message.

**Steps:**
1. Complete Scenario 1 (fresh login).
2. Delete the refresh token (same method as Scenario 4).
3. **Wait for the JWT to expire** (1+ hour), OR manually invalidate it:
   - Go to Supabase Dashboard → Authentication → Users → Find your user → "Revoke all sessions".
   - This makes the stored JWT invalid immediately.
4. Restart the app.

**Expected Logs:**
```
🔄 [AUTH] No refresh token stored — attempting legacy migration...
🔄 [AUTH] Migrating legacy session (acquiring refresh token)...
⚠️ [AUTH] Session migration failed (401): ...
🔍 [AUTH] Verifying stored session...
🔄 [AUTH] Retrying session verification after 401...
⚠️ [AUTH] Session explicitly rejected: 401
⚠️ [AUTH] Stored session is invalid, clearing
🔄 [AUTH] Auto-opening login page for seamless re-authentication...
```

**Verify:**
- ✅ Login screen appears in the app.
- ✅ Browser opens automatically to the sign-in page.
- ✅ LoginScreen shows: **"Session refreshed — please sign in again"** (not the normal "Waiting for authentication...").
- ✅ Waiting spinner is visible.
- ✅ After completing sign-in in the browser, the app transitions to the dashboard.

---

### Scenario 6: Offline Startup (No Internet)

**Goal:** Verify the app doesn't crash or clear the session when there's no internet.

**Steps:**
1. Complete Scenario 1 (fresh login) and run at least one batch (to populate the offline cache).
2. Disconnect from the internet (Wi-Fi off or unplug ethernet).
3. Restart the app.

**Expected Logs:**
```
🔍 [AUTH] Verifying stored session...
⚠️ [AUTH] Backend unreachable — keeping local session (offline mode)
```

**Verify:**
- App shows the dashboard (not the login screen).
- "Offline mode" indicator may appear in the UI.
- Batch operations work using the cached subscription state.
- The app does NOT clear the session.

---

### Scenario 7: Explicit Logout Clears Everything

**Goal:** Verify that logging out clears both access and refresh tokens.

**Steps:**
1. Be logged in (any scenario).
2. Go to **Settings → Log Out**.
3. Confirm logout.

**Expected Logs:**
```
ℹ️ [AUTH] Session cleared
```

**Verify:**
- Login screen appears.
- No "Session refreshed" message (this is an intentional logout, not an expiration).
- Restarting the app shows the login screen (no auto-login).

---

### Scenario 8: Batch Execution After Token Refresh

**Goal:** Verify that batch operations work correctly after a token refresh.

**Steps:**
1. Log in (Scenario 1).
2. Wait for JWT to expire (1+ hour).
3. Without restarting the app, select a folder and run a batch.

**Expected Logs (during batch execution):**
```
🔄 [AUTH] JWT expired — attempting silent token refresh...
✅ [AUTH] Token refreshed — re-verifying with new token...
✅ Batch limit check passed
```

**Verify:**
- Batch executes successfully.
- No login screen interruption.
- Batch usage is tracked correctly on the server.

---

## Speeding Up Tests (Optional)

Waiting 1 hour for JWT expiry is tedious. Here are ways to speed it up:

### Option A: Shorter JWT Expiry in Supabase
1. Go to Supabase Dashboard → Settings → Auth.
2. Set **JWT expiry** to `300` (5 minutes) temporarily.
3. Run your tests — JWT expires in 5 minutes instead of 1 hour.
4. **Remember to set it back to 3600** after testing.

### Option B: Revoke Session in Supabase Dashboard
1. Go to Supabase Dashboard → Authentication → Users.
2. Click on your test user → **Revoke all sessions**.
3. This immediately invalidates the JWT without waiting.

### Option C: Tamper with Stored Token
1. In `authService.js`, temporarily replace the `getStoredSession()` return:
   ```js
   function getStoredSession() {
     return 'invalid-token-for-testing' // Simulates expired JWT
   }
   ```
2. Rebuild and launch to test the expired-JWT path.
3. **Remove the tamper code afterward.**

---

## Quick Reference: What Happens When

| Situation | What Fires | User Sees |
|-----------|-----------|-----------|
| Fresh login | Deep link → save both tokens | Dashboard |
| Restart < 1hr | `verifySession` → 200 OK | Dashboard |
| Restart > 1hr, has refresh token | `verifySession` → 401 → `refreshAccessToken` → new tokens | Dashboard (no interruption) |
| Restart > 1hr, NO refresh token (legacy pre-refresh session) | verify fails → refresh fails (no token) → `clearSession` → `openLoginPage` | One-time re-login via auto-opened browser |
| No internet | `verifySession` → network error → trust local cache | Dashboard (offline mode) |
| Explicit logout | `clearSession` → clear both tokens | Login screen |

---

## Checklist

Use this checklist to track your testing progress:

- [ ] **Scenario 1** — Fresh login stores access + refresh token
- [ ] **Scenario 2** — App restart within 1hr stays logged in
- [ ] **Scenario 3** — JWT expires → silent refresh → stays logged in
- [ ] **Scenario 4** — Legacy session → silent migration → refresh token acquired
- [ ] **Scenario 5** — Legacy + expired JWT → auto-opens login → friendly message
- [ ] **Scenario 6** — Offline startup → trusts cached session
- [ ] **Scenario 7** — Logout clears everything
- [ ] **Scenario 8** — Batch execution after token refresh works

---

## Troubleshooting

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| "No refresh token stored" on every startup | Legacy pre-refresh session | Log out → log back in (one-time; the deep link now always carries a refresh token) |
| Refresh returns 400/401 | Refresh token revoked or rotated away (GoTrue returns 400 `invalid_grant` for dead tokens) | Log out → log back in |
| Every RPC returns 401 | Wrong `BATCH_SUPABASE_ANON_KEY`, or the JWT expired and refresh also failed | Check config/env; re-login |
| App shows login screen unexpectedly | Check console for which `[AUTH]` log preceded it — tells you exactly what failed | Follow the log trail |
