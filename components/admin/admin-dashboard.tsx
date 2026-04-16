'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DepositApproval } from './deposit-approval'
import { WithdrawalApproval } from './withdrawal-approval'
import { GameMonitor } from './game-monitor'
import { LoadingScreen } from '@/components/loading-screen'
import { 
  Users, 
  TrendingUp, 
  ArrowDownCircle, 
  ArrowUpCircle, 
  LogOut,
  Clock,
  RefreshCw
} from 'lucide-react'

export function AdminDashboard() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('deposits')
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [pendingDeposits, setPendingDeposits] = useState<any[]>([])
  const [pendingWithdrawals, setPendingWithdrawals] = useState<any[]>([])
  const [currentGame, setCurrentGame] = useState<any>(null)
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalDeposits: 0,
    totalWithdrawals: 0,
    houseEarnings: 0,
    pendingDepositsCount: 0,
    pendingWithdrawalsCount: 0,
  })

  const fetchData = async () => {
    const supabase = createClient()

    // Get pending deposits
    const { data: deposits } = await supabase
      .from('transactions')
      .select(`
        *,
        users(telegram_id, first_name, last_name, username)
      `)
      .eq('type', 'deposit')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })

    // Get pending withdrawals
    const { data: withdrawals } = await supabase
      .from('transactions')
      .select(`
        *,
        users(telegram_id, first_name, last_name, username, balance)
      `)
      .eq('type', 'withdrawal')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })

    // Get current game
    const { data: game } = await supabase
      .from('games')
      .select('*')
      .in('status', ['lobby', 'countdown', 'active'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Get stats
    const { count: totalUsers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })

    const { data: totalDepositsData } = await supabase
      .from('transactions')
      .select('amount')
      .eq('type', 'deposit')
      .eq('status', 'approved')

    const { data: totalWithdrawalsData } = await supabase
      .from('transactions')
      .select('amount')
      .eq('type', 'withdrawal')
      .eq('status', 'completed')

    const { data: houseEarningsData } = await supabase
      .from('games')
      .select('house_fee')
      .eq('status', 'completed')

    setPendingDeposits(deposits || [])
    setPendingWithdrawals(withdrawals || [])
    setCurrentGame(game)
    setStats({
      totalUsers: totalUsers || 0,
      totalDeposits: totalDepositsData?.reduce((sum, t) => sum + t.amount, 0) || 0,
      totalWithdrawals: totalWithdrawalsData?.reduce((sum, t) => sum + t.amount, 0) || 0,
      houseEarnings: houseEarningsData?.reduce((sum, g) => sum + (g.house_fee || 0), 0) || 0,
      pendingDepositsCount: deposits?.length || 0,
      pendingWithdrawalsCount: withdrawals?.length || 0,
    })
  }

  useEffect(() => {
    fetchData().then(() => setIsLoading(false))

    // Refresh data every 30 seconds
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await fetchData()
    setIsRefreshing(false)
  }

  const handleLogout = () => {
    localStorage.removeItem('bingo_admin_auth')
    localStorage.removeItem('bingo_admin_auth_time')
    router.push('/admin/login')
  }

  if (isLoading) {
    return <LoadingScreen />
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Bingo Admin</h1>
            <p className="text-xs text-muted-foreground">Dashboard</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="w-4 h-4" />
                Total Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stats.totalUsers}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ArrowDownCircle className="w-4 h-4 text-green-500" />
                Total Deposits
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-500">
                {stats.totalDeposits.toFixed(2)} Birr
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ArrowUpCircle className="w-4 h-4 text-red-500" />
                Total Withdrawals
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {stats.totalWithdrawals.toFixed(2)} Birr
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-yellow-500" />
                House Earnings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-yellow-500">
                {stats.houseEarnings.toFixed(2)} Birr
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Current Game Status */}
        <GameMonitor game={currentGame} />

        {/* Pending Approvals */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Pending Approvals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="deposits" className="flex items-center gap-2">
                  <ArrowDownCircle className="w-4 h-4" />
                  Deposits
                  {stats.pendingDepositsCount > 0 && (
                    <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs">
                      {stats.pendingDepositsCount}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="withdrawals" className="flex items-center gap-2">
                  <ArrowUpCircle className="w-4 h-4" />
                  Withdrawals
                  {stats.pendingWithdrawalsCount > 0 && (
                    <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs">
                      {stats.pendingWithdrawalsCount}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="deposits" className="mt-4">
                <DepositApproval deposits={pendingDeposits} onRefresh={handleRefresh} />
              </TabsContent>

              <TabsContent value="withdrawals" className="mt-4">
                <WithdrawalApproval withdrawals={pendingWithdrawals} onRefresh={handleRefresh} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
