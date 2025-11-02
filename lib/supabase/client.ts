import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Supabase environment variables not found!')
  console.error('Please create a .env file with:')
  console.error('VITE_SUPABASE_URL=your_supabase_url')
  console.error('VITE_SUPABASE_ANON_KEY=your_supabase_anon_key')
  console.error('See SUPABASE_SETUP.md for detailed instructions.')
}

export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null
