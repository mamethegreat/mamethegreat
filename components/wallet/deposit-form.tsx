'use client'

import { useState, useRef } from 'react'
import { useTelegram } from '@/lib/telegram/provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { FieldGroup, Field, FieldLabel } from '@/components/ui/field'
import { Copy, Upload, CheckCircle, Phone, AlertCircle } from 'lucide-react'

const TELEBIRR_NUMBER = '0948929715'
const MIN_DEPOSIT = 10

export function DepositForm() {
  const { webApp, refreshUserData, hapticFeedback } = useTelegram()
  const [amount, setAmount] = useState('')
  const [transactionId, setTransactionId] = useState('')
  const [senderName, setSenderName] = useState('')
  const [screenshot, setScreenshot] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(TELEBIRR_NUMBER)
    hapticFeedback('success')
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError('File size must be less than 5MB')
        return
      }
      setScreenshot(file)
      setError(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!webApp?.initData) return

    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum < MIN_DEPOSIT) {
      setError(`Minimum deposit is ${MIN_DEPOSIT} Birr`)
      return
    }

    if (!transactionId.trim()) {
      setError('Please enter the transaction ID')
      return
    }

    if (!senderName.trim()) {
      setError('Please enter your Telebirr name')
      return
    }

    if (!screenshot) {
      setError('Please upload a screenshot')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      // Upload screenshot first
      const formData = new FormData()
      formData.append('file', screenshot)

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'X-Telegram-Init-Data': webApp.initData,
        },
        body: formData,
      })

      if (!uploadRes.ok) {
        throw new Error('Failed to upload screenshot')
      }

      const { url: screenshotUrl } = await uploadRes.json()

      // Submit deposit request
      const res = await fetch('/api/wallet/deposit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': webApp.initData,
        },
        body: JSON.stringify({
          amount: amountNum,
          transactionId: transactionId.trim(),
          senderName: senderName.trim(),
          screenshotUrl,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit deposit')
      }

      hapticFeedback('success')
      setSuccess(true)
      setAmount('')
      setTransactionId('')
      setSenderName('')
      setScreenshot(null)
      
      // Reset success after 5 seconds
      setTimeout(() => setSuccess(false), 5000)
    } catch (err) {
      hapticFeedback('error')
      setError(err instanceof Error ? err.message : 'Failed to submit deposit')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (success) {
    return (
      <Card className="bg-bingo-green/10 border-bingo-green/30">
        <CardContent className="pt-6 text-center">
          <CheckCircle className="w-12 h-12 text-bingo-green mx-auto mb-4" />
          <h3 className="font-bold text-lg mb-2">Deposit Submitted</h3>
          <p className="text-sm text-muted-foreground">
            Your deposit request is being reviewed. Funds will be added to your account within 10 minutes.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Telebirr Info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Phone className="w-4 h-4 text-primary" />
            Send to Telebirr
          </CardTitle>
          <CardDescription>
            Send your deposit to this number, then upload proof
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between bg-secondary rounded-lg p-3">
            <span className="font-mono text-lg font-bold">{TELEBIRR_NUMBER}</span>
            <Button variant="ghost" size="sm" onClick={copyToClipboard}>
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Deposit Form */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Deposit Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FieldGroup>
              <Field>
                <FieldLabel>Amount (Birr)</FieldLabel>
                <Input
                  type="number"
                  placeholder={`Min ${MIN_DEPOSIT} Birr`}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min={MIN_DEPOSIT}
                />
              </Field>

              <Field>
                <FieldLabel>Telebirr Transaction ID</FieldLabel>
                <Input
                  type="text"
                  placeholder="Enter transaction ID from receipt"
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel>Sender Name (as shown on Telebirr)</FieldLabel>
                <Input
                  type="text"
                  placeholder="Your Telebirr account name"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel>Screenshot</FieldLabel>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {screenshot ? screenshot.name : 'Upload Screenshot'}
                </Button>
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
              disabled={isSubmitting || !amount || !transactionId || !senderName || !screenshot}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Deposit Request'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        Deposits are usually approved within 10 minutes. If your deposit is not processed, you will receive a notification.
      </p>
    </div>
  )
}
