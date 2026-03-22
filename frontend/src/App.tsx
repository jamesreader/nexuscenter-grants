import { useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Dashboard from './pages/Dashboard'
import Discover from './pages/Discover'
import GrantDetail from './pages/GrantDetail'
import Applications from './pages/Applications'
import Settings from './pages/Settings'
import { Heart, Search, FileText, LayoutDashboard, Settings as SettingsIcon, Menu, X } from 'lucide-react'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      refetchOnWindowFocus: false,
    },
  },
})

function NavItem({ to, icon: Icon, label, onClick }: { to: string; icon: React.ComponentType<{ className?: string }>; label: string; onClick?: () => void }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-2 px-4 py-3 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
          isActive ? 'bg-coral-50 text-coral-400' : 'text-warm-400 hover:bg-cream-100'
        }`
      }
    >
      <Icon className="w-5 h-5" />
      {label}
    </NavLink>
  )
}

function AppHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Close menu on route change
  useState(() => {
    setMobileMenuOpen(false)
  })

  return (
    <header className="bg-white border-b border-sage-200 px-4 py-3 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Heart className="w-7 h-7 text-coral-400 flex-shrink-0" />
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold font-heading text-navy-500 truncate">Nexus Center Grants</h1>
            <p className="text-xs text-warm-400 hidden sm:block">IDD Care · Grant Discovery</p>
          </div>
        </div>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          <NavItem to="/" icon={LayoutDashboard} label="Dashboard" />
          <NavItem to="/discover" icon={Search} label="Discover" />
          <NavItem to="/applications" icon={FileText} label="Applications" />
          <NavItem to="/settings" icon={SettingsIcon} label="Settings" />
        </nav>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-cream-100 transition-colors"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X className="w-6 h-6 text-warm-500" /> : <Menu className="w-6 h-6 text-warm-500" />}
        </button>
      </div>

      {/* Mobile menu dropdown */}
      {mobileMenuOpen && (
        <nav className="md:hidden mt-3 pt-3 border-t border-sage-100 flex flex-col gap-1">
          <NavItem to="/" icon={LayoutDashboard} label="Dashboard" onClick={() => setMobileMenuOpen(false)} />
          <NavItem to="/discover" icon={Search} label="Discover" onClick={() => setMobileMenuOpen(false)} />
          <NavItem to="/applications" icon={FileText} label="Applications" onClick={() => setMobileMenuOpen(false)} />
          <NavItem to="/settings" icon={SettingsIcon} label="Settings" onClick={() => setMobileMenuOpen(false)} />
        </nav>
      )}
    </header>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen bg-cream-50">
          {/* Header */}
          <AppHeader />

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
