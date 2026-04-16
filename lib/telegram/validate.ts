import crypto from 'crypto'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!

interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
  is_premium?: boolean
}

export function validateTelegramAuth(initData: string): TelegramUser | null {
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
      return null
    }

    // Validate auth_date (5 minutes max age)
    const authDate = parseInt(params.get('auth_date') || '0')
    const now = Math.floor(Date.now() / 1000)
    if (now - authDate > 300) {
      return null
    }

    // Parse user data
    const userStr = params.get('user')
    if (!userStr) return null

    return JSON.parse(userStr) as TelegramUser
  } catch {
    return null
  }
}

export function getTelegramUserId(initData: string): number | null {
  const user = validateTelegramAuth(initData)
  return user?.id || null
}
