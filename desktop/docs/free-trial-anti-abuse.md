# Free Trial Anti-Abuse Architecture (Microsoft Store Release)

## Core Problem

Currently, users can click "Start Free Trial" from the BatchMyPhotos website (`batchmyphotos.com`). Because web browsers enforce strict privacy sandboxes, the backend cannot securely read the user's physical hardware ID (HWID) from the website.

This creates a massive loophole: A single user can create infinite email accounts on the website, claim infinite 30-day trials, and bypass the paid Pro tier indefinitely.

## The Solution

To permanently close this loophole, the "Start Free Trial" action must be completely removed from the website and **forced exclusively through the downloaded Desktop Application**, which _can_ securely read the HWID.

Since the Desktop Application will be distributed exclusively via the Microsoft Store, this guarantees that a physical machine can mathematically only claim **one** 30-day trial across its entire lifetime, regardless of how many new email accounts the user creates.

---

## Technical Implementation Plan

To implement this architecture, three separate areas of the codebase must be updated:

### 1. Website Updates (Frontend)

The website must no longer offer a "Start Trial" API call. It should act merely as a funnel to the Microsoft Store.

**`website/src/pages/Dashboard.jsx`**
Leave the "Upgrade to Pro" buttons on the dashboard exactly as they are. When clicked, they simply open the `PricingModal.jsx` component.

**`website/src/components/PricingModal.jsx` (or wherever your modal is defined)**
Inside the pricing modal, dynamically switch the text and action of the primary button based on the user's trial history. Use `subscription.free_trial_used` from your `useSubscription` hook:

- **Condition A (Trial Not Yet Used):**
  - Trigger: `!subscription.free_trial_used`
  - Button Text: **"Download to Start Free Trial"**
  - Text below button: _"Requires Desktop App · No payment required"_
  - Action: Redirect user to the Microsoft Store URL (`ms-windows-store://pdp/?productid=<YOUR_APP_ID>`).

- **Condition B (Trial Already Used & Now Expired):**
  - Trigger: `subscription.free_trial_used === true` (and they are currently downgraded to the `'free'` plan).
  - Button Text: **"Upgrade to Pro"**
  - Text below button: _"₱299/mo · Cancel anytime"_ (or similar)
  - Action: Execute the standard `createCheckout` flow via PayMongo to purchase a paid subscription.

### 2. Desktop App Updates (Electron)

The Desktop App becomes the sole mechanism for activating a trial.

**`src/components/Header/ProfileDropdown.jsx`**

- If the user's `store.subscription.plan` is `'free'` and `store.subscription.free_trial_used` is `false`, render a visually distinct button: **✨ Start 30-Day Free Trial ✨**
- When clicked, this button should dispatch a new IPC call to the main process: `ipcRenderer.invoke('start-free-trial')`.

**`src/main/ipcHandlers.js` & `src/main/subscriptionService.js`**

- Create a new IPC handler for `start-free-trial`.
- This handler MUST retrieve the HWID from `deviceService.getHwid()`.
- It will then make an authenticated `POST` request to the backend `/api/start-free-trial`, explicitly including the `{ hwid }` in the JSON body.

### 3. Backend API Updates (Express)

The backend must outright mathematically reject any trial attempt that doesn't provide a secure Hardware ID.

**`backend/routes/paymongo.js`**
Update the `/start-free-trial` endpoint. Remove the `hwid || null` fallback and make it a hard requirement.

```javascript
router.post('/start-free-trial', authenticateUser, async (req, res) => {
  try {
    const user = req.user;
    const hwid = req.body.hwid;

    // 💥 CRITICAL SECURITY FIX: Never allow a trial without an HWID 💥
    if (!hwid || typeof hwid !== 'string' || hwid.length < 16) {
      return res.status(403).json({
        error: 'Free trials can only be activated from within the downloaded Desktop Application.'
      });
    }

    // ... (Existing code that checks 'trial_device_claims' table for the hwid)
```

---

## User Flow Summary

1. User visits `batchmyphotos.com`.
2. User clicks "Start Free Trial."
3. User is redirected to the Microsoft Store and downloads the App.
4. User opens the App and logs in (or creates an account).
5. User clicks "Start 30-Day Free Trial" from the Profile Menu inside the App.
6. The App silently attaches their Motherboard/CPU HWID and sends it to the backend.
7. The Backend verifies this HWID has never been used before, grants the trial, and permanently logs the HWID to prevent future abuse.
