'use client'

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'

interface CardSelectorProps {
  selectedCard: number | null
  onSelect: (cardNumber: number) => void
  takenCards: number[]
}

const CARDS_PER_PAGE = 80
const TOTAL_CARDS = 400

export function CardSelector({ selectedCard, onSelect, takenCards }: CardSelectorProps) {
  const [page, setPage] = useState(0)
  const [searchValue, setSearchValue] = useState('')

  const takenSet = useMemo(() => new Set(takenCards), [takenCards])

  const totalPages = Math.ceil(TOTAL_CARDS / CARDS_PER_PAGE)
  const startCard = page * CARDS_PER_PAGE + 1
  const endCard = Math.min((page + 1) * CARDS_PER_PAGE, TOTAL_CARDS)

  const cards = useMemo(() => {
    const result = []
    for (let i = startCard; i <= endCard; i++) {
      result.push(i)
    }
    return result
  }, [startCard, endCard])

  const handleSearch = () => {
    const num = parseInt(searchValue)
    if (num >= 1 && num <= TOTAL_CARDS) {
      if (!takenSet.has(num)) {
        onSelect(num)
        // Jump to the page containing this card
        setPage(Math.floor((num - 1) / CARDS_PER_PAGE))
      }
      setSearchValue('')
    }
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="number"
            placeholder="Enter card number (1-400)"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="pl-9"
            min={1}
            max={400}
          />
        </div>
        <Button variant="secondary" onClick={handleSearch}>
          Go
        </Button>
      </div>

      {/* Selected card display */}
      {selectedCard && (
        <div className="bg-primary/10 border border-primary/30 rounded-lg p-2 text-center">
          <span className="text-sm text-muted-foreground">Selected: </span>
          <span className="font-bold text-primary">Card #{selectedCard}</span>
        </div>
      )}

      {/* Card grid */}
      <div className="card-grid">
        {cards.map((num) => {
          const isTaken = takenSet.has(num)
          const isSelected = selectedCard === num

          return (
            <button
              key={num}
              onClick={() => !isTaken && onSelect(num)}
              disabled={isTaken}
              className={cn(
                'aspect-square rounded text-xs font-medium transition-all',
                'flex items-center justify-center',
                isTaken && 'bg-destructive/20 text-destructive/50 cursor-not-allowed',
                isSelected && 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1 ring-offset-background',
                !isTaken && !isSelected && 'bg-secondary hover:bg-secondary/80 text-foreground'
              )}
            >
              {num}
            </button>
          )
        })}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Prev
        </Button>
        <span className="text-xs text-muted-foreground">
          {startCard}-{endCard} of {TOTAL_CARDS}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          disabled={page === totalPages - 1}
        >
          Next
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-secondary" />
          <span>Available</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-destructive/20" />
          <span>Taken</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-primary" />
          <span>Selected</span>
        </div>
      </div>
    </div>
  )
}
