'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Star } from 'lucide-react'

interface BingoCardProps {
  numbers: number[]
  markedNumbers: number[]
  calledNumbers: number[]
  winningCells?: number[]
  disabled?: boolean
  onNumberClick?: (number: number, index: number) => void
}

const COLUMNS = ['B', 'I', 'N', 'G', 'O']
const COLUMN_COLORS = {
  B: 'text-bingo-blue',
  I: 'text-bingo-red',
  N: 'text-accent',
  G: 'text-bingo-green',
  O: 'text-bingo-purple',
}

export function BingoCard({
  numbers,
  markedNumbers,
  calledNumbers,
  winningCells = [],
  disabled = false,
  onNumberClick,
}: BingoCardProps) {
  const calledSet = useMemo(() => new Set(calledNumbers), [calledNumbers])
  const markedSet = useMemo(() => new Set(markedNumbers), [markedNumbers])
  const winningSet = useMemo(() => new Set(winningCells), [winningCells])

  // Convert flat array to 5x5 grid (column-major order)
  const grid = useMemo(() => {
    const result: (number | 'FREE')[][] = []
    for (let col = 0; col < 5; col++) {
      const column: (number | 'FREE')[] = []
      for (let row = 0; row < 5; row++) {
        const index = col * 5 + row
        // Center cell (index 12 in a 25-cell grid) is FREE
        if (col === 2 && row === 2) {
          column.push('FREE')
        } else {
          column.push(numbers[index] || 0)
        }
      }
      result.push(column)
    }
    return result
  }, [numbers])

  return (
    <div className="w-full max-w-xs mx-auto">
      {/* Header row */}
      <div className="grid grid-cols-5 gap-1 mb-1">
        {COLUMNS.map((letter) => (
          <div
            key={letter}
            className={cn(
              'aspect-square flex items-center justify-center rounded-lg',
              'bg-secondary font-bold text-xl',
              COLUMN_COLORS[letter as keyof typeof COLUMN_COLORS]
            )}
          >
            {letter}
          </div>
        ))}
      </div>

      {/* Number grid */}
      <div className="grid grid-cols-5 gap-1">
        {Array.from({ length: 5 }).map((_, row) =>
          Array.from({ length: 5 }).map((_, col) => {
            const value = grid[col][row]
            const index = col * 5 + row
            const isFree = value === 'FREE'
            const num = isFree ? 0 : (value as number)
            const isCalled = isFree || calledSet.has(num)
            const isMarked = isFree || markedSet.has(num)
            const isWinning = winningSet.has(index)
            const isNew = !isFree && calledNumbers[calledNumbers.length - 1] === num

            return (
              <button
                key={`${row}-${col}`}
                onClick={() => !disabled && !isFree && onNumberClick?.(num, index)}
                disabled={disabled || isFree}
                className={cn(
                  'bingo-cell',
                  'bg-card border border-border',
                  isFree && 'free',
                  isMarked && isCalled && !isFree && 'marked',
                  isWinning && 'winning',
                  isNew && 'animate-number-called',
                  !disabled && isCalled && !isMarked && !isFree && 'ring-2 ring-accent/50'
                )}
              >
                {isFree ? (
                  <Star className="w-5 h-5" />
                ) : (
                  <span className={cn(isMarked && isCalled && 'text-primary-foreground')}>
                    {num}
                  </span>
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
