import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
      'These must be set as build-time env vars (Amplify Console → Environment variables).',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: 'bitd' },
  global: {
    // Uploaders control object Cache-Control, including info responses. Every
    // Storage renewal must recheck current RLS instead of renewing from cache.
    fetch: (input, init) => {
      const requestURL = new URL(input instanceof Request ? input.url : String(input))
      return fetch(input, requestURL.pathname.startsWith('/storage/v1/') ? { ...init, cache: 'no-store' } : init)
    },
  },
})
