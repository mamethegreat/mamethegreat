import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Verify admin auth
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: admin } = await supabase
      .from('admins')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (!admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { withdrawalId, action } = await request.json()

    if (!withdrawalId || !['complete', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    // Get the withdrawal
    const { data: withdrawal, error: withdrawalError } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', withdrawalId)
      .eq('type', 'withdrawal')
      .eq('status', 'pending')
      .single()

    if (withdrawalError || !withdrawal) {
      return NextResponse.json({ error: 'Withdrawal not found' }, { status: 404 })
    }

    if (action === 'complete') {
      // Mark withdrawal as completed (money already deducted at request time)
      const { error: updateError } = await supabase
        .from('transactions')
        .update({ 
          status: 'completed',
          processed_at: new Date().toISOString(),
          processed_by: admin.id,
        })
        .eq('id', withdrawalId)

      if (updateError) {
        console.error('Complete withdrawal error:', updateError)
        return NextResponse.json({ error: 'Failed to complete withdrawal' }, { status: 500 })
      }

      // Log admin action
      await supabase.from('admin_logs').insert({
        admin_id: admin.id,
        action: 'complete_withdrawal',
        target_type: 'transaction',
        target_id: withdrawalId,
        details: { 
          amount: withdrawal.amount, 
          user_id: withdrawal.user_id,
          telebirr_number: withdrawal.telebirr_number,
        },
      })

    } else {
      // Reject withdrawal - refund the balance
      const { error: rpcError } = await supabase.rpc('reject_withdrawal', {
        p_transaction_id: withdrawalId,
        p_admin_id: admin.id,
      })

      if (rpcError) {
        console.error('Reject withdrawal error:', rpcError)
        return NextResponse.json({ error: rpcError.message }, { status: 400 })
      }

      // Log admin action
      await supabase.from('admin_logs').insert({
        admin_id: admin.id,
        action: 'reject_withdrawal',
        target_type: 'transaction',
        target_id: withdrawalId,
        details: { amount: withdrawal.amount, user_id: withdrawal.user_id },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin withdrawals error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
