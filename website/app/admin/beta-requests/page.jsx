'use client'

import AdminRoute from '@/components/AdminRoute'
import AdminBetaRequests from '@/views/AdminBetaRequests'

export default function Page() {
  return (
    <AdminRoute>
      <AdminBetaRequests />
    </AdminRoute>
  )
}
