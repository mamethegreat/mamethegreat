import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Admin - Bingo',
  description: 'Bingo Admin Dashboard',
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
