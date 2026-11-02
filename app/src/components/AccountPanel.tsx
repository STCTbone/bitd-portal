import { useState } from 'react'
import { useSession } from '@/lib/session'
import { beginGoogleSignIn } from '@/lib/google-auth'

export function AccountPanel() {
  const { account, session, campaigns, campaignListError, accountError, refreshMembership, openCampaign, signOut } = useSession()
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  async function connect() {
    setBusy(true); setError('')
    try { await beginGoogleSignIn() }
    catch (error) { setError(error instanceof Error ? error.message : 'Google sign-in failed. Reconnect and retry.') }
    finally { setBusy(false) }
  }
  return <section className="access-panel account-panel" aria-label="Account">
    <p className="access-kicker">YOUR ACCOUNT / EVERY DEVICE</p>
    <h2>{account && !account.is_anonymous ? 'Your account' : 'Keep your place at the table'}</h2>
    {account && !account.is_anonymous ? <>
      <p>Signed in as {account.email ?? 'your account'}.</p>
      <button disabled={busy} onClick={() => { void signOut() }}>Sign out</button>
      {!session && <section aria-label="My campaigns"><h3>My campaigns</h3>
        {campaignListError ? <p role="alert">{campaignListError} <button onClick={() => { void refreshMembership() }}>Retry my campaigns</button></p> : campaigns.length ? campaigns.map(campaign => <button key={campaign.id} onClick={() => { void openCampaign(campaign.id) }}>Open {campaign.name}</button>) : <p>No campaigns yet. Create one or join with an invitation below.</p>}
      </section>}
    </> : <>
      {account?.is_anonymous && <p>Link Google to keep this guest account.</p>}
      <button disabled={busy} onClick={() => void connect()}>{account?.is_anonymous ? 'Link Google to this guest' : 'Sign in with Google'}</button>
    </>}
    {accountError && <p role="alert" className="access-error">{accountError}</p>}
    {error && <p role="alert" className="access-error">{error}</p>}
  </section>
}
