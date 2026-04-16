'use client'

import { useTelegram } from '@/lib/telegram/provider'
import { MainNav } from '@/components/main-nav'
import { GameLobby } from '@/components/game/game-lobby'
import { LoadingScreen } from '@/components/loading-screen'
import { Wallet } from 'lucide-react'

export default function HomePage() {
  const { isLoading, isAuthenticated, userData, error } = useTelegram()

  if (isLoading) {
    return <LoadingScreen />
  }

  if (error && !isAuthenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center">
        <div className="bg-card rounded-xl p-6 max-w-sm w-full">
          <h1 className="text-xl font-bold mb-2">Bingo Mini App</h1>
          <p className="text-muted-foreground text-sm mb-4">
            Please open this app from Telegram to play.
          </p>
          <p className="text-xs text-destructive">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card/95 backdrop-blur border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-bold">Bingo</h1>
            <p className="text-xs text-muted-foreground">
              Welcome, {userData?.first_name || 'Player'}
            </p>
          </div>
          <div className="flex items-center gap-2 bg-secondary rounded-full px-3 py-1.5">
            <Wallet className="w-4 h-4 text-bingo-gold" />
            <span className="font-semibold text-sm">
              {userData?.balance?.toFixed(2) || '0.00'} Birr
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 p-4">
        <GameLobby />
      </div>

      {/* Bottom Navigation */}
      <MainNav />
    </main>
  )
}
