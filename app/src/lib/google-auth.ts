import { supabase } from './supabase'

/** Link guests in place: replacing their identity would strand existing ownership. */
export async function beginGoogleSignIn() {
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`, {
    headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY }, signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error('Could not check Google sign-in. Reconnect and retry.')
  const settings = await response.json()
  if (!settings.external?.google) throw new Error('Google sign-in is not configured on this server yet. Your current access is unchanged.')
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error) throw error
  const options = { redirectTo: `${window.location.origin}/`, queryParams: { prompt: 'select_account' } }
  const result = session?.user.is_anonymous
    ? await supabase.auth.linkIdentity({ provider: 'google', options })
    : await supabase.auth.signInWithOAuth({ provider: 'google', options })
  if (result.error) throw new Error('Google sign-in could not start. Your current access is unchanged. Try another Google account if it is already linked.')
}
