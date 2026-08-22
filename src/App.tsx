import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './lib/auth'
import { rememberJoinCode } from './lib/pendingJoin'
import { AppHeader } from './components/AppHeader'
import { PendingJoinBanner } from './components/PendingJoinBanner'
import { SignInPage } from './features/auth/SignInPage'
import { SignUpPage } from './features/auth/SignUpPage'
import { ResetPasswordPage } from './features/auth/ResetPasswordPage'
import { MyRoundsPage } from './features/rounds/MyRoundsPage'
import { ProfilePage } from './features/profile/ProfilePage'
import { CreateRoundPage } from './features/rounds/CreateRoundPage'
import { JoinRoundPage } from './features/rounds/JoinRoundPage'
import { RoundHomePage } from './features/rounds/RoundHomePage'
import { RoundSettingsPage } from './features/rounds/RoundSettingsPage'
import { ChainPage } from './features/rounds/ChainPage'
import { HostAlertsPage } from './features/rounds/HostAlertsPage'
import { BriefEditorPage } from './features/briefs/BriefEditorPage'
import { CookViewPage } from './features/briefs/CookViewPage'
import { BallotPage } from './features/vote/BallotPage'
import { ResultsPage } from './features/vote/ResultsPage'

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, profile, loading, needsSignupCompletion } = useAuth()
  const location = useLocation()

  if (loading) return null

  // Last chance to keep the invitation. These redirects use `replace`, so
  // the ?code= that brought someone here is about to be erased from
  // history — stash it now and MyRoundsPage will pick it up on the way
  // back. See src/lib/pendingJoin.ts.
  if (!session || needsSignupCompletion) {
    if (location.pathname === '/join') {
      const code = new URLSearchParams(location.search).get('code')
      if (code) rememberJoinCode(code)
    }
    return <Navigate to={session ? '/signup' : '/signin'} replace />
  }

  if (!profile) return null

  return <>{children}</>
}

function AppRoutes() {
  const { session, needsSignupCompletion } = useAuth()

  return (
    <Routes>
      <Route path="/signin" element={session ? <Navigate to="/" replace /> : <SignInPage />} />
      <Route
        path="/signup"
        element={session && !needsSignupCompletion ? <Navigate to="/" replace /> : <SignUpPage />}
      />
      <Route path="/reset" element={<ResetPasswordPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <MyRoundsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/profile"
        element={
          <RequireAuth>
            <ProfilePage />
          </RequireAuth>
        }
      />
      <Route
        path="/rounds/new"
        element={
          <RequireAuth>
            <CreateRoundPage />
          </RequireAuth>
        }
      />
      <Route
        path="/join"
        element={
          <RequireAuth>
            <JoinRoundPage />
          </RequireAuth>
        }
      />
      <Route
        path="/rounds/:roundId"
        element={
          <RequireAuth>
            <RoundHomePage />
          </RequireAuth>
        }
      />
      <Route
        path="/rounds/:roundId/settings"
        element={
          <RequireAuth>
            <RoundSettingsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/rounds/:roundId/chain"
        element={
          <RequireAuth>
            <ChainPage />
          </RequireAuth>
        }
      />
      <Route
        path="/rounds/:roundId/alerts"
        element={
          <RequireAuth>
            <HostAlertsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/rounds/:roundId/brief"
        element={
          <RequireAuth>
            <BriefEditorPage />
          </RequireAuth>
        }
      />
      <Route
        path="/rounds/:roundId/recipe"
        element={
          <RequireAuth>
            <CookViewPage />
          </RequireAuth>
        }
      />
      <Route
        path="/rounds/:roundId/ballot"
        element={
          <RequireAuth>
            <BallotPage />
          </RequireAuth>
        }
      />
      <Route
        path="/rounds/:roundId/results"
        element={
          <RequireAuth>
            <ResultsPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppHeader />
      <PendingJoinBanner />
      {/* The tablecloth is the app, not one page of it. Every screen sits
          on it, and .sheet is the paper each one is written on — the rule
          that nothing readable touches the checks holds everywhere. The
          round page opts out of .sheet because it lays its own paper. */}
      <main className="cloth">
        <AppRoutes />
      </main>
    </BrowserRouter>
  )
}
