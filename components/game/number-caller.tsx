'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'

interface NumberCallerProps {
  calledNumbers: number[]
}

function getColumnForNumber(num: number): string {
  if (num >= 1 && num <= 15) return 'B'
  if (num >= 16 && num <= 30) return 'I'
  if (num >= 31 && num <= 45) return 'N'
  if (num >= 46 && num <= 60) return 'G'
  return 'O'
}

function getBallClass(column: string): string {
  switch (column) {
    case 'B': return 'ball-b'
    case 'I': return 'ball-i'
    case 'N': return 'ball-n'
    case 'G': return 'ball-g'
    case 'O': return 'ball-o'
    default: return ''
  }
}

export function NumberCaller({ calledNumbers }: NumberCallerProps) {
  const lastNumber = calledNumbers[calledNumbers.length - 1]
  const lastColumn = lastNumber ? getColumnForNumber(lastNumber) : null

  // Get last 5 numbers (excluding the current one)
  const recentNumbers = useMemo(() => {
    return calledNumbers.slice(-6, -1).reverse()
  }, [calledNumbers])

  return (
    <div className="space-y-3">
      {/* Current Number */}
      <div className="flex flex-col items-center">
        <p className="text-xs text-muted-foreground mb-2">Current Number</p>
        {lastNumber ? (
          <div className="flex items-center gap-2">
            <span className={cn(
              'text-2xl font-bold',
              lastColumn === 'B' && 'text-bingo-blue',
              lastColumn === 'I' && 'text-bingo-red',
              lastColumn === 'N' && 'text-accent',
              lastColumn === 'G' && 'text-bingo-green',
              lastColumn === 'O' && 'text-bingo-purple',
            )}>
              {lastColumn}
            </span>
            <div
              className={cn(
                'bingo-ball w-16 h-16 text-2xl text-white animate-bounce-in',
                getBallClass(lastColumn!)
              )}
            >
              {lastNumber}
            </div>
          </div>
        ) : (
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <span className="text-muted-foreground">--</span>
          </div>
        )}
      </div>

      {/* Recent Numbers */}
      <div className="bg-card rounded-lg p-3">
        <p className="text-xs text-muted-foreground text-center mb-2">Last 5 Numbers</p>
        <div className="flex justify-center gap-2">
          {recentNumbers.length > 0 ? (
            recentNumbers.map((num, idx) => {
              const col = getColumnForNumber(num)
              return (
                <div
                  key={num}
                  className={cn(
                    'bingo-ball w-10 h-10 text-sm text-white',
                    getBallClass(col),
                    idx === 0 && 'opacity-80',
                    idx === 1 && 'opacity-60',
                    idx === 2 && 'opacity-50',
                    idx === 3 && 'opacity-40',
                    idx === 4 && 'opacity-30',
                  )}
                >
                  {num}
                </div>
              )
            })
          ) : (
            <span className="text-sm text-muted-foreground">No numbers yet</span>
          )}
        </div>
      </div>

      {/* Called Numbers Count */}
      <div className="flex justify-center">
        <span className="text-xs text-muted-foreground">
          {calledNumbers.length} of 75 numbers called
        </span>
      </div>
    </div>
  )
}
