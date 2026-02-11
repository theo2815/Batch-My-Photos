
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // We'll log a warning but not crash immediately, so the UI can show a "Setup Needed" state if keys are missing.
  console.warn('Supabase keys are missing! Check your .env file.')
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '')
