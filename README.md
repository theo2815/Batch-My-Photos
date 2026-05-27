<div align="center">

<!-- Logo placeholder — replace with the BatchMyPhotos logo when ready -->
<p><em>Logo coming soon</em></p>

# BatchMyPhotos

**A Windows desktop utility that helps photographers cull blurry shots and split image folders into sized batches — in seconds, not hours.**

Part of the [QuickPitik](https://github.com/theo2815/Capstone-Project) marathon photography ecosystem.

</div>

---

## About

After a marathon, a single photographer often comes home with thousands of images. Sorting them, removing blurry shots, and grouping them into clean batches takes one to two hours of repetitive work per event.

BatchMyPhotos collapses that work into a few clicks. It uses AI blur detection to flag unusable shots, pairs JPG + RAW siblings automatically, and bin-packs your folder into evenly-sized batches ready for upload or archival.

It is a sibling product of **QuickPitik** — the marathon photography ecosystem the same team is building. QuickPitik covers the cloud, mobile, and marketplace side of the pipeline; BatchMyPhotos handles the photographer's desktop workflow before publishing.

---

## Key Features

- **AI blur detection** — flags blurry, out-of-focus, and motion-blurred shots before you upload (feature-flagged).
- **JPG + RAW pairing** — recognizes paired files by basename and keeps siblings together when batching.
- **Bin-packed batches** — First-Fit-Decreasing algorithm splits a folder into evenly-sized batches (50+ image formats supported).
- **Smart file operations** — detects same-drive moves vs cross-drive copies for the fastest possible execution.
- **Full undo with rollback history** — encrypted manifests of every operation; up to 20 history entries.
- **Resume after interruption** — if the app crashes or is closed mid-batch, the next launch offers to resume or discard.
- **Offline-friendly subscription** — Pro tier works offline with a 3-day grace period and clock-tampering protection.
- **Auto-update** — distributed via Microsoft Store and GitHub Releases.

---

## Tech Stack

| Layer            | Technology                                              |
|------------------|---------------------------------------------------------|
| Desktop shell    | Electron 28 · Node.js 20 · CommonJS main process        |
| Renderer (UI)    | React 18 · Vite · Lucide icons · custom hooks (no Redux) |
| Image handling   | Sharp · Exifr (EXIF parsing)                            |
| Storage          | electron-store + OS encryption (Windows DPAPI)          |
| Backend API      | Express on Railway · Supabase (Postgres + Auth) · Resend|
| Payments         | PayMongo                                                |
| Marketing site   | React 19 · Tailwind · Framer Motion · React Router v7   |
| Packaging        | electron-builder (NSIS + AppX)                          |

**Platform support:** Windows-only (NSIS installer + Microsoft Store AppX).

---

## Architecture

BatchMyPhotos is a three-tier application: a desktop client, a shared backend API, and a marketing/dashboard website served by the same backend.

```
/                   Electron desktop app (root)
├── main.js         Electron main process entry
├── preload.js      Context bridge — IPC API exposed to the renderer
├── src/main/       Main-process services (Node.js, CommonJS)
├── src/            React renderer (ESM, JSX)
├── backend/        Express API server — Supabase, PayMongo, Resend
└── website/        Marketing site + dashboard — Vite + React 19 + Tailwind
```

### Main-process services

- **batchEngine.js** — groups files by basename, then bin-packs with First-Fit-Decreasing.
- **batchExecutor.js** — executes moves/copies with concurrency limits and cross-drive detection.
- **authService.js** — JWT + refresh-token auth via deep links (`batchmyphotos://auth/callback`).
- **subscriptionService.js** — enforces batch limits (Free: 2/month, Pro: unlimited) with offline grace and monotonic clock-tampering detection.
- **rollbackManager.js** — persists encrypted operation manifests for full undo.
- **progressManager.js** — tracks progress with interrupt recovery.
- **deviceService.js** — hardware-ID binding via node-machine-id (Pro: 2 devices, Pro+: 5).
- **blurDetectionService.js** — AI blur detection via the shared `ai-api` service (feature-flagged).
- **securityManager.js** — path-whitelist validation; prevents directory traversal.

### Renderer

React 18 with hooks-based state management — no Redux. Each feature has a dedicated hook (`useBatchExecution`, `useBlurDetection`, `useFolderSelection`, `useRollback`, `useSettings`). All IPC calls flow through `window.electronAPI.*` defined in `preload.js`.

---

## Getting Started

### Prerequisites

- **Windows 10 or 11** (the app ships Windows-only)
- **Node.js 20+** and npm
- For backend/website development: a Supabase project, PayMongo test keys, and a Resend API key (all gitignored — contact the team for development credentials)

### Install

```powershell
git clone https://github.com/theo2815/Batch-My-Photos.git
cd Batch-My-Photos
npm install
npm install --prefix backend
npm install --prefix website
```

### Run (development)

```powershell
# Desktop app (Vite dev server + Electron)
npm start

# Backend API (Express on port 3100)
node backend/server.js

# Website (Vite dev server)
npm run dev --prefix website
```

### Build installers

```powershell
# NSIS installer + AppX (Microsoft Store) → /release
npm run dist

# AppX only
npm run dist:appx
```

### Tests

```powershell
npm test            # vitest single-run
npm run test:watch  # watch mode
```

---

## Distribution

- **Microsoft Store** — installable via the Store listing (auto-updating AppX package).
- **GitHub Releases** — NSIS installer with `electron-updater` for in-app auto-update.
- **Bundle ID:** `com.batchmyphotos.app`
- **Deep link protocol:** `batchmyphotos://`

---

## Documentation

Working notes, decisions, and per-feature context for this app live in the companion Obsidian vault at:

```
QuickPitik Vault/desktop/
```

The `CLAUDE.md` at the root of this repo holds the maintenance-mode rules and architecture overview for contributors.

---

## Relationship to QuickPitik

BatchMyPhotos is one of five products in the QuickPitik capstone ecosystem:

| Product             | Role                                                     | Repo                                                                   |
|---------------------|----------------------------------------------------------|------------------------------------------------------------------------|
| QuickPitik monorepo | Mobile, website, backend, ai-api                         | [theo2815/Capstone-Project](https://github.com/theo2815/Capstone-Project) |
| **BatchMyPhotos**   | Desktop blur culling + batch splitting (this repo)       | [theo2815/Batch-My-Photos](https://github.com/theo2815/Batch-My-Photos)    |

The desktop app is the **only** client that calls the shared `ai-api` directly — it uses a restricted API key with scopes `blur:read` and `jobs:read`. All other QuickPitik clients (web, mobile) go through the Spring Boot backend.

---

## Team

| Name                          | Role               |
|-------------------------------|--------------------|
| Chan, Theo Cedric             | Lead Developer     |
| Tapales, Christian Kyle       | Developer          |
| Ycoy, Dillan Marquin          | Developer          |
| Purez, Kristine Eunice        | Lead Documents     |
| Sy, Brye Kane L.              | Documents          |

**Adviser:** Joemarie C. Amparo

---

## Institution

Capstone project, **Cebu Institute of Technology – University (CIT-U)**, Cebu, Philippines.

---

## License

**Proprietary — All Rights Reserved.**

Copyright © 2026 QuickPitik Team. BatchMyPhotos and its source code are the proprietary property of the QuickPitik capstone team and Cebu Institute of Technology – University. No part of this project may be copied, modified, distributed, or used in any form without explicit written permission from the authors.
