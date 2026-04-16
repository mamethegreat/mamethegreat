import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateTelegramAuth } from '@/lib/telegram/validate'
import { v4 as uuidv4 } from 'uuid'

const MIN_DEPOSIT = 10

export async function POST(request: NextRequest) {
  try {
    const initData = request.headers.get('X-Telegram-Init-Data')
    
    if (!initData) {
      return NextResponse.json({ error: 'Missing authentication' }, { status: 401 })
    }

    const telegramUser = validateTelegramAuth(initData)
    if (!telegramUser) {
      return NextResponse.json({ error: 'Invalid authentication' }, { status: 401 })
    }

    const { amount, transactionId, senderName, screenshotUrl } = await request.json()

    // Validate amount
    if (!amount || typeof amount !== 'number' || amount < MIN_DEPOSIT) {
      return NextResponse.json({ error: `Minimum deposit is ${MIN_DEPOSIT} Birr` }, { status: 400 })
    }

    if (!transactionId?.trim()) {
      return NextResponse.json({ error: 'Transaction ID is required' }, { status: 400 })
    }

    if (!senderName?.trim()) {
      return NextResponse.json({ error: 'Sender name is required' }, { status: 400 })
    }

    if (!screenshotUrl) {
      return NextResponse.json({ error: 'Screenshot is required' }, { status: 400 })
    }

    const supabase = await createClient()

    // Get user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', telegramUser.id)
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check for duplicate transaction ID
    const { data: existingTx } = await supabase
      .from('transactions')
      .select('id')
      .eq('telebirr_transaction_id', transactionId.trim())
      .eq('type', 'deposit')
      .single()

    if (existingTx) {
      return NextResponse.json({ error: 'This transaction ID has already been used' }, { status: 400 })
    }

    // Create deposit request
    const idempotencyKey = uuidv4()

    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        type: 'deposit',
        amount,
        status: 'pending',
        telebirr_transaction_id: transactionId.trim(),
        sender_name: senderName.trim(),
        screenshot_url: screenshotUrl,
        idempotency_key: idempotencyKey,
      })
      .select()
      .single()

    if (txError) {
      console.error('Transaction error:', txError)
      return NextResponse.json({ error: 'Failed to create deposit request' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Deposit request submitted successfully',
      transactionId: transaction.id,
    })
  } catch (error) {
    console.error('Deposit error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
