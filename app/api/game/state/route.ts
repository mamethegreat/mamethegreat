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

    // Process any pending draws (lazy deterministic ticking)
    await supabase.rpc('process_pending_draws')

    // Get current game (lobby or active)
    const { data: game } = await supabase
      .from('games')
      .select('*')
      .in('status', ['lobby', 'countdown', 'active'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    // If no active game, create a new lobby
    if (!game) {
      const lobbyEndsAt = new Date(Date.now() + 90 * 1000).toISOString()
      
      const { data: newGame, error: createError } = await supabase
        .from('games')
        .insert({
          status: 'lobby',
          lobby_ends_at: lobbyEndsAt,
          entry_fee: 10,
        })
        .select()
        .single()

      if (createError) {
        console.error('Error creating game:', createError)
        return NextResponse.json({ 
          game: null, 
          player: null, 
          takenCards: [],
          calledNumbers: []
        })
      }

      return NextResponse.json({
        game: newGame,
        player: null,
        takenCards: [],
        calledNumbers: []
      })
    }

    // Check if user is a player in this game
    const { data: player } = await supabase
      .from('game_players')
      .select(`
        card_number,
        joined_at,
        warnings,
        bingo_cards!inner(numbers)
      `)
      .eq('game_id', game.id)
      .eq('user_id', user.id)
      .single()

    // Get taken cards for this game
    const { data: takenCardsData } = await supabase
      .from('game_players')
      .select('card_number')
      .eq('game_id', game.id)

    const takenCards = takenCardsData?.map(p => p.card_number) || []

    // Get called numbers if game is active
    let calledNumbers: number[] = []
    if (game.status === 'active' || game.status === 'countdown') {
      const { data: draws } = await supabase
        .from('game_draws')
        .select('number')
        .eq('game_id', game.id)
        .order('sequence', { ascending: true })

      calledNumbers = draws?.map(d => d.number) || []
    }

    // Check for auto-win detection
    if (game.status === 'active' && calledNumbers.length >= 5) {
      await supabase.rpc('check_auto_win', { p_game_id: game.id })
    }

    return NextResponse.json({
      game: {
        id: game.id,
        status: game.status,
        pot: game.pot,
        player_count: game.player_count,
        lobby_ends_at: game.lobby_ends_at,
        game_starts_at: game.game_starts_at,
        last_draw_at: game.last_draw_at,
        draw_count: game.draw_count,
      },
      player: player ? {
        card_number: player.card_number,
        numbers: player.bingo_cards.numbers,
        joined_at: player.joined_at,
        warnings: player.warnings,
      } : null,
      takenCards,
      calledNumbers,
    })
  } catch (error) {
    console.error('Game state error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
