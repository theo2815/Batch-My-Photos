# BatchMyPhotos Website

Marketing site + account dashboard. Next.js 15 (App Router) + React 19 + Tailwind v4, deployed on Vercel. Data layer is Supabase (auth, RPCs, Edge Functions) — see `.env.example` for the full deployment environment reference.

```powershell
npm install
npm run dev     # Next dev server on :3000
npm run build   # production build
npm run lint    # eslint (tracked baseline; build does not gate on it)
```

Route wrappers live in `app/`; the page components they render live in `src/views/` (named `views` because Next reserves `src/pages/` for the legacy Pages Router). The `/demo` simulator is client-only (`ssr: false`).
