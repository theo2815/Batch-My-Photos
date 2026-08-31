'use client'

import ProtectedRoute from '@/components/ProtectedRoute'
import BillingHistory from '@/views/BillingHistory'

export default function Page() {
  return (
    <ProtectedRoute>
      <BillingHistory />
    </ProtectedRoute>
  )
}
