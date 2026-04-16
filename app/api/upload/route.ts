import { NextRequest, NextResponse } from 'next/server'
import { validateTelegramAuth } from '@/lib/telegram/validate'
import { put } from '@vercel/blob'

export async function POST(request: NextRequest) {
  try {
    const initData = request.headers.get('X-Telegram-Init-Data')
    
    if (!initData) {
      return NextResponse.json({ error: 'Missing authentication' }, { status: 401 })
    }

    const telegramUser = validateTelegramAuth(initData)
    if (!telegramUser) {
      return NextResponse.json({ error: 'Invalid authentication' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only images are allowed' }, { status: 400 })
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be less than 5MB' }, { status: 400 })
    }

    // Generate unique filename
    const timestamp = Date.now()
    const extension = file.name.split('.').pop() || 'jpg'
    const filename = `deposits/${telegramUser.id}/${timestamp}.${extension}`

    // Upload to Vercel Blob
    const blob = await put(filename, file, {
      access: 'public',
    })

    return NextResponse.json({ url: blob.url })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
  }
}
