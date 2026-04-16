import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateTelegramAuth } from '@/lib/telegram/validate'
import { v4 as uuidv4 } from 'uuid'

const ENTRY_FEE = 10

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

    const { cardNumber } = await request.json()

    if (!cardNumber || cardNumber < 1 || cardNumber > 400) {
      return NextResponse.json({ error: 'Invalid card number' }, { status: 400 })
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
    if (user.balance < ENTRY_FEE) {
      return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 })
    }

    // Get current lobby game
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('*')
      .eq('status', 'lobby')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (gameError || !game) {
      return NextResponse.json({ error: 'No active lobby' }, { status: 400 })
    }

    // Check if user already joined
    const { data: existingPlayer } = await supabase
      .from('game_players')
      .select('id')
      .eq('game_id', game.id)
      .eq('user_id', user.id)
      .single()

    if (existingPlayer) {
      return NextResponse.json({ error: 'Already joined this game' }, { status: 400 })
    }

    // Check if card is taken
    const { data: takenCard } = await supabase
      .from('game_players')
      .select('id')
      .eq('game_id', game.id)
      .eq('card_number', cardNumber)
      .single()

    if (takenCard) {
      return NextResponse.json({ error: 'Card already taken' }, { status: 400 })
    }

    // Generate idempotency key
    const idempotencyKey = uuidv4()

    // Call the join_game function (handles all in a transaction)
    const { data: result, error: joinError } = await supabase.rpc('join_game', {
      p_user_id: user.id,
      p_game_id: game.id,
      p_card_number: cardNumber,
      p_entry_fee: ENTRY_FEE,
      p_idempotency_key: idempotencyKey,
    })

    if (joinError) {
      console.error('Join game error:', joinError)
      return NextResponse.json({ 
        error: joinError.message || 'Failed to join game' 
      }, { status: 400 })
    }

    if (!result?.success) {
      return NextResponse.json({ 
        error: result?.error || 'Failed to join game' 
      }, { status: 400 })
    }

    // Log the event
    await supabase.from('game_events').insert({
      game_id: game.id,
      user_id: user.id,
      event_type: 'player_joined',
      event_data: { card_number: cardNumber },
    })

    return NextResponse.json({ 
      success: true,
      message: 'Successfully joined game',
      cardNumber,
    })
  } catch (error) {
    console.error('Join game error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
