"use client"

import { useState, useEffect } from "react"
import { useTelegram } from "@/lib/telegram/provider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Trophy, Users, Calendar, Hash, ChevronRight } from "lucide-react"
import { MainNav } from "@/components/main-nav"

interface GameHistory {
  id: string
  game_number: number
  status: string
  pot_amount: number
  winner_count: number
  total_players: number
  created_at: string
  user_won: boolean
  prize_won: number | null
  card_number: number
}

export default function HistoryPage() {
  const { user, isAuthenticated } = useTelegram()
  const [games, setGames] = useState<GameHistory[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isAuthenticated && user) {
      fetchHistory()
    }
  }, [isAuthenticated, user])

  const fetchHistory = async () => {
    try {
      const res = await fetch("/api/game/history")
      if (res.ok) {
        const data = await res.json()
        setGames(data.games || [])
      }
    } catch (error) {
      console.error("Failed to fetch history:", error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3">
        <h1 className="text-xl font-bold text-foreground">Game History</h1>
      </header>

      <div className="p-4 space-y-3">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))
        ) : games.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="py-12 text-center">
              <Trophy className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No games played yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Join a game to see your history here
              </p>
            </CardContent>
          </Card>
        ) : (
          games.map((game) => (
            <Card
              key={game.id}
              className={`bg-card border-border overflow-hidden ${
                game.user_won ? "ring-2 ring-primary" : ""
              }`}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center ${
                        game.user_won
                          ? "bg-primary/20 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {game.user_won ? (
                        <Trophy className="h-6 w-6" />
                      ) : (
                        <Hash className="h-6 w-6" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">
                          Game #{game.game_number}
                        </span>
                        {game.user_won && (
                          <Badge className="bg-primary text-primary-foreground text-xs">
                            Winner
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {game.total_players} players
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(game.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    {game.user_won && game.prize_won ? (
                      <div className="text-primary font-bold">
                        +{game.prize_won.toFixed(0)} Birr
                      </div>
                    ) : (
                      <div className="text-muted-foreground text-sm">
                        Card #{game.card_number}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">
                      Pot: {game.pot_amount} Birr
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <MainNav />
    </div>
  )
}
