'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AdminDashboard } from '@/components/admin/admin-dashboard'
import { LoadingScreen } from '@/components/loading-screen'

export default function AdminPage() {
  const [isAuthed, setIsAuthed] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    // Check if admin is logged in
    const adminAuth = localStorage.getItem('bingo_admin_auth')
    const authTime = localStorage.getItem('bingo_admin_auth_time')
    
    if (adminAuth === 'true' && authTime) {
      // Check if session is less than 24 hours old
      const hoursSinceAuth = (Date.now() - parseInt(authTime)) / (1000 * 60 * 60)
      if (hoursSinceAuth < 24) {
        setIsAuthed(true)
      } else {
        // Session expired
        localStorage.removeItem('bingo_admin_auth')
        localStorage.removeItem('bingo_admin_auth_time')
        router.push('/admin/login')
      }
    } else {
      router.push('/admin/login')
    }
    
    setIsLoading(false)
  }, [router])

  if (isLoading) {
    return <LoadingScreen />
  }

  if (!isAuthed) {
    return <LoadingScreen />
  }

  return <AdminDashboard />
}
