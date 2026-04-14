import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import MembersPage from './pages/MembersPage'
import FamiliesPage from './pages/FamiliesPage'
import FamilyDetailPage from './pages/FamilyDetailPage'
import GivingPage from './pages/GivingPage'
import EventsPage from './pages/EventsPage'
import GroupsPage from './pages/GroupsPage'
import ReportsPage from './pages/ReportsPage'
import SettingsPage from './pages/SettingsPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>Loading…</div>
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppRoutes() {
  const { session, loading } = useAuth()
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>Loading…</div>

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route path="members" element={<MembersPage />} />
        <Route path="families" element={<FamiliesPage />} />
        <Route path="families/:id" element={<FamilyDetailPage />} />
        <Route path="giving" element={<GivingPage />} />
        <Route path="events" element={<EventsPage />} />
        <Route path="groups" element={<GroupsPage />} />
        <Route path="reports" element={<ReportsPage />} />
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
