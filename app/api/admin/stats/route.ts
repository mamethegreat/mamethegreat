import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
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

    // Get stats
    const [
      { count: totalUsers },
      { count: totalGames },
      { count: pendingDeposits },
      { count: pendingWithdrawals },
    ] = await Promise.all([
      supabase.from("users").select("*", { count: "exact", head: true }),
      supabase.from("games").select("*", { count: "exact", head: true }).eq("status", "completed"),
      supabase.from("transactions").select("*", { count: "exact", head: true }).eq("type", "deposit").eq("status", "pending"),
      supabase.from("transactions").select("*", { count: "exact", head: true }).eq("type", "withdrawal").eq("status", "pending"),
    ])

    // Get total house earnings
    const { data: houseEarnings } = await supabase
      .from("games")
      .select("house_fee")
      .eq("status", "completed")

    const totalHouseEarnings = (houseEarnings || []).reduce(
      (sum: number, g: any) => sum + (g.house_fee || 0),
      0
    )

    // Get current game status
    const { data: currentGame } = await supabase
      .from("games")
      .select("*")
      .in("status", ["lobby", "countdown", "active"])
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    return NextResponse.json({
      stats: {
        totalUsers: totalUsers || 0,
        totalGames: totalGames || 0,
        pendingDeposits: pendingDeposits || 0,
        pendingWithdrawals: pendingWithdrawals || 0,
        totalHouseEarnings,
        currentGame: currentGame || null,
      },
    })
  } catch (error) {
    console.error("Admin stats error:", error)
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    )
  }
}
