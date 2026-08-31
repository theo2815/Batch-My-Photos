'use client'

import dynamic from 'next/dynamic'

// The simulator is ~4,900 lines of client-only code (rAF loop, sessionStorage,
// global CSS ported from the Electron app) — never server-render it.
const DemoPage = dynamic(() => import('@/views/DemoPage'), { ssr: false })

export default function Page() {
  return <DemoPage />
}
