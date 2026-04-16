'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DepositApproval } from './deposit-approval'
import { WithdrawalApproval } from './withdrawal-approval'
import { GameMonitor } from './game-monitor'
import { 
  Users, 
  Wallet, 
  TrendingUp, 
  ArrowDownCircle, 
  ArrowUpCircle, 
  LogOut,
  Gamepad2,
  Clock
} from 'lucide-react'

interface AdminDashboardProps {
  admin: {
    id: string
    email: string
  }
  pendingDeposits: any[]
  pendingWithdrawals: any[]
  currentGame: any
  stats: {
    totalUsers: number
    totalDeposits: number
    totalWithdrawals: number
    houseEarnings: number
    pendingDepositsCount: number
    pendingWithdrawalsCount: number
  }
}

export function AdminDashboard({
  admin,
  pendingDeposits,
  pendingWithdrawals,
  currentGame,
  stats,
}: AdminDashboardProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('deposits')

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/admin/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card border-b border-border">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Bingo Admin</h1>
            <p className="text-xs text-muted-foreground">{admin.email}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
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
                <ArrowDownCircle className="w-4 h-4 text-bingo-green" />
                Total Deposits
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-bingo-green">
                {stats.totalDeposits.toFixed(2)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ArrowUpCircle className="w-4 h-4 text-bingo-red" />
                Total Withdrawals
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {stats.totalWithdrawals.toFixed(2)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-bingo-gold" />
                House Earnings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-bingo-gold">
                {stats.houseEarnings.toFixed(2)}
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
                <DepositApproval deposits={pendingDeposits} />
              </TabsContent>

              <TabsContent value="withdrawals" className="mt-4">
                <WithdrawalApproval withdrawals={pendingWithdrawals} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
