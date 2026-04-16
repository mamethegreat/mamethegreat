import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Verify admin
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: admin } = await supabase
      .from("admins")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single()

    if (!admin) {
      return NextResponse.json({ error: "Not an admin" }, { status: 403 })
    }

    const { action } = await request.json()

    if (action === "start_lobby") {
      // Check if there's already an active game
      const { data: existingGame } = await supabase
        .from("games")
        .select("id")
        .in("status", ["lobby", "countdown", "active"])
        .single()

      if (existingGame) {
        return NextResponse.json(
          { error: "A game is already in progress" },
          { status: 400 }
        )
      }

      // Get next game number
      const { data: lastGame } = await supabase
        .from("games")
        .select("game_number")
        .order("game_number", { ascending: false })
        .limit(1)
        .single()

      const nextGameNumber = (lastGame?.game_number || 0) + 1

      // Create new lobby
      const lobbyEndsAt = new Date(Date.now() + 90 * 1000) // 90 seconds
      const { data: newGame, error } = await supabase
        .from("games")
        .insert({
          game_number: nextGameNumber,
          status: "lobby",
          lobby_ends_at: lobbyEndsAt.toISOString(),
          entry_fee: 10,
          pot_amount: 0,
        })
        .select()
        .single()

      if (error) throw error

      // Log admin action
      await supabase.from("admin_logs").insert({
        admin_id: admin.id,
        action: "start_lobby",
        details: { game_id: newGame.id, game_number: nextGameNumber },
        ip_address: request.headers.get("x-forwarded-for") || "unknown",
      })

      return NextResponse.json({ success: true, game: newGame })
    }

    if (action === "force_end") {
      // Force end current game and refund all players
      const { data: currentGame } = await supabase
        .from("games")
        .select("id")
        .in("status", ["lobby", "countdown", "active"])
        .single()

      if (!currentGame) {
        return NextResponse.json(
          { error: "No active game to end" },
          { status: 400 }
        )
      }

      // Call refund function
      const { error } = await supabase.rpc("process_game_refund", {
        p_game_id: currentGame.id,
      })

      if (error) throw error

      // Log admin action
      await supabase.from("admin_logs").insert({
        admin_id: admin.id,
        action: "force_end_game",
        details: { game_id: currentGame.id },
        ip_address: request.headers.get("x-forwarded-for") || "unknown",
      })

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error) {
    console.error("Admin game control error:", error)
    return NextResponse.json(
      { error: "Failed to perform action" },
      { status: 500 }
    )
  }
}
