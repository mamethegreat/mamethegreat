'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTelegram } from '@/lib/telegram/provider'
import { BingoCard } from './bingo-card'
import { NumberCaller } from './number-caller'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Trophy, AlertTriangle, Users, Coins } from 'lucide-react'
import useSWR from 'swr'

interface ActiveGameProps {
  game: {
    id: string
    status: string
    pot: number
    player_count: number
  }
  playerCard: {
    card_number: number
    numbers: number[]
    warnings: number
  }
  calledNumbers: number[]
  onGameEnd: () => void
}

const WINNING_PATTERNS = {
  horizontal: [
    [0, 1, 2, 3, 4],
    [5, 6, 7, 8, 9],
    [10, 11, 12, 13, 14],
    [15, 16, 17, 18, 19],
    [20, 21, 22, 23, 24],
  ],
  vertical: [
    [0, 5, 10, 15, 20],
    [1, 6, 11, 16, 21],
    [2, 7, 12, 17, 22],
    [3, 8, 13, 18, 23],
    [4, 9, 14, 19, 24],
  ],
  diagonal: [
    [0, 6, 12, 18, 24],
    [4, 8, 12, 16, 20],
  ],
}

export function ActiveGame({ game, playerCard, calledNumbers, onGameEnd }: ActiveGameProps) {
  const { webApp, hapticFeedback, refreshUserData } = useTelegram()
  const [isClaiming, setIsClaiming] = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)
  const [gameResult, setGameResult] = useState<{
    won: boolean
    prize?: number
    message: string
  } | null>(null)

  const calledSet = useMemo(() => new Set(calledNumbers), [calledNumbers])

  // Auto-mark: compute marked numbers from intersection of card and called
  const markedNumbers = useMemo(() => {
    return playerCard.numbers.filter(n => calledSet.has(n))
  }, [playerCard.numbers, calledSet])

  // Check for winning pattern
  const checkWinningPattern = useCallback(() => {
    const cardNumbers = playerCard.numbers
    const markedIndices = new Set<number>()
    
    // Mark the FREE space (index 12)
    markedIndices.add(12)
    
    // Find marked indices
    cardNumbers.forEach((num, idx) => {
      if (calledSet.has(num)) {
        markedIndices.add(idx)
      }
    })

    // Check all patterns
    for (const patterns of Object.values(WINNING_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.every(idx => markedIndices.has(idx))) {
          return pattern
        }
      }
    }
    return null
  }, [playerCard.numbers, calledSet])

  const winningPattern = useMemo(() => checkWinningPattern(), [checkWinningPattern])
  const canClaimBingo = winningPattern !== null

  // Poll for game result
  const { data: resultData } = useSWR(
    game.status === 'completed' ? `/api/game/${game.id}/result` : null,
    async (url) => {
      const res = await fetch(url, {
        headers: { 'X-Telegram-Init-Data': webApp?.initData || '' },
      })
      return res.json()
    }
  )

  useEffect(() => {
    if (resultData?.result) {
      setGameResult(resultData.result)
      refreshUserData()
    }
  }, [resultData, refreshUserData])

  // Haptic feedback for new numbers
  useEffect(() => {
    if (calledNumbers.length > 0) {
      const lastNumber = calledNumbers[calledNumbers.length - 1]
      if (playerCard.numbers.includes(lastNumber)) {
        hapticFeedback('success')
      } else {
        hapticFeedback('light')
      }
    }
  }, [calledNumbers.length, calledNumbers, playerCard.numbers, hapticFeedback])

  const handleClaimBingo = async () => {
    if (!webApp?.initData || !canClaimBingo) return

    setIsClaiming(true)
    setClaimError(null)

    try {
      const res = await fetch('/api/game/bingo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': webApp.initData,
        },
        body: JSON.stringify({ gameId: game.id }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to claim BINGO')
      }

      if (data.valid) {
        hapticFeedback('success')
        setGameResult({
          won: true,
          prize: data.prize,
          message: 'Congratulations! You won!',
        })
      } else {
        hapticFeedback('error')
        setClaimError(data.message || 'Invalid BINGO claim')
      }
    } catch (err) {
      hapticFeedback('error')
      const message = err instanceof Error ? err.message : 'Failed to claim'
      setClaimError(message)
    } finally {
      setIsClaiming(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Game Stats */}
      <div className="flex justify-around text-center">
        <div className="bg-card rounded-lg px-4 py-2">
          <div className="flex items-center gap-1 justify-center">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-lg font-bold">{game.player_count}</span>
          </div>
          <p className="text-xs text-muted-foreground">Players</p>
        </div>
        <div className="bg-card rounded-lg px-4 py-2">
          <div className="flex items-center gap-1 justify-center">
            <Coins className="w-4 h-4 text-bingo-gold" />
            <span className="text-lg font-bold text-bingo-gold">
              {(game.pot * 0.9).toFixed(0)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">Prize (Birr)</p>
        </div>
        <div className="bg-card rounded-lg px-4 py-2">
          <span className="text-lg font-bold">{calledNumbers.length}</span>
          <p className="text-xs text-muted-foreground">Numbers</p>
        </div>
      </div>

      {/* Number Caller */}
      <NumberCaller calledNumbers={calledNumbers} />

      {/* Bingo Card */}
      <Card>
        <CardContent className="pt-4">
          <div className="text-center mb-2">
            <span className="text-sm text-muted-foreground">Card #</span>
            <span className="font-bold ml-1">{playerCard.card_number}</span>
          </div>
          <BingoCard
            numbers={playerCard.numbers}
            markedNumbers={markedNumbers}
            calledNumbers={calledNumbers}
            winningCells={winningPattern || []}
          />
        </CardContent>
      </Card>

      {/* Warnings */}
      {playerCard.warnings > 0 && (
        <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 rounded-lg p-3">
          <AlertTriangle className="w-5 h-5 text-destructive" />
          <span className="text-sm">
            Warning {playerCard.warnings}/2 - Invalid claims will disqualify you
          </span>
        </div>
      )}

      {/* Claim Error */}
      {claimError && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-center">
          <p className="text-sm text-destructive">{claimError}</p>
        </div>
      )}

      {/* BINGO Button */}
      <Button
        className={`w-full h-14 text-xl font-bold ${
          canClaimBingo
            ? 'bg-gradient-to-r from-bingo-gold to-accent animate-pulse-gold'
            : 'bg-muted text-muted-foreground'
        }`}
        disabled={!canClaimBingo || isClaiming}
        onClick={handleClaimBingo}
      >
        {isClaiming ? 'Claiming...' : 'BINGO!'}
      </Button>

      {!canClaimBingo && (
        <p className="text-center text-xs text-muted-foreground">
          Complete a line (horizontal, vertical, or diagonal) to claim BINGO
        </p>
      )}

      {/* Game Result Dialog */}
      <AlertDialog open={gameResult !== null}>
        <AlertDialogContent className="bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 justify-center">
              {gameResult?.won ? (
                <>
                  <Trophy className="w-6 h-6 text-bingo-gold" />
                  <span className="text-bingo-gold">You Won!</span>
                </>
              ) : (
                <span>Game Over</span>
              )}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center">
              {gameResult?.won ? (
                <span className="text-2xl font-bold text-bingo-gold block mt-2">
                  +{gameResult.prize?.toFixed(2)} Birr
                </span>
              ) : (
                <span>{gameResult?.message}</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                setGameResult(null)
                onGameEnd()
              }}
              className="w-full"
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
