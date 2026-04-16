import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateTelegramAuth } from '@/lib/telegram/validate'
import { v4 as uuidv4 } from 'uuid'

const MIN_WITHDRAWAL = 50

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

    const { amount, telebirrNumber, accountName } = await request.json()

    // Validate amount
    if (!amount || typeof amount !== 'number' || amount < MIN_WITHDRAWAL) {
      return NextResponse.json({ error: `Minimum withdrawal is ${MIN_WITHDRAWAL} Birr` }, { status: 400 })
    }

    if (!telebirrNumber?.trim() || telebirrNumber.length < 10) {
      return NextResponse.json({ error: 'Valid Telebirr number is required' }, { status: 400 })
    }

    if (!accountName?.trim()) {
      return NextResponse.json({ error: 'Account name is required' }, { status: 400 })
    }

    const supabase = await createClient()

    // Get user with balance
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, balance')
      .eq('telegram_id', telegramUser.id)
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check balance
    if (user.balance < amount) {
      return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 })
    }

    // Create withdrawal request with atomic balance deduction
    const idempotencyKey = uuidv4()

    const { data: result, error: withdrawError } = await supabase.rpc('process_withdrawal', {
      p_user_id: user.id,
      p_amount: amount,
      p_telebirr_number: telebirrNumber.trim(),
      p_account_name: accountName.trim(),
      p_idempotency_key: idempotencyKey,
    })

    if (withdrawError) {
      console.error('Withdrawal error:', withdrawError)
      return NextResponse.json({ error: withdrawError.message || 'Failed to process withdrawal' }, { status: 400 })
    }

    if (!result?.success) {
      return NextResponse.json({ error: result?.error || 'Failed to process withdrawal' }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      message: 'Withdrawal request submitted successfully',
      transactionId: result.transaction_id,
    })
  } catch (error) {
    console.error('Withdrawal error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
