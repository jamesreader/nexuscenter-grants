import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Dashboard from './pages/Dashboard'
import Discover from './pages/Discover'
import GrantDetail from './pages/GrantDetail'
import Applications from './pages/Applications'
import Settings from './pages/Settings'
import { Heart, Search, FileText, LayoutDashboard, Settings as SettingsIcon } from 'lucide-react'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      refetchOnWindowFocus: false,
    },
  },
})

function NavItem({ to, icon: Icon, label }: { to: string; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive ? 'bg-coral-50 text-coral-400' : 'text-warm-400 hover:bg-cream-100'
        }`
      }
    >
      <Icon className="w-4 h-4" />
      {label}
    </NavLink>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen bg-cream-50">
          {/* Header */}
          <header className="bg-white border-b border-sage-200 px-4 py-3">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Heart className="w-7 h-7 text-coral-400" />
                <div>
                  <h1 className="text-lg font-bold font-heading text-navy-500">Nexus Center Grants</h1>
                  <p className="text-xs text-warm-400">IDD Care · Grant Discovery</p>
                </div>
              </div>
              <nav className="flex items-center gap-1">
                <NavItem to="/" icon={LayoutDashboard} label="Dashboard" />
                <NavItem to="/discover" icon={Search} label="Discover" />
                <NavItem to="/applications" icon={FileText} label="Applications" />
                <NavItem to="/settings" icon={SettingsIcon} label="Settings" />
              </nav>
            </div>
          </header>

          {/* Content */}
          <main className="max-w-7xl mx-auto px-4 py-6">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/discover" element={<Discover />} />
              <Route path="/grants/:id" element={<GrantDetail />} />
              <Route path="/grants/flagged" element={<Discover />} />
              <Route path="/applications" element={<Applications />} />
              <Route path="/applications/:id" element={<Applications />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>

          {/* Footer */}
          <footer className="border-t border-sage-100 bg-white mt-12 py-4">
            <div className="max-w-7xl mx-auto px-4 text-center text-sm text-warm-400">
              © {new Date().getFullYear()} Nexus Center for IDD Care · nexuscenter.care
            </div>
          </footer>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
