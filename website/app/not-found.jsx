export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-6xl font-bold text-primary">404</h1>
      <p className="text-lg text-text-secondary">Page not found</p>
      <a href="/" className="mt-2 text-sm font-medium text-accent hover:text-accent transition-colors">
        ← Back to home
      </a>
    </div>
  )
}
