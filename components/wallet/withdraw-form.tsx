'use client'

import { useState } from 'react'
import { useTelegram } from '@/lib/telegram/provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { FieldGroup, Field, FieldLabel } from '@/components/ui/field'
import { CheckCircle, AlertCircle } from 'lucide-react'

const MIN_WITHDRAWAL = 50

interface WithdrawFormProps {
  balance: number
}

export function WithdrawForm({ balance }: WithdrawFormProps) {
  const { webApp, refreshUserData, hapticFeedback } = useTelegram()
  const [amount, setAmount] = useState('')
  const [telebirrNumber, setTelebirrNumber] = useState('')
  const [accountName, setAccountName] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!webApp?.initData) return

    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum < MIN_WITHDRAWAL) {
      setError(`Minimum withdrawal is ${MIN_WITHDRAWAL} Birr`)
      return
    }

    if (amountNum > balance) {
      setError('Insufficient balance')
      return
    }

    if (!telebirrNumber.trim() || telebirrNumber.length < 10) {
      setError('Please enter a valid Telebirr number')
      return
    }

    if (!accountName.trim()) {
      setError('Please enter your account name')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/wallet/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': webApp.initData,
        },
        body: JSON.stringify({
          amount: amountNum,
          telebirrNumber: telebirrNumber.trim(),
          accountName: accountName.trim(),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit withdrawal')
      }

      hapticFeedback('success')
      setSuccess(true)
      setAmount('')
      setTelebirrNumber('')
      setAccountName('')
      await refreshUserData()
      
      setTimeout(() => setSuccess(false), 5000)
    } catch (err) {
      hapticFeedback('error')
      setError(err instanceof Error ? err.message : 'Failed to submit withdrawal')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (success) {
    return (
      <Card className="bg-bingo-green/10 border-bingo-green/30">
        <CardContent className="pt-6 text-center">
          <CheckCircle className="w-12 h-12 text-bingo-green mx-auto mb-4" />
          <h3 className="font-bold text-lg mb-2">Withdrawal Requested</h3>
          <p className="text-sm text-muted-foreground">
            Your withdrawal request is being processed. Funds will be sent to your Telebirr account shortly.
          </p>
        </CardContent>
      </Card>
    )
  }

  const canWithdraw = balance >= MIN_WITHDRAWAL

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Withdraw to Telebirr</CardTitle>
          <CardDescription>
            Minimum withdrawal: {MIN_WITHDRAWAL} Birr
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!canWithdraw ? (
            <div className="text-center py-4">
              <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                You need at least {MIN_WITHDRAWAL} Birr to withdraw.
              </p>
              <p className="text-sm text-muted-foreground">
                Current balance: {balance.toFixed(2)} Birr
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <FieldGroup>
                <Field>
                  <FieldLabel>Amount (Birr)</FieldLabel>
                  <Input
                    type="number"
                    placeholder={`Min ${MIN_WITHDRAWAL}, Max ${balance.toFixed(2)}`}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    min={MIN_WITHDRAWAL}
                    max={balance}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Available: {balance.toFixed(2)} Birr
                  </p>
                </Field>

                <Field>
                  <FieldLabel>Telebirr Number</FieldLabel>
                  <Input
                    type="tel"
                    placeholder="09XXXXXXXX"
                    value={telebirrNumber}
                    onChange={(e) => setTelebirrNumber(e.target.value)}
                    maxLength={13}
                  />
                </Field>

                <Field>
                  <FieldLabel>Account Name</FieldLabel>
                  <Input
                    type="text"
                    placeholder="Name on Telebirr account"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                  />
                </Field>
              </FieldGroup>

              {error && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting || !canWithdraw}
              >
                {isSubmitting ? 'Processing...' : 'Request Withdrawal'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        Withdrawals are processed manually and typically complete within 1-24 hours.
      </p>
    </div>
  )
}
