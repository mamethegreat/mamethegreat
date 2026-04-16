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

    const { depositId, action } = await request.json()

    if (!depositId || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    // Get the deposit
    const { data: deposit, error: depositError } = await supabase
      .from('transactions')
      .select('*')
      .eq('id', depositId)
      .eq('type', 'deposit')
      .eq('status', 'pending')
      .single()

    if (depositError || !deposit) {
      return NextResponse.json({ error: 'Deposit not found' }, { status: 404 })
    }

    if (action === 'approve') {
      // Approve deposit - add balance to user
      const { error: rpcError } = await supabase.rpc('approve_deposit', {
        p_transaction_id: depositId,
        p_admin_id: admin.id,
      })

      if (rpcError) {
        console.error('Approve deposit error:', rpcError)
        return NextResponse.json({ error: rpcError.message }, { status: 400 })
      }

      // Log admin action
      await supabase.from('admin_logs').insert({
        admin_id: admin.id,
        action: 'approve_deposit',
        target_type: 'transaction',
        target_id: depositId,
        details: { amount: deposit.amount, user_id: deposit.user_id },
      })

    } else {
      // Reject deposit
      const { error: updateError } = await supabase
        .from('transactions')
        .update({ 
          status: 'rejected',
          processed_at: new Date().toISOString(),
          processed_by: admin.id,
        })
        .eq('id', depositId)

      if (updateError) {
        console.error('Reject deposit error:', updateError)
        return NextResponse.json({ error: 'Failed to reject deposit' }, { status: 500 })
      }

      // Log admin action
      await supabase.from('admin_logs').insert({
        admin_id: admin.id,
        action: 'reject_deposit',
        target_type: 'transaction',
        target_id: depositId,
        details: { amount: deposit.amount, user_id: deposit.user_id },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin deposits error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
