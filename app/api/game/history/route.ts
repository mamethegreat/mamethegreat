import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { validateTelegramAuth } from "@/lib/telegram/validate"

export async function GET(request: NextRequest) {
  try {
    const initData = request.headers.get("x-telegram-init-data")
    
    if (!initData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const telegramUser = await validateTelegramAuth(initData)
    if (!telegramUser) {
      return NextResponse.json({ error: "Invalid auth" }, { status: 401 })
    }

    const supabase = await createClient()

    // Get user
    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("telegram_id", telegramUser.id.toString())
      .single()

    if (!user) {
      return NextResponse.json({ games: [] })
    }

    // Get game history with player info
    const { data: playerGames } = await supabase
      .from("game_players")
      .select(`
        card_number,
        is_winner,
        prize_amount,
        game:games (
          id,
          game_number,
          status,
          pot_amount,
          winner_count,
          created_at
        )
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50)

    // Get total players for each game
    const games = await Promise.all(
      (playerGames || []).map(async (pg: any) => {
        const { count } = await supabase
          .from("game_players")
          .select("*", { count: "exact", head: true })
          .eq("game_id", pg.game.id)

        return {
          id: pg.game.id,
          game_number: pg.game.game_number,
          status: pg.game.status,
          pot_amount: pg.game.pot_amount,
          winner_count: pg.game.winner_count,
          total_players: count || 0,
          created_at: pg.game.created_at,
          user_won: pg.is_winner,
          prize_won: pg.prize_amount,
          card_number: pg.card_number,
        }
      })
    )

    return NextResponse.json({ games })
  } catch (error) {
    console.error("History fetch error:", error)
    return NextResponse.json(
      { error: "Failed to fetch history" },
      { status: 500 }
    )
  }
}
