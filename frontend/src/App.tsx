import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import OnboardingPage from './pages/OnboardingPage'
import DashboardPage from './pages/DashboardPage'
import MembersPage from './pages/MembersPage'
import FamiliesPage from './pages/FamiliesPage'
import FamilyDetailPage from './pages/FamilyDetailPage'
import GivingPage from './pages/GivingPage'
import EventsPage from './pages/EventsPage'
import GroupsPage from './pages/GroupsPage'
import AttendancePage from './pages/AttendancePage'
import ReportsPage from './pages/ReportsPage'
import BibleStudyPage from './pages/BibleStudyPage'
import DirectoryPage from './pages/DirectoryPage'
import AIInsightsPage from './pages/AIInsightsPage'
import CommDraftsPage from './pages/CommDraftsPage'
import SermonPrepPage from './pages/SermonPrepPage'
import SmartSearchPage from './pages/SmartSearchPage'
import HelpPage from './pages/HelpPage'
import SettingsPage from './pages/SettingsPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>Loading…</div>
  if (!session) return <Navigate to="/login" replace />
  if (!session.user?.app_metadata?.church_id) return <Navigate to="/onboard" replace />
  return <>{children}</>
}

function AppRoutes() {
  const { session, loading } = useAuth()
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>Loading…</div>

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/onboard" element={session ? <OnboardingPage /> : <Navigate to="/login" replace />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="smart-search" element={<SmartSearchPage />} />
        <Route path="members" element={<MembersPage />} />
        <Route path="families" element={<FamiliesPage />} />
        <Route path="families/:id" element={<FamilyDetailPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="giving" element={<GivingPage />} />
        <Route path="events" element={<EventsPage />} />
        <Route path="groups" element={<GroupsPage />} />
        <Route path="bible-study" element={<BibleStudyPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="directory" element={<DirectoryPage />} />
        <Route path="ai/insights" element={<AIInsightsPage />} />
        <Route path="ai/comm-drafts" element={<CommDraftsPage />} />
        <Route path="ai/sermon-prep" element={<SermonPrepPage />} />
        <Route path="help" element={<HelpPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
