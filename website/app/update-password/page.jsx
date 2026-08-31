'use client'

import ProtectedRoute from '@/components/ProtectedRoute'
import UpdatePassword from '@/views/UpdatePassword'

export default function Page() {
  return (
    <ProtectedRoute>
      <UpdatePassword />
    </ProtectedRoute>
  )
}
