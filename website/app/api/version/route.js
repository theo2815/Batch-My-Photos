// Desktop in-app update banner. Same path + response shape as the old Express
// GET /api/version (backend/server.js:158-165) so pre-migration desktop
// installs keep seeing update prompts after the domain moves to Vercel.
// NOTE: changing these env vars on Vercel requires a redeploy to take effect.

export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json({
    latestVersion: process.env.LATEST_APP_VERSION || '1.0.5',
    downloadUrl: process.env.APP_DOWNLOAD_URL || 'https://github.com/theo2815/Batch-My-Photos/releases/latest',
    releaseDate: process.env.APP_RELEASE_DATE || '',
    storeUrl: process.env.MS_STORE_URL || 'https://apps.microsoft.com/detail/9N1KKMV4NX4J',
  })
}
