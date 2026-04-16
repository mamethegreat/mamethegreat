'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Gamepad2, Users, Coins, Clock } from 'lucide-react'

interface GameMonitorProps {
  game: {
    id: string
    status: 'lobby' | 'countdown' | 'active' | 'completed'
    pot: number
    player_count: number
    draw_count: number
    lobby_ends_at: string | null
    game_starts_at: string | null
    created_at: string
  } | null
}

export function GameMonitor({ game }: GameMonitorProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'lobby':
        return 'bg-bingo-blue'
      case 'countdown':
        return 'bg-accent'
      case 'active':
        return 'bg-bingo-green'
      case 'completed':
        return 'bg-muted'
      default:
        return 'bg-muted'
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gamepad2 className="w-5 h-5" />
          Current Game
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!game ? (
          <div className="text-center py-4 text-muted-foreground">
            No active game
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge className={getStatusColor(game.status)}>
                {game.status.toUpperCase()}
              </Badge>
            </div>

            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-secondary rounded-lg p-3">
                <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs mb-1">
                  <Users className="w-3 h-3" />
                  Players
                </div>
                <p className="text-xl font-bold">{game.player_count}</p>
              </div>
              <div className="bg-secondary rounded-lg p-3">
                <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs mb-1">
                  <Coins className="w-3 h-3" />
                  Pot
                </div>
                <p className="text-xl font-bold text-bingo-gold">{game.pot}</p>
              </div>
              <div className="bg-secondary rounded-lg p-3">
                <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs mb-1">
                  <Clock className="w-3 h-3" />
                  Draws
                </div>
                <p className="text-xl font-bold">{game.draw_count}/75</p>
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              <p>Game ID: {game.id.slice(0, 8)}...</p>
              <p>Started: {new Date(game.created_at).toLocaleString()}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
