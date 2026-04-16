import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateTelegramAuth } from '@/lib/telegram/validate'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const { gameId } = await params
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

    // Get game
    const { data: game } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single()

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    // Check if user was a winner
    const { data: claim } = await supabase
      .from('bingo_claims')
      .select('*')
      .eq('game_id', gameId)
      .eq('user_id', user.id)
      .eq('valid', true)
      .single()

    if (claim) {
      return NextResponse.json({
        result: {
          won: true,
          prize: claim.prize_amount,
          message: 'Congratulations! You won!',
        },
      })
    }

    // Check if game was refunded
    if (game.refund_processed) {
      return NextResponse.json({
        result: {
          won: false,
          refunded: true,
          message: 'Game ended without a winner. Your entry fee has been refunded.',
        },
      })
    }

    // Get winner info
    const { data: winners } = await supabase
      .from('bingo_claims')
      .select('users(first_name)')
      .eq('game_id', gameId)
      .eq('valid', true)

    const winnerNames = winners?.map(w => w.users?.first_name).filter(Boolean) || []

    return NextResponse.json({
      result: {
        won: false,
        message: winnerNames.length > 0
          ? `${winnerNames.join(', ')} won this game. Better luck next time!`
          : 'Game ended. Better luck next time!',
      },
    })
  } catch (error) {
    console.error('Game result error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
