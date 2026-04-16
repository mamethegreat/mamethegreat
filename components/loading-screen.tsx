import { Spinner } from '@/components/ui/spinner'

export function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
      <div className="relative">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
          <span className="text-3xl font-bold text-white">B</span>
        </div>
        <div className="absolute -bottom-1 -right-1">
          <Spinner className="w-6 h-6" />
        </div>
      </div>
      <div className="text-center">
        <h1 className="text-xl font-bold">Bingo</h1>
        <p className="text-sm text-muted-foreground">Loading game...</p>
      </div>
    </div>
  )
}
