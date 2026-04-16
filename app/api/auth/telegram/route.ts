import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!

interface TelegramInitData {
  query_id?: string
  user?: {
    id: number
    first_name: string
    last_name?: string
    username?: string
    language_code?: string
    is_premium?: boolean
  }
  auth_date: number
  hash: string
}

function validateTelegramData(initData: string): TelegramInitData | null {
  try {
    const params = new URLSearchParams(initData)
    const hash = params.get('hash')
    
    if (!hash) return null

    // Remove hash from params for validation
    params.delete('hash')

    // Sort params alphabetically and create data check string
    const dataCheckArr: string[] = []
    params.sort()
    params.forEach((value, key) => {
      dataCheckArr.push(`${key}=${value}`)
    })
    const dataCheckString = dataCheckArr.join('\n')

    // Create secret key from bot token
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(BOT_TOKEN)
      .digest()

    // Calculate hash
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex')

    // Validate hash
    if (calculatedHash !== hash) {
      console.error('Hash mismatch')
      return null
    }

    // Validate auth_date (5 minutes max age)
    const authDate = parseInt(params.get('auth_date') || '0')
    const now = Math.floor(Date.now() / 1000)
    if (now - authDate > 300) {
      console.error('Auth data expired')
      return null
    }

    // Parse user data
    const userStr = params.get('user')
    if (!userStr) return null

    const user = JSON.parse(userStr)

    return {
      query_id: params.get('query_id') || undefined,
      user,
      auth_date: authDate,
      hash,
    }
  } catch (error) {
    console.error('Error validating Telegram data:', error)
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const { initData } = await request.json()

    if (!initData) {
      return NextResponse.json({ error: 'Missing initData' }, { status: 400 })
    }

    // Validate Telegram data
    const telegramData = validateTelegramData(initData)
    if (!telegramData || !telegramData.user) {
      return NextResponse.json({ error: 'Invalid Telegram data' }, { status: 401 })
    }

    const { user: telegramUser } = telegramData

    const supabase = await createClient()

    // Check for replay attack
    const { data: existingHash } = await supabase
      .from('used_telegram_hashes')
      .select('hash')
      .eq('hash', telegramData.hash)
      .single()

    if (existingHash) {
      return NextResponse.json({ error: 'Replay attack detected' }, { status: 401 })
    }

    // Store hash to prevent replay
    await supabase.from('used_telegram_hashes').insert({
      hash: telegramData.hash,
      telegram_id: telegramUser.id,
    })

    // Upsert user
    const { data: user, error: userError } = await supabase
      .from('users')
      .upsert(
        {
          telegram_id: telegramUser.id,
          username: telegramUser.username || null,
          first_name: telegramUser.first_name,
          last_name: telegramUser.last_name || null,
        },
        {
          onConflict: 'telegram_id',
          ignoreDuplicates: false,
        }
      )
      .select()
      .single()

    if (userError) {
      console.error('User upsert error:', userError)
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        telegram_id: user.telegram_id,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        balance: user.balance,
        created_at: user.created_at,
      },
    })
  } catch (error) {
    console.error('Auth error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
