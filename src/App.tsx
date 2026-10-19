import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'
import { useAuth } from './lib/auth'
import { rememberJoinCode } from './lib/pendingJoin'
import { AppHeader } from './components/AppHeader'
import { PendingJoinBanner } from './components/PendingJoinBanner'
import { SchemaMismatch } from './components/SchemaMismatch'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AppFooter } from './components/AppFooter'
import { SignInPage } from './features/auth/SignInPage'
import { MyRoundsPage } from './features/rounds/MyRoundsPage'
import { PRO_VISIBLE } from './lib/proVisible'

// Every page but the two a visit starts on (sign-in and the list of dinners)
// is its own file, fetched the first time somebody goes there. In one bundle
// the whole app — every editor, the vote, the admin — was downloaded before
// the first screen could draw.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each page keeps its own props
function page<K extends string, P = any>(load: () => Promise<Record<K, ComponentType<P>>>, name: K) {
  return lazy(() => load().then((m) => ({ default: m[name] })))
}

const LegalPage = page(() => import('./features/legal/LegalPage'), 'LegalPage')
const HelpPage = page(() => import('./features/legal/HelpPage'), 'HelpPage')
const SignUpPage = page(() => import('./features/auth/SignUpPage'), 'SignUpPage')
const ResetPasswordPage = page(() => import('./features/auth/ResetPasswordPage'), 'ResetPasswordPage')
const ProfilePage = page(() => import('./features/profile/ProfilePage'), 'ProfilePage')
const AlbumPage = page(() => import('./features/profile/KeptPages'), 'AlbumPage')
const RecipesPage = page(() => import('./features/profile/KeptPages'), 'RecipesPage')
const CreateRoundPage = page(() => import('./features/rounds/CreateRoundPage'), 'CreateRoundPage')
const CustomRoundPage = page(() => import('./features/rounds/CustomRoundPage'), 'CustomRoundPage')
const JoinRoundPage = page(() => import('./features/rounds/JoinRoundPage'), 'JoinRoundPage')
const GoToNextDinner = page(() => import('./features/rounds/GoToNextDinner'), 'GoToNextDinner')
const RoundHomePage = page(() => import('./features/rounds/RoundHomePage'), 'RoundHomePage')
const RoundSettingsPage = page(() => import('./features/rounds/RoundSettingsPage'), 'RoundSettingsPage')
const ChainPage = page(() => import('./features/rounds/ChainPage'), 'ChainPage')
const HostAlertsPage = page(() => import('./features/rounds/HostAlertsPage'), 'HostAlertsPage')
const BriefEditorPage = page(() => import('./features/briefs/BriefEditorPage'), 'BriefEditorPage')
const CookViewPage = page(() => import('./features/briefs/CookViewPage'), 'CookViewPage')
const BoardPage = page(() => import('./features/chat/BoardPage'), 'BoardPage')
const BallotPage = page(() => import('./features/vote/BallotPage'), 'BallotPage')
const ManualTallyPage = page(() => import('./features/vote/ManualTallyPage'), 'ManualTallyPage')
const ResultsPage = page(() => import('./features/vote/ResultsPage'), 'ResultsPage')
const ProPage = page(() => import('./features/pro/ProPage'), 'ProPage')
const SupportPage = page(() => import('./features/support/SupportPage'), 'SupportPage')
const ReportBugPage = page(() => import('./features/support/ReportBugPage'), 'ReportBugPage')
const AdminWeekPage = page(() => import('./features/admin/AdminWeekPage'), 'AdminWeekPage')
const TutorialPage = page(() => import('./features/tutorial/TutorialPage'), 'TutorialPage')

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, profile, loading, needsSignupCompletion, recovering } = useAuth()
  const location = useLocation()

  if (loading) return null

  // A reset link signs the person in, but that session is only good for
  // choosing a new password — not for the rounds, the profile or anything
  // else behind this guard. Send it back until the password is saved.
  if (recovering) return <Navigate to="/reset" replace />

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
  const { session, needsSignupCompletion, recovering } = useAuth()
  const location = useLocation()

  return (
    // Around the routes rather than around the whole app: the header, the
    // banners and the footer are the way out of a broken screen, and a
    // boundary above them would take them down with it. Keyed on the path so
    // walking away from a crashed page actually leaves it behind.
    <ErrorBoundary resetKey={location.pathname}>
      {/* Nothing while a page's file arrives: it is a fraction of a second, and
          a spinner flashing for that long reads as the app stuttering. */}
      <Suspense fallback={null}>
      <Routes>
        <Route path="/legal/terms" element={<LegalPage page="terms" />} />
        <Route path="/legal/privacy" element={<LegalPage page="privacy" />} />
        {/* Required by both stores the day free-text chat ships, and published
            before it rather than after (DISTRIBUTION §1). */}
        <Route path="/legal/moderation" element={<LegalPage page="moderation" />} />
        {/* Outside the guard on purpose: the whole point is that somebody who
            cannot sign in — or has not installed the app — can still read how
            to have their account deleted. */}
        <Route path="/help" element={<HelpPage />} />
        <Route path="/signin" element={session && !recovering ? <Navigate to="/" replace /> : <SignInPage />} />
        <Route
          path="/signup"
          element={
            recovering ? (
              <Navigate to="/reset" replace />
            ) : session && !needsSignupCompletion ? (
              <Navigate to="/" replace />
            ) : (
              <SignUpPage />
            )
          }
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
        {/* A dinner with nobody else at it, and nothing sent to the server. */}
        <Route
          path="/tutorial"
          element={
            <RequireAuth>
              <TutorialPage />
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
          path="/go/:target"
          element={
            <RequireAuth>
              <GoToNextDinner />
            </RequireAuth>
          }
        />
        <Route
          path="/profile/recipes"
          element={
            <RequireAuth>
              <RecipesPage />
            </RequireAuth>
          }
        />
        <Route
          path="/profile/album"
          element={
            <RequireAuth>
              <AlbumPage />
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
        {/* The long form is its own place rather than a panel under the grid:
            deciding fifteen things and choosing between six ready-made tables
            are two different jobs, and a route is what makes the difference
            visible — including in the back button. */}
        <Route
          path="/rounds/new/custom"
          element={
            <RequireAuth>
              <CustomRoundPage />
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
        {/* Not under /rounds: PRO is about an account, and it is reached both
            from the profile and from a locked row on the creation form. */}
        <Route
          path="/pro"
          element={
            PRO_VISIBLE ? (
              <RequireAuth>
                <ProPage />
              </RequireAuth>
            ) : (
              // Crème is hidden while everybody has it (0104); old links land
              // on the tip jar instead of a page about a difference that does
              // not exist.
              <Navigate to="/support" replace />
            )
          }
        />
        {/* Admins only; the page itself and every function behind it check. */}
        <Route
          path="/admin/week"
          element={
            <RequireAuth>
              <AdminWeekPage />
            </RequireAuth>
          }
        />
        {/* Outside the guard: asking for a coffee does not need an account. */}
        <Route path="/support" element={<SupportPage />} />
        <Route
          path="/report"
          element={
            <RequireAuth>
              <ReportBugPage />
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
          path="/rounds/:roundId/messages"
          element={
            <RequireAuth>
              <BoardPage />
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
          path="/rounds/:roundId/tally"
          element={
            <RequireAuth>
              <ManualTallyPage />
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
      </Suspense>
    </ErrorBoundary>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppHeader />
      {/* Above everything, because when it fires nothing below it is
          trustworthy. */}
      <SchemaMismatch />
      <PendingJoinBanner />
      {/* The tablecloth is the app, not one page of it. Every screen sits
          on it, and .sheet is the paper each one is written on — the rule
          that nothing readable touches the checks holds everywhere. The
          round page opts out of .sheet because it lays its own paper. */}
      <main className="cloth">
        <AppRoutes />
      </main>
      <AppFooter />
    </BrowserRouter>
  )
}
