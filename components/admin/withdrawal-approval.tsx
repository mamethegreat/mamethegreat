'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Check, X, User, Phone, Copy } from 'lucide-react'

interface Withdrawal {
  id: string
  amount: number
  telebirr_number: string
  recipient_name: string
  created_at: string
  users: {
    telegram_id: number
    first_name: string
    last_name: string | null
    username: string | null
    balance: number
  }
}

interface WithdrawalApprovalProps {
  withdrawals: Withdrawal[]
  onRefresh?: () => void
}

export function WithdrawalApproval({ withdrawals, onRefresh }: WithdrawalApprovalProps) {
  const [processingId, setProcessingId] = useState<string | null>(null)

  const handleAction = async (withdrawalId: string, action: 'complete' | 'reject') => {
    setProcessingId(withdrawalId)

    try {
      const res = await fetch('/api/admin/withdrawals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ withdrawalId, action }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to process')
      }

      if (onRefresh) onRefresh()
    } catch (error) {
      console.error('Error processing withdrawal:', error)
      alert(error instanceof Error ? error.message : 'Failed to process')
    } finally {
      setProcessingId(null)
    }
  }

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (withdrawals.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No pending withdrawals
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {withdrawals.map((withdrawal) => (
        <Card key={withdrawal.id} className="bg-secondary/50">
          <CardContent className="py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">
                    {withdrawal.users.first_name} {withdrawal.users.last_name || ''}
                  </span>
                  {withdrawal.users.username && (
                    <span className="text-sm text-muted-foreground">
                      @{withdrawal.users.username}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Amount:</span>
                    <span className="ml-1 font-bold text-bingo-red">
                      {withdrawal.amount} Birr
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Phone className="w-3 h-3 text-muted-foreground" />
                    <span className="font-mono">{withdrawal.telebirr_number}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => copyToClipboard(withdrawal.telebirr_number)}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Name:</span>
                    <span className="ml-1">{withdrawal.recipient_name}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Time:</span>
                    <span className="ml-1">{formatDate(withdrawal.created_at)}</span>
                  </div>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  User balance: {withdrawal.users.balance.toFixed(2)} Birr
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  variant="default"
                  size="sm"
                  className="bg-bingo-green hover:bg-bingo-green/90"
                  onClick={() => handleAction(withdrawal.id, 'complete')}
                  disabled={processingId === withdrawal.id}
                >
                  <Check className="w-4 h-4 mr-1" />
                  Sent
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleAction(withdrawal.id, 'reject')}
                  disabled={processingId === withdrawal.id}
                >
                  <X className="w-4 h-4 mr-1" />
                  Reject
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
