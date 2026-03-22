import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Search,
  DollarSign,
  Calendar,
  Building2,
  Star,
  StarOff,
  EyeOff,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ArrowUpDown
} from 'lucide-react'

interface Grant {
  id: string
  title: string
  agency: string
  description: string
  funding_amount_min: number | null
  funding_amount_max: number | null
  deadline: string | null
  status: string
  categories: string[]
  relevance_score: number | null
  relevance_notes: string | null
  is_flagged: boolean
  is_dismissed: boolean
  source?: string
}

interface GrantsResponse {
  grants: Grant[]
  total: number
  offset: number
  limit: number
}

interface CategoryReport {
  categories: { name: string; count: number; high_relevance: number }[]
}

const SOURCES = [
  { value: '', label: 'All Sources' },
  { value: 'GRANTS_GOV', label: 'Grants.gov' },
  { value: 'GRANTEXEC', label: 'GrantExec' },
]

const SORT_OPTIONS = [
  { value: 'relevance_score', label: 'Relevance' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'funding_amount_max', label: 'Funding Amount' },
  { value: 'created_at', label: 'Recently Added' },
]

function formatCurrency(amount: number | null): string {
  if (amount === null) return 'Not specified'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'No deadline'
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const deadline = new Date(dateStr)
  const now = new Date()
  const diff = deadline.getTime() - now.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function RelevanceBar({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-gray-400">Not scored</span>
  const pct = Math.round(score * 100)
  const color = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-500' : 'bg-gray-400'
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-gray-600">{pct}%</span>
    </div>
  )
}

function GrantCard({ grant, onFlag, onDismiss }: {
  grant: Grant
  onFlag: () => void
  onDismiss: () => void
}) {
  const days = daysUntil(grant.deadline)
  const isUrgent = days !== null && days <= 30 && days > 0
  const isPast = days !== null && days < 0

  return (
    <div className={`bg-white rounded-xl border p-5 hover:shadow-md transition-shadow ${grant.is_dismissed ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {grant.is_flagged && <Star className="w-4 h-4 text-amber-500 fill-amber-500 flex-shrink-0" />}
            <Link
              to={`/grants/${grant.id}`}
              className="text-lg font-semibold text-gray-900 hover:text-primary-600 line-clamp-1"
            >
              {grant.title}
            </Link>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-500 mb-3">
            <span className="flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5" />
              <span className="line-clamp-1">{grant.agency}</span>
            </span>
            {grant.source && (
              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                {grant.source === 'GRANTS_GOV' ? 'grants.gov' : grant.source.toLowerCase()}
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600 line-clamp-2 mb-3">{grant.description}</p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1 text-sm">
              <DollarSign className="w-4 h-4 text-green-600" />
              <span className="font-medium">{formatCurrency(grant.funding_amount_max)}</span>
            </span>
            <span className={`flex items-center gap-1 text-sm ${isUrgent ? 'text-red-600 font-medium' : isPast ? 'text-gray-400' : ''}`}>
              <Calendar className="w-4 h-4" />
              {formatDate(grant.deadline)}
              {isUrgent && <span className="text-xs">({days}d left)</span>}
            </span>
            <RelevanceBar score={grant.relevance_score} />
          </div>
          {grant.categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {grant.categories.map(cat => (
                <span key={cat} className="px-2 py-0.5 bg-primary-50 text-primary-700 rounded text-xs">
                  {cat.replace('_', ' ')}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <button
            onClick={onFlag}
            className={`p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-gray-100 ${grant.is_flagged ? 'text-amber-500' : 'text-gray-400'}`}
            title={grant.is_flagged ? 'Remove flag' : 'Flag for review'}
          >
            {grant.is_flagged ? <Star className="w-5 h-5 fill-current" /> : <StarOff className="w-5 h-5" />}
          </button>
          <button
            onClick={onDismiss}
            className={`p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-gray-100 ${grant.is_dismissed ? 'text-gray-600' : 'text-gray-400'}`}
            title={grant.is_dismissed ? 'Restore' : 'Dismiss'}
          >
            <EyeOff className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Discover() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [category, setCategory] = useState('')
  const [source, setSource] = useState('')
  const [minRelevance, setMinRelevance] = useState('')
  const [sortBy, setSortBy] = useState('relevance_score')
  const [sortDesc, setSortDesc] = useState(true)
  const [showDismissed, setShowDismissed] = useState(false)
  const [page, setPage] = useState(0)
  const limit = 20

  // Debounce search
  useState(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  })

  const { data: categories } = useQuery<CategoryReport>({
    queryKey: ['categories'],
    queryFn: () => fetch('/api/v1/reports/categories').then(r => r.json()),
  })

  const { data, isLoading, isFetching } = useQuery<GrantsResponse>({
    queryKey: ['grants', debouncedSearch, category, source, minRelevance, sortBy, sortDesc, showDismissed, page],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (category) params.set('category', category)
      if (source) params.set('source', source)
      if (minRelevance) params.set('min_relevance', minRelevance)
      if (sortBy) params.set('sort_by', sortBy)
      params.set('sort_desc', sortDesc.toString())
      if (!showDismissed) params.set('exclude_dismissed', 'true')
      params.set('offset', (page * limit).toString())
      params.set('limit', limit.toString())
      return fetch(`/api/v1/grants?${params}`).then(r => r.json())
    },
  })

  const flagMutation = useMutation({
    mutationFn: async ({ id, flagged }: { id: string; flagged: boolean }) => {
      const method = flagged ? 'DELETE' : 'POST'
      return fetch(`/api/v1/grants/${id}/flag`, { method }).then(r => r.json())
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['grants'] }),
  })

  const dismissMutation = useMutation({
    mutationFn: async ({ id, dismissed }: { id: string; dismissed: boolean }) => {
      const method = dismissed ? 'DELETE' : 'POST'
      return fetch(`/api/v1/grants/${id}/dismiss`, { method }).then(r => r.json())
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['grants'] }),
  })

  const totalPages = data ? Math.ceil(data.total / limit) : 0

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Discover Grants</h2>
        <p className="text-gray-500 mt-1">
          {data ? `${data.total.toLocaleString()} opportunities available` : 'Loading...'}
        </p>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-xl border p-4 mb-6">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search grants..."
              value={search}
              onChange={e => { setSearch(e.target.value); setDebouncedSearch(e.target.value); setPage(0) }}
              className="w-full pl-10 pr-4 py-2.5 min-h-[44px] border rounded-lg text-base sm:text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {/* Filters row - wraps on mobile */}
          <div className="flex flex-wrap gap-2 w-full lg:w-auto">
            {/* Category Filter */}
            <select
              value={category}
              onChange={e => { setCategory(e.target.value); setPage(0) }}
              className="flex-1 min-w-[140px] border rounded-lg px-3 py-2.5 min-h-[44px] text-sm focus:ring-2 focus:ring-primary-500"
            >
              <option value="">All Categories</option>
              {categories?.categories.map(cat => (
                <option key={cat.name} value={cat.name}>
                  {cat.name.replace('_', ' ')} ({cat.count})
                </option>
              ))}
            </select>

            {/* Source Filter */}
            <select
              value={source}
              onChange={e => { setSource(e.target.value); setPage(0) }}
              className="flex-1 min-w-[120px] border rounded-lg px-3 py-2.5 min-h-[44px] text-sm focus:ring-2 focus:ring-primary-500"
            >
              {SOURCES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>

            {/* Relevance Filter */}
            <select
              value={minRelevance}
              onChange={e => { setMinRelevance(e.target.value); setPage(0) }}
              className="flex-1 min-w-[130px] border rounded-lg px-3 py-2.5 min-h-[44px] text-sm focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Any Relevance</option>
              <option value="0.7">70%+ (High)</option>
              <option value="0.5">50%+ (Medium)</option>
              <option value="0.3">30%+ (Low)</option>
            </select>

            {/* Sort */}
            <div className="flex items-center gap-1 flex-1 min-w-[130px]">
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="flex-1 border rounded-lg px-3 py-2.5 min-h-[44px] text-sm focus:ring-2 focus:ring-primary-500"
              >
                {SORT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <button
                onClick={() => setSortDesc(!sortDesc)}
                className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center border rounded-lg hover:bg-gray-50"
                title={sortDesc ? 'Sort ascending' : 'Sort descending'}
              >
                <ArrowUpDown className={`w-4 h-4 ${sortDesc ? '' : 'rotate-180'}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Additional Filters */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showDismissed}
              onChange={e => setShowDismissed(e.target.checked)}
              className="rounded border-gray-300"
            />
            Show dismissed
          </label>
          <Link to="/grants/flagged" className="text-sm text-primary-600 hover:underline flex items-center gap-1">
            <Star className="w-4 h-4" />
            View flagged grants
          </Link>
        </div>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      ) : data?.grants.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center">
          <Search className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-900">No grants found</h3>
          <p className="text-gray-500 mt-2">Try adjusting your search or filters</p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {data?.grants.map(grant => (
              <GrantCard
                key={grant.id}
                grant={grant}
                onFlag={() => flagMutation.mutate({ id: grant.id, flagged: grant.is_flagged })}
                onDismiss={() => dismissMutation.mutate({ id: grant.id, dismissed: grant.is_dismissed })}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-6 bg-white rounded-xl border px-4 py-3">
              <span className="text-sm text-gray-600 text-center sm:text-left">
                Showing {page * limit + 1}-{Math.min((page + 1) * limit, data?.total || 0)} of {data?.total.toLocaleString()}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-sm px-3">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Loading overlay for refetching */}
      {isFetching && !isLoading && (
        <div className="fixed top-4 right-4 bg-white rounded-lg shadow-lg px-4 py-2 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-primary-600" />
          <span className="text-sm">Updating...</span>
        </div>
      )}
    </div>
  )
}
