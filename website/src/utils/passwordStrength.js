/**
 * Password strength calculator.
 *
 * Returns { level: 0-4, label: string, color: string }
 *  - 0: empty
 *  - 1: Weak   (red)
 *  - 2: Fair   (amber)
 *  - 3: Good   (indigo)
 *  - 4: Strong (emerald)
 */
export function getPasswordStrength(pw) {
  if (!pw) return { level: 0, label: '', color: '' }
  let score = 0
  if (pw.length >= 6) score++
  if (pw.length >= 10) score++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++
  if (/\d/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++

  if (score <= 1) return { level: 1, label: 'Weak', color: 'bg-red-500' }
  if (score <= 2) return { level: 2, label: 'Fair', color: 'bg-amber-500' }
  if (score <= 3) return { level: 3, label: 'Good', color: 'bg-indigo-500' }
  return { level: 4, label: 'Strong', color: 'bg-emerald-500' }
}
