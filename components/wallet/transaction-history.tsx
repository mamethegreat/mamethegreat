'use client'

import { useTelegram } from '@/lib/telegram/provider'
import { Card, CardContent } from '@/components/ui/card'
import { ArrowDownCircle, ArrowUpCircle, Clock, CheckCircle, XCircle, Gamepad2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import useSWR from 'swr'

interface Transaction {
  id: string
  type: 'deposit' | 'withdrawal' | 'entry_fee' | 'prize' | 'refund'
  amount: number
  status: 'pending' | 'approved' | 'rejected' | 'completed'
  created_at: string
}

const fetcher = async (url: string, initData: string) => {
  const res = await fetch(url, {
    headers: { 'X-Telegram-Init-Data': initData },
  })
  if (!res.ok) throw new Error('Failed to fetch')
  return res.json()
}

export function TransactionHistory() {
  const { webApp } = useTelegram()

  const { data, error, isLoading } = useSWR(
    webApp?.initData ? ['/api/wallet/transactions', webApp.initData] : null,
    ([url, initData]) => fetcher(url, initData)
  )

  const transactions: Transaction[] = data?.transactions || []

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-sm text-muted-foreground">
          Failed to load transaction history
        </CardContent>
      </Card>
    )
  }

  if (transactions.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center text-sm text-muted-foreground">
          No transactions yet
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-2">
      {transactions.map((tx) => (
        <TransactionItem key={tx.id} transaction={tx} />
      ))}
    </div>
  )
}

function TransactionItem({ transaction }: { transaction: Transaction }) {
  const isPositive = ['deposit', 'prize', 'refund'].includes(transaction.type)
  const isPending = transaction.status === 'pending'
  const isRejected = transaction.status === 'rejected'

  const getIcon = () => {
    switch (transaction.type) {
      case 'deposit':
        return <ArrowDownCircle className="w-5 h-5 text-bingo-green" />
      case 'withdrawal':
        return <ArrowUpCircle className="w-5 h-5 text-bingo-red" />
      case 'entry_fee':
        return <Gamepad2 className="w-5 h-5 text-primary" />
      case 'prize':
        return <CheckCircle className="w-5 h-5 text-bingo-gold" />
      case 'refund':
        return <ArrowDownCircle className="w-5 h-5 text-bingo-blue" />
      default:
        return null
    }
  }

  const getStatusIcon = () => {
    switch (transaction.status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-accent" />
      case 'approved':
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-bingo-green" />
      case 'rejected':
        return <XCircle className="w-4 h-4 text-destructive" />
      default:
        return null
    }
  }

  const getLabel = () => {
    switch (transaction.type) {
      case 'deposit':
        return 'Deposit'
      case 'withdrawal':
        return 'Withdrawal'
      case 'entry_fee':
        return 'Game Entry'
      case 'prize':
        return 'Prize Won'
      case 'refund':
        return 'Refund'
      default:
        return transaction.type
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <Card className={cn(isPending && 'opacity-70', isRejected && 'opacity-50')}>
      <CardContent className="py-3 px-4">
        <div className="flex items-center gap-3">
          <div className="bg-secondary rounded-full p-2">
            {getIcon()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{getLabel()}</span>
              {getStatusIcon()}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatDate(transaction.created_at)}
            </p>
          </div>
          <div className="text-right">
            <span
              className={cn(
                'font-bold',
                isPositive ? 'text-bingo-green' : 'text-foreground',
                isRejected && 'line-through'
              )}
            >
              {isPositive ? '+' : '-'}{Math.abs(transaction.amount).toFixed(2)}
            </span>
            <p className="text-xs text-muted-foreground">Birr</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
