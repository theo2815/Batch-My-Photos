'use client'

import { usePathname } from 'next/navigation'
import Navbar from '@/components/Navbar'

// Page shell: Navbar on every route except the full-screen /demo simulator.
export default function Chrome({ children }) {
  const pathname = usePathname()
  return (
    <div className="min-h-screen font-sans bg-bg-main text-text-primary">
      {pathname !== '/demo' && <Navbar />}
      {children}
    </div>
  )
}
