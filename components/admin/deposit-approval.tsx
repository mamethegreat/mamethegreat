'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Check, X, Eye, User } from 'lucide-react'

interface Deposit {
  id: string
  amount: number
  telebirr_transaction_id: string
  sender_name: string
  screenshot_url: string
  created_at: string
  users: {
    telegram_id: number
    first_name: string
    last_name: string | null
    username: string | null
  }
}

interface DepositApprovalProps {
  deposits: Deposit[]
}

export function DepositApproval({ deposits }: DepositApprovalProps) {
  const router = useRouter()
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)

  const handleAction = async (depositId: string, action: 'approve' | 'reject') => {
    setProcessingId(depositId)

    try {
      const res = await fetch('/api/admin/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ depositId, action }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to process')
      }

      router.refresh()
    } catch (error) {
      console.error('Error processing deposit:', error)
      alert(error instanceof Error ? error.message : 'Failed to process')
    } finally {
      setProcessingId(null)
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (deposits.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No pending deposits
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {deposits.map((deposit) => (
        <Card key={deposit.id} className="bg-secondary/50">
          <CardContent className="py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">
                    {deposit.users.first_name} {deposit.users.last_name || ''}
                  </span>
                  {deposit.users.username && (
                    <span className="text-sm text-muted-foreground">
                      @{deposit.users.username}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Amount:</span>
                    <span className="ml-1 font-bold text-bingo-green">
                      {deposit.amount} Birr
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Txn ID:</span>
                    <span className="ml-1 font-mono text-xs">
                      {deposit.telebirr_transaction_id}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Sender:</span>
                    <span className="ml-1">{deposit.sender_name}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Time:</span>
                    <span className="ml-1">{formatDate(deposit.created_at)}</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedImage(deposit.screenshot_url)}
                >
                  <Eye className="w-4 h-4" />
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="bg-bingo-green hover:bg-bingo-green/90"
                  onClick={() => handleAction(deposit.id, 'approve')}
                  disabled={processingId === deposit.id}
                >
                  <Check className="w-4 h-4" />
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleAction(deposit.id, 'reject')}
                  disabled={processingId === deposit.id}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Screenshot Dialog */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Payment Screenshot</DialogTitle>
          </DialogHeader>
          {selectedImage && (
            <img
              src={selectedImage}
              alt="Payment screenshot"
              className="w-full rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
