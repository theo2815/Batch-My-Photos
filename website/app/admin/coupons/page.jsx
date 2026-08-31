'use client'

import AdminRoute from '@/components/AdminRoute'
import AdminCoupons from '@/views/AdminCoupons'

export default function Page() {
  return (
    <AdminRoute>
      <AdminCoupons />
    </AdminRoute>
  )
}
