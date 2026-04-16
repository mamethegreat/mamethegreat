'use client'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Shield } from 'lucide-react'

// Simple password - change this to your own secret password
const ADMIN_PASSWORD = 'bingo2024admin'

export default function AdminLoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    // Simple password check
    if (password === ADMIN_PASSWORD) {
      // Store admin session in localStorage
      localStorage.setItem('bingo_admin_auth', 'true')
      localStorage.setItem('bingo_admin_auth_time', Date.now().toString())
      router.push('/admin')
    } else {
      setError('Wrong password')
    }
    
    setIsLoading(false)
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-6 bg-background">
      <div className="w-full max-w-sm">
        <Card className="border-border">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-2xl">Admin Login</CardTitle>
            <CardDescription>
              Enter the admin password to continue
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin}>
              <div className="flex flex-col gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-secondary"
                    placeholder="Enter admin password"
                    autoFocus
                  />
                </div>
                {error && (
                  <p className="text-sm text-destructive text-center">{error}</p>
                )}
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Checking...' : 'Enter Admin Panel'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Bingo Admin Panel - Authorized Personnel Only
        </p>
      </div>
    </div>
  )
}
