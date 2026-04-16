import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!

function getTelegramUserIdFromInitData(initData: string): number | null {
  try {
    const params = new URLSearchParams(initData)
    const hash = params.get('hash')
    
    if (!hash) return null

    params.delete('hash')
    const dataCheckArr: string[] = []
    params.sort()
    params.forEach((value, key) => {
      dataCheckArr.push(`${key}=${value}`)
    })
    const dataCheckString = dataCheckArr.join('\n')

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(BOT_TOKEN)
      .digest()

    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex')

    if (calculatedHash !== hash) return null

    const userStr = params.get('user')
    if (!userStr) return null

    const user = JSON.parse(userStr)
    return user.id
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    const initData = request.headers.get('X-Telegram-Init-Data')
    
    if (!initData) {
      return NextResponse.json({ error: 'Missing authentication' }, { status: 401 })
    }

    const telegramId = getTelegramUserIdFromInitData(initData)
    if (!telegramId) {
      return NextResponse.json({ error: 'Invalid authentication' }, { status: 401 })
    }

    const supabase = await createClient()

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .single()

    if (error || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({ user })
  } catch (error) {
    console.error('Error fetching user:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
