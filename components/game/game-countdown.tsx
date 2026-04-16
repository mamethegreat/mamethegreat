'use client'

import { useState, useEffect } from 'react'
import { BingoCard } from './bingo-card'
import { Card, CardContent } from '@/components/ui/card'

interface GameCountdownProps {
  game: {
    id: string
    status: string
    pot: number
    player_count: number
    game_starts_at: string | null
  }
  playerCard: {
    card_number: number
    numbers: number[]
  }
}

export function GameCountdown({ game, playerCard }: GameCountdownProps) {
  const [timeLeft, setTimeLeft] = useState(30)

  useEffect(() => {
    if (!game.game_starts_at) return

    const calculateTimeLeft = () => {
      const start = new Date(game.game_starts_at!).getTime()
      const now = Date.now()
      return Math.max(0, Math.ceil((start - now) / 1000))
    }

    setTimeLeft(calculateTimeLeft())

    const interval = setInterval(() => {
      setTimeLeft(calculateTimeLeft())
    }, 100)

    return () => clearInterval(interval)
  }, [game.game_starts_at])

  return (
    <div className="space-y-4">
      {/* Countdown Display */}
      <Card className="bg-gradient-to-br from-accent/20 to-primary/20 border-accent/30">
        <CardContent className="pt-6 pb-6 text-center">
          <p className="text-sm text-muted-foreground mb-2">Game starting in</p>
          <div className="text-6xl font-bold font-mono text-accent animate-pulse">
            {timeLeft}
          </div>
          <p className="text-sm text-muted-foreground mt-2">seconds</p>
        </CardContent>
      </Card>

      {/* Game Info */}
      <div className="flex justify-around text-center">
        <div>
          <p className="text-2xl font-bold">{game.player_count}</p>
          <p className="text-xs text-muted-foreground">Players</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-bingo-gold">
            {(game.pot * 0.9).toFixed(0)}
          </p>
          <p className="text-xs text-muted-foreground">Prize (Birr)</p>
        </div>
      </div>

      {/* Player Card Preview */}
      <Card>
        <CardContent className="pt-4">
          <div className="text-center mb-3">
            <p className="text-sm text-muted-foreground">Your Card</p>
            <p className="font-bold">#{playerCard.card_number}</p>
          </div>
          <BingoCard
            numbers={playerCard.numbers}
            markedNumbers={[]}
            calledNumbers={[]}
            winningCells={[]}
            disabled
          />
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        Get ready! Numbers will be auto-marked on your card.
      </p>
    </div>
  )
}
