import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import { TelegramProvider } from '@/lib/telegram/provider'

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: 'Bingo - Win Real Prizes',
  description: 'Play Bingo on Telegram and win real money!',
  generator: 'v0.app',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0f0f1a',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-background">
      <head>
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
      </head>
      <body className={`${inter.className} min-h-screen bg-background text-foreground antialiased overflow-x-hidden`}>
        <TelegramProvider>
          {children}
        </TelegramProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
