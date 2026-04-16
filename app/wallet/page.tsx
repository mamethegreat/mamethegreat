'use client'

import { useState } from 'react'
import { useTelegram } from '@/lib/telegram/provider'
import { MainNav } from '@/components/main-nav'
import { DepositForm } from '@/components/wallet/deposit-form'
import { WithdrawForm } from '@/components/wallet/withdraw-form'
import { TransactionHistory } from '@/components/wallet/transaction-history'
import { LoadingScreen } from '@/components/loading-screen'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Wallet, ArrowDownCircle, ArrowUpCircle, History } from 'lucide-react'

export default function WalletPage() {
  const { isLoading, isAuthenticated, userData, error } = useTelegram()
  const [activeTab, setActiveTab] = useState('deposit')

  if (isLoading) {
    return <LoadingScreen />
  }

  if (error && !isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center">
        <div className="bg-card rounded-xl p-6 max-w-sm w-full">
          <p className="text-muted-foreground text-sm">
            Please open this app from Telegram.
          </p>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen flex flex-col pb-16">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card/95 backdrop-blur border-b border-border">
        <div className="px-4 py-3">
          <h1 className="text-lg font-bold">Wallet</h1>
        </div>
      </header>

      <div className="flex-1 p-4 space-y-4">
        {/* Balance Card */}
        <Card className="bg-gradient-to-br from-primary/20 to-accent/20 border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Wallet className="w-4 h-4" />
              Your Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold text-bingo-gold">
              {userData?.balance?.toFixed(2) || '0.00'}
              <span className="text-lg text-muted-foreground ml-2">Birr</span>
            </p>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="deposit" className="flex items-center gap-1">
              <ArrowDownCircle className="w-4 h-4" />
              <span className="hidden sm:inline">Deposit</span>
            </TabsTrigger>
            <TabsTrigger value="withdraw" className="flex items-center gap-1">
              <ArrowUpCircle className="w-4 h-4" />
              <span className="hidden sm:inline">Withdraw</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-1">
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">History</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="deposit" className="mt-4">
            <DepositForm />
          </TabsContent>

          <TabsContent value="withdraw" className="mt-4">
            <WithdrawForm balance={userData?.balance || 0} />
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <TransactionHistory />
          </TabsContent>
        </Tabs>
      </div>

      <MainNav />
    </main>
  )
}
