import { LoginGate } from '@/components/LoginGate'
import { CampaignLobby } from '@/components/CampaignLobby'
import { SessionProvider, useSession } from '@/lib/session'
import { DesignProvider } from '@/components/DesignStudio'

function Root() {
  const { session, loading } = useSession()
  if (loading) return <main className="access-page" role="status">Restoring campaign access…</main>
  if (!session) return <LoginGate />
  return <CampaignLobby key={`${session.campaignId}:${session.userId}:${session.role}`} />
}

export default function App() {
  return (
    <DesignProvider>
      <SessionProvider>
        <Root />
      </SessionProvider>
    </DesignProvider>
  )
}
