'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTelegram } from '@/lib/telegram/provider'
import { CardSelector } from './card-selector'
import { ActiveGame } from './active-game'
import { GameCountdown } from './game-countdown'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, Trophy, Clock, Coins } from 'lucide-react'
import useSWR from 'swr'

const ENTRY_FEE = 10

interface GameState {
  id: string
  status: 'lobby' | 'countdown' | 'active' | 'completed'
  pot: number
  player_count: number
  lobby_ends_at: string | null
  game_starts_at: string | null
  last_draw_at: string | null
  draw_count: number
}

interface PlayerState {
  card_number: number
  numbers: number[]
  joined_at: string
  warnings: number
}

const fetcher = async (url: string, initData: string) => {
  const res = await fetch(url, {
    headers: { 'X-Telegram-Init-Data': initData },
  })
  if (!res.ok) throw new Error('Failed to fetch')
  return res.json()
}

export function GameLobby() {
  const { webApp, userData, refreshUserData, hapticFeedback } = useTelegram()
  const [selectedCard, setSelectedCard] = useState<number | null>(null)
  const [isJoining, setIsJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  // Fetch current game state
  const { data: gameData, error: gameError, mutate: mutateGame } = useSWR(
    webApp?.initData ? ['/api/game/state', webApp.initData] : null,
    ([url, initData]) => fetcher(url, initData),
    { refreshInterval: 1000 }
  )

  const game: GameState | null = gameData?.game || null
  const playerState: PlayerState | null = gameData?.player || null
  const takenCards: number[] = gameData?.takenCards || []
  const calledNumbers: number[] = gameData?.calledNumbers || []

  // Refresh user data when game completes
  useEffect(() => {
    if (game?.status === 'completed') {
      refreshUserData()
    }
  }, [game?.status, refreshUserData])

  const handleJoinGame = useCallback(async () => {
    if (!selectedCard || !webApp?.initData || !userData) return

    if (userData.balance < ENTRY_FEE) {
      setJoinError('Insufficient balance. Please deposit funds.')
      hapticFeedback('error')
      return
    }

    setIsJoining(true)
    setJoinError(null)

    try {
      const res = await fetch('/api/game/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': webApp.initData,
        },
        body: JSON.stringify({ cardNumber: selectedCard }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to join game')
      }

      hapticFeedback('success')
      await mutateGame()
      await refreshUserData()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to join game'
      setJoinError(message)
      hapticFeedback('error')
    } finally {
      setIsJoining(false)
    }
  }, [selectedCard, webApp, userData, hapticFeedback, mutateGame, refreshUserData])

  // If player is in an active game, show the game screen
  if (playerState && game && (game.status === 'active' || game.status === 'countdown')) {
    if (game.status === 'countdown') {
      return (
        <GameCountdown 
          game={game} 
          playerCard={playerState}
        />
      )
    }
    return (
      <ActiveGame 
        game={game} 
        playerCard={playerState}
        calledNumbers={calledNumbers}
        onGameEnd={() => {
          mutateGame()
          refreshUserData()
        }}
      />
    )
  }

  // Lobby view
  return (
    <div className="space-y-4">
      {/* Game Info Card */}
      <Card className="bg-gradient-to-br from-primary/20 to-accent/20 border-primary/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Trophy className="w-5 h-5 text-bingo-gold" />
            Current Game
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-card/50 rounded-lg p-3 text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs mb-1">
                <Users className="w-3 h-3" />
                Players
              </div>
              <p className="text-xl font-bold">{game?.player_count || 0}</p>
            </div>
            <div className="bg-card/50 rounded-lg p-3 text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground text-xs mb-1">
                <Coins className="w-3 h-3" />
                Prize Pool
              </div>
              <p className="text-xl font-bold text-bingo-gold">
                {((game?.pot || 0) * 0.9).toFixed(0)} Birr
              </p>
            </div>
          </div>

          {game?.lobby_ends_at && game.status === 'lobby' && (
            <div className="mt-3 flex items-center justify-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-accent" />
              <LobbyTimer endTime={game.lobby_ends_at} onEnd={() => mutateGame()} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Entry Fee Info */}
      <div className="bg-card rounded-lg p-3 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">Entry Fee</span>
        <span className="font-bold">{ENTRY_FEE} Birr</span>
      </div>

      {/* Card Selector */}
      {!playerState && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Select Your Card</CardTitle>
              <p className="text-xs text-muted-foreground">
                Choose a card number (1-400). Red cards are taken.
              </p>
            </CardHeader>
            <CardContent>
              <CardSelector
                selectedCard={selectedCard}
                onSelect={setSelectedCard}
                takenCards={takenCards}
              />
            </CardContent>
          </Card>

          {/* Join Button */}
          <div className="space-y-2">
            {joinError && (
              <p className="text-sm text-destructive text-center">{joinError}</p>
            )}
            <Button
              className="w-full h-12 text-lg font-bold bg-gradient-to-r from-primary to-accent hover:opacity-90"
              disabled={!selectedCard || isJoining || (userData?.balance || 0) < ENTRY_FEE}
              onClick={handleJoinGame}
            >
              {isJoining ? 'Joining...' : `Join Game (${ENTRY_FEE} Birr)`}
            </Button>
            {(userData?.balance || 0) < ENTRY_FEE && (
              <p className="text-xs text-center text-muted-foreground">
                You need at least {ENTRY_FEE} Birr to play
              </p>
            )}
          </div>
        </>
      )}

      {/* Already joined message */}
      {playerState && game?.status === 'lobby' && (
        <Card className="bg-bingo-green/10 border-bingo-green/30">
          <CardContent className="pt-4 text-center">
            <p className="font-semibold text-bingo-green">You&apos;re in!</p>
            <p className="text-sm text-muted-foreground">
              Card #{playerState.card_number} selected
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Waiting for the game to start...
            </p>
          </CardContent>
        </Card>
      )}

      {gameError && (
        <p className="text-sm text-destructive text-center">
          Failed to load game state. Please refresh.
        </p>
      )}
    </div>
  )
}

// Lobby countdown timer component
function LobbyTimer({ endTime, onEnd }: { endTime: string; onEnd: () => void }) {
  const [timeLeft, setTimeLeft] = useState(0)

  useEffect(() => {
    const calculateTimeLeft = () => {
      const end = new Date(endTime).getTime()
      const now = Date.now()
      return Math.max(0, Math.floor((end - now) / 1000))
    }

    setTimeLeft(calculateTimeLeft())

    const interval = setInterval(() => {
      const left = calculateTimeLeft()
      setTimeLeft(left)
      if (left <= 0) {
        clearInterval(interval)
        onEnd()
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [endTime, onEnd])

  const minutes = Math.floor(timeLeft / 60)
  const seconds = timeLeft % 60

  return (
    <span className="font-mono font-bold text-accent">
      {minutes}:{seconds.toString().padStart(2, '0')} until game starts
    </span>
  )
}
