import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AdminDashboard } from '@/components/admin/admin-dashboard'

export default async function AdminPage() {
  const supabase = await createClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/admin/login')
  }

  // Verify admin access
  const { data: admin } = await supabase
    .from('admins')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (!admin) {
    redirect('/admin/login')
  }

  // Get pending deposits
  const { data: pendingDeposits } = await supabase
    .from('transactions')
    .select(`
      *,
      users(telegram_id, first_name, last_name, username)
    `)
    .eq('type', 'deposit')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  // Get pending withdrawals
  const { data: pendingWithdrawals } = await supabase
    .from('transactions')
    .select(`
      *,
      users(telegram_id, first_name, last_name, username, balance)
    `)
    .eq('type', 'withdrawal')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  // Get current game
  const { data: currentGame } = await supabase
    .from('games')
    .select('*')
    .in('status', ['lobby', 'countdown', 'active'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // Get stats
  const { count: totalUsers } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })

  const { data: totalDeposits } = await supabase
    .from('transactions')
    .select('amount')
    .eq('type', 'deposit')
    .eq('status', 'approved')

  const { data: totalWithdrawals } = await supabase
    .from('transactions')
    .select('amount')
    .eq('type', 'withdrawal')
    .eq('status', 'completed')

  const { data: houseEarnings } = await supabase
    .from('games')
    .select('house_fee')
    .eq('status', 'completed')

  const stats = {
    totalUsers: totalUsers || 0,
    totalDeposits: totalDeposits?.reduce((sum, t) => sum + t.amount, 0) || 0,
    totalWithdrawals: totalWithdrawals?.reduce((sum, t) => sum + t.amount, 0) || 0,
    houseEarnings: houseEarnings?.reduce((sum, g) => sum + (g.house_fee || 0), 0) || 0,
    pendingDepositsCount: pendingDeposits?.length || 0,
    pendingWithdrawalsCount: pendingWithdrawals?.length || 0,
  }

  return (
    <AdminDashboard
      admin={admin}
      pendingDeposits={pendingDeposits || []}
      pendingWithdrawals={pendingWithdrawals || []}
      currentGame={currentGame}
      stats={stats}
    />
  )
}
