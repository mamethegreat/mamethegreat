import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateTelegramAuth } from '@/lib/telegram/validate'

export async function GET(request: NextRequest) {
  try {
    const initData = request.headers.get('X-Telegram-Init-Data')
    
    if (!initData) {
      return NextResponse.json({ error: 'Missing authentication' }, { status: 401 })
    }

    const telegramUser = validateTelegramAuth(initData)
    if (!telegramUser) {
      return NextResponse.json({ error: 'Invalid authentication' }, { status: 401 })
    }

    const supabase = await createClient()

    // Get user
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('telegram_id', telegramUser.id)
      .single()

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get transactions
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('id, type, amount, status, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('Transactions error:', error)
      return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
    }

    return NextResponse.json({ transactions })
  } catch (error) {
    console.error('Transactions error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
