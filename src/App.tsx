import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './lib/auth'
import { AppHeader } from './components/AppHeader'
import { SignInPage } from './features/auth/SignInPage'
import { SignUpPage } from './features/auth/SignUpPage'
import { ResetPasswordPage } from './features/auth/ResetPasswordPage'
import { MyRoundsPage } from './features/rounds/MyRoundsPage'
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

  if (loading) return null
  if (!session) return <Navigate to="/signin" replace />
  if (needsSignupCompletion) return <Navigate to="/signup" replace />
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
      <main>
        <AppRoutes />
      </main>
    </BrowserRouter>
  )
}
