import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
      'Run npm run backend:start locally, or set these public build-time variables for your static host.',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: 'bitd' },
  auth: { flowType: 'pkce' },
  global: {
    // Uploaders control object Cache-Control, including info responses. Every
    // Storage renewal must recheck current RLS instead of renewing from cache.
    fetch: (input, init) => {
      const requestURL = new URL(input instanceof Request ? input.url : String(input))
      return fetch(input, requestURL.pathname.startsWith('/storage/v1/') ? { ...init, cache: 'no-store' } : init)
    },
  },
})
