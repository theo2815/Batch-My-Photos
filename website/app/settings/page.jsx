'use client'

import ProtectedRoute from '@/components/ProtectedRoute'
import Settings from '@/views/Settings'

export default function Page() {
  return (
    <ProtectedRoute>
      <Settings />
    </ProtectedRoute>
  )
}
