import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useFamily } from '@/contexts/FamilyContext'
import { Layout } from '@/components/Layout'
import AuthPage from '@/pages/AuthPage'
import OnboardingPage from '@/pages/OnboardingPage'
import GoogleCallbackPage from '@/pages/GoogleCallbackPage'
import TodayPage from '@/pages/TodayPage'
import WeekPage from '@/pages/WeekPage'
import HouseholdPage from '@/pages/HouseholdPage'
import VaultPage from '@/pages/VaultPage'
import SettingsPage from '@/pages/SettingsPage'
import AssistantPage from '@/pages/AssistantPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <FullScreenSpinner />
  if (!user) return <Navigate to="/auth" replace />
  return <>{children}</>
}

function RequireFamily({ children }: { children: React.ReactNode }) {
  const { family, loading } = useFamily()
  if (loading) return <FullScreenSpinner />
  if (!family) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

function FullScreenSpinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-gray-50">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-gray-600" />
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/auth" element={<AuthPage />} />

      {/* Authenticated but no family yet */}
      <Route
        path="/onboarding"
        element={
          <RequireAuth>
            <OnboardingPage />
          </RequireAuth>
        }
      />

      {/* Google Calendar OAuth callback */}
      <Route
        path="/auth/google/callback"
        element={
          <RequireAuth>
            <GoogleCallbackPage />
          </RequireAuth>
        }
      />

      {/* Fully authenticated + family */}
      <Route
        element={
          <RequireAuth>
            <RequireFamily>
              <Layout />
            </RequireFamily>
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/today" replace />} />
        <Route path="today" element={<TodayPage />} />
        <Route path="week" element={<WeekPage />} />
        <Route path="household" element={<HouseholdPage />} />
        <Route path="vault" element={<VaultPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="assistant" element={<AssistantPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
