import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateTelegramAuth } from '@/lib/telegram/validate'
import { v4 as uuidv4 } from 'uuid'

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

    const { gameId } = await request.json()

    if (!gameId) {
      return NextResponse.json({ error: 'Missing gameId' }, { status: 400 })
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

    // Generate idempotency key
    const idempotencyKey = uuidv4()

    // Call the claim_bingo function
    const { data: result, error: claimError } = await supabase.rpc('claim_bingo', {
      p_user_id: user.id,
      p_game_id: gameId,
      p_idempotency_key: idempotencyKey,
    })

    if (claimError) {
      console.error('Claim BINGO error:', claimError)
      return NextResponse.json({ 
        error: claimError.message || 'Failed to claim BINGO' 
      }, { status: 400 })
    }

    // Log the claim attempt
    await supabase.from('game_events').insert({
      game_id: gameId,
      user_id: user.id,
      event_type: 'bingo_claim',
      event_data: { 
        valid: result?.valid,
        prize: result?.prize,
        message: result?.message,
      },
    })

    if (result?.valid) {
      return NextResponse.json({
        valid: true,
        prize: result.prize,
        message: 'Congratulations! You won!',
      })
    } else {
      return NextResponse.json({
        valid: false,
        message: result?.message || 'Invalid BINGO claim',
        warning: result?.warning,
      })
    }
  } catch (error) {
    console.error('BINGO claim error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
