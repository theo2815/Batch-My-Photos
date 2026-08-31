import './globals.css'
import { ThemeProvider } from '@/context/ThemeContext'
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
  icons: { icon: '/app_icon.png' },
}

// Apply theme class before paint to avoid a flash (mirrors ThemeContext: default 'dark')
const themeScript = `(function () {
  try {
    var t = localStorage.getItem('bmp-theme') || 'dark'
    var dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    if (dark) document.documentElement.classList.add('dark')
  } catch (e) {
    document.documentElement.classList.add('dark')
  }
})()`

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* Darkroom typography: Fraunces (display) · Hanken Grotesk (body) · Spline Sans Mono (data) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Hanken+Grotesk:wght@400;500;600;700&family=Spline+Sans+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ThemeProvider>
          <ErrorBoundary>
            <Chrome>{children}</Chrome>
          </ErrorBoundary>
        </ThemeProvider>
      </body>
    </html>
  )
}
