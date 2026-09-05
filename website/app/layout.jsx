import './globals.css'
import ErrorBoundary from '@/components/ErrorBoundary'
import Chrome from './components/Chrome'

export const metadata = {
  title: 'BatchMyPhotos — Smart Photo Batch Organizer',
  description:
    'BatchMyPhotos — Automatically organize thousands of photos into smart batches. Try the interactive demo.',
  openGraph: {
    title: 'BatchMyPhotos — Smart Photo Batch Organizer',
    description: 'Organize 10,000+ photos into smart batches in seconds. Try the free interactive demo.',
    type: 'website',
  },
  icons: { icon: '/app_icon.png?v=2' }, // ?v= busts the browser's cached pre-rebrand favicon
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Finish Line typography: Anton (hero) · Archivo (display + body) · Geist Mono (data) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@400;500;600;700;800;900&family=Geist+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ErrorBoundary>
          <Chrome>{children}</Chrome>
        </ErrorBoundary>
      </body>
    </html>
  )
}
