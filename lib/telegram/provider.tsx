'use client'

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { TelegramWebApp, TelegramUser, UserData } from './types'

interface TelegramContextType {
  webApp: TelegramWebApp | null
  user: TelegramUser | null
  userData: UserData | null
  isReady: boolean
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  refreshUserData: () => Promise<void>
  hapticFeedback: (type: 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'warning') => void
}

const TelegramContext = createContext<TelegramContextType>({
  webApp: null,
  user: null,
  userData: null,
  isReady: false,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  refreshUserData: async () => {},
  hapticFeedback: () => {},
})

export function TelegramProvider({ children }: { children: ReactNode }) {
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null)
  const [user, setUser] = useState<TelegramUser | null>(null)
  const [userData, setUserData] = useState<UserData | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const authenticateUser = useCallback(async (initData: string) => {
    try {
      const response = await fetch('/api/auth/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed')
      }

      setUserData(data.user)
      setIsAuthenticated(true)
      return data.user
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed'
      setError(message)
      throw err
    }
  }, [])

  const refreshUserData = useCallback(async () => {
    if (!webApp?.initData) return

    try {
      const response = await fetch('/api/user/me', {
        headers: {
          'X-Telegram-Init-Data': webApp.initData,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setUserData(data.user)
      }
    } catch (err) {
      console.error('Failed to refresh user data:', err)
    }
  }, [webApp])

  const hapticFeedback = useCallback((type: 'light' | 'medium' | 'heavy' | 'success' | 'error' | 'warning') => {
    if (!webApp?.HapticFeedback) return

    if (type === 'success' || type === 'error' || type === 'warning') {
      webApp.HapticFeedback.notificationOccurred(type)
    } else {
      webApp.HapticFeedback.impactOccurred(type)
    }
  }, [webApp])

  useEffect(() => {
    const initTelegram = async () => {
      // Wait for Telegram WebApp to be available
      const checkTelegram = () => {
        if (window.Telegram?.WebApp) {
          return window.Telegram.WebApp
        }
        return null
      }

      let tg = checkTelegram()
      
      // Retry a few times if not immediately available
      if (!tg) {
        for (let i = 0; i < 10; i++) {
          await new Promise(resolve => setTimeout(resolve, 100))
          tg = checkTelegram()
          if (tg) break
        }
      }

      if (!tg) {
        // Development mode - create mock data
        if (process.env.NODE_ENV === 'development') {
          setIsLoading(false)
          setIsReady(true)
          setError('Running outside Telegram. Use Telegram to access the app.')
          return
        }
        setError('Telegram WebApp not available')
        setIsLoading(false)
        return
      }

      setWebApp(tg)
      tg.ready()
      tg.expand()

      // Set theme colors (only if supported - version 6.1+)
      const version = parseFloat(tg.version || '6.0')
      if (version >= 6.1) {
        try {
          tg.setHeaderColor('#1a1a2e')
          tg.setBackgroundColor('#16213e')
        } catch {
          // Silently ignore if not supported
        }
      }

      const telegramUser = tg.initDataUnsafe.user
      if (telegramUser) {
        setUser(telegramUser)
      }

      setIsReady(true)

      // Authenticate with backend
      if (tg.initData) {
        try {
          await authenticateUser(tg.initData)
        } catch {
          // Error already set in authenticateUser
        }
      }

      setIsLoading(false)
    }

    initTelegram()
  }, [authenticateUser])

  return (
    <TelegramContext.Provider
      value={{
        webApp,
        user,
        userData,
        isReady,
        isAuthenticated,
        isLoading,
        error,
        refreshUserData,
        hapticFeedback,
      }}
    >
      {children}
    </TelegramContext.Provider>
  )
}

export function useTelegram() {
  const context = useContext(TelegramContext)
  if (!context) {
    throw new Error('useTelegram must be used within TelegramProvider')
  }
  return context
}
