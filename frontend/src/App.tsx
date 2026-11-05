import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { SetupLayout } from './components/SetupLayout'
import { CommunityProvider } from './context/CommunityContext'
import { SessionProvider } from './context/SessionContext'
import ApprovalRule from './pages/ApprovalRule'
import Audit from './pages/Audit'
import { Login, Signup } from './pages/Auth'
import Dashboard from './pages/Dashboard'
import Landing from './pages/Landing'
import Members from './pages/Members'
import NotFound from './pages/NotFound'
import RequestDetail from './pages/RequestDetail'
import RequestForm from './pages/RequestForm'
import Requests from './pages/Requests'
import Settings from './pages/Settings'
import { CreateCommunity, ReviewAndCreate } from './pages/Setup'
import Signers from './pages/Signers'
import { TransactionDetail, Transactions } from './pages/Transactions'
import WalletPage from './pages/Wallet'

// HashRouter keeps deep links working on any static host, with or without server-side rewrites.
export default function App() {
  return (
    <SessionProvider>
      <CommunityProvider>
        <HashRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<SetupLayout />}>
                <Route path="/start" element={<CreateCommunity />} />
                <Route path="/setup/members" element={<Members mode="setup" />} />
                <Route path="/setup/rule" element={<ApprovalRule mode="setup" />} />
                <Route path="/setup/signers" element={<Signers mode="setup" />} />
                <Route path="/setup/review" element={<ReviewAndCreate />} />
              </Route>

              <Route path="/app" element={<AppLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="wallet" element={<WalletPage />} />
                <Route path="requests" element={<Requests />} />
                <Route path="requests/new" element={<RequestForm />} />
                <Route path="requests/:id" element={<RequestDetail />} />
                <Route path="transactions" element={<Transactions />} />
                <Route path="transactions/:txid" element={<TransactionDetail />} />
                <Route path="members" element={<Members />} />
                <Route path="signers" element={<Signers />} />
                <Route path="approval-rule" element={<ApprovalRule />} />
                <Route path="audit" element={<Audit />} />
                <Route path="settings" element={<Settings />} />
                <Route path="*" element={<NotFound embedded />} />
              </Route>
            </Route>

            <Route path="/dashboard" element={<Navigate to="/app" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </HashRouter>
      </CommunityProvider>
    </SessionProvider>
  )
}
