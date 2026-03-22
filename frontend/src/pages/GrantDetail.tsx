import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Building2,
  ExternalLink,
  Star,
  StarOff,
  EyeOff,
  Eye,
  FileText,
  Tag,
  Clock,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Plus,
  Edit3,
  Save,
  X
} from 'lucide-react'

interface GrantDetail {
  id: string
  title: string
  agency: string
  description: string
  funding_amount_min: number | null
  funding_amount_max: number | null
  deadline: string | null
  status: string
  categories: string[]
  eligibility: string | null
  requirements: object | null
  source: string
  source_url: string | null
  relevance_score: number | null
  relevance_notes: string | null
  is_flagged: boolean
  is_dismissed: boolean
  user_notes: string | null
  created_at: string
}

function formatCurrency(amount: number | null): string {
  if (amount === null) return 'Not specified'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Not specified'
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const deadline = new Date(dateStr)
  const now = new Date()
  const diff = deadline.getTime() - now.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function DeadlineStatus({ deadline }: { deadline: string | null }) {
  const days = daysUntil(deadline)
  if (days === null) return null

  if (days < 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg">
        <Clock className="w-4 h-4 text-gray-500" />
        <span className="text-sm text-gray-600">Deadline passed {Math.abs(days)} days ago</span>
      </div>
    )
  }
  if (days <= 7) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-lg">
        <AlertTriangle className="w-4 h-4 text-red-600" />
        <span className="text-sm font-medium text-red-700">{days} days remaining - Act now!</span>
      </div>
    )
  }
  if (days <= 30) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg">
        <Clock className="w-4 h-4 text-amber-600" />
        <span className="text-sm font-medium text-amber-700">{days} days remaining</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg">
      <CheckCircle className="w-4 h-4 text-green-600" />
      <span className="text-sm text-green-700">{days} days remaining</span>
    </div>
  )
}

function RelevanceScore({ score, notes }: { score: number | null; notes: string | null }) {
  if (score === null) return null
  const pct = Math.round(score * 100)
  const color = pct >= 70 ? 'text-green-600' : pct >= 40 ? 'text-amber-600' : 'text-gray-500'
  const bgColor = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-500' : 'bg-gray-400'

  return (
    <div className="bg-white rounded-xl border p-5">
      <h3 className="font-semibold text-gray-900 mb-3">Relevance Score</h3>
      <div className="flex items-center gap-4 mb-3">
        <div className={`text-4xl font-bold ${color}`}>{pct}%</div>
        <div className="flex-1">
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div className={`h-full ${bgColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
      {notes && (
        <p className="text-sm text-gray-600">{notes}</p>
      )}
    </div>
  )
}

export default function GrantDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editingNotes, setEditingNotes] = useState(false)
  const [notes, setNotes] = useState('')

  const { data: grant, isLoading, error } = useQuery<GrantDetail>({
    queryKey: ['grant', id],
    queryFn: () => fetch(`/api/v1/grants/${id}`).then(r => {
      if (!r.ok) throw new Error('Grant not found')
      return r.json()
    }),
    enabled: !!id,
  })

  const flagMutation = useMutation({
    mutationFn: async (flagged: boolean) => {
      const method = flagged ? 'DELETE' : 'POST'
      return fetch(`/api/v1/grants/${id}/flag`, { method }).then(r => r.json())
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grant', id] })
      queryClient.invalidateQueries({ queryKey: ['grants'] })
    },
  })

  const dismissMutation = useMutation({
    mutationFn: async (dismissed: boolean) => {
      const method = dismissed ? 'DELETE' : 'POST'
      return fetch(`/api/v1/grants/${id}/dismiss`, { method }).then(r => r.json())
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grant', id] })
      queryClient.invalidateQueries({ queryKey: ['grants'] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (data: { user_notes: string }) => {
      return fetch(`/api/v1/grants/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json())
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grant', id] })
      setEditingNotes(false)
    },
  })

  const createApplicationMutation = useMutation({
    mutationFn: async () => {
      return fetch('/api/v1/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunity_id: id,
          project_title: `Application for ${grant?.title}`,
        }),
      }).then(r => r.json())
    },
    onSuccess: (data) => {
      navigate(`/applications/${data.id}`)
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  if (error || !grant) {
    return (
      <div className="bg-white rounded-xl border p-8 text-center">
        <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-red-400" />
        <h3 className="text-lg font-medium text-gray-900">Grant not found</h3>
        <p className="text-gray-500 mt-2">This grant may have been removed or the ID is invalid.</p>
        <Link to="/discover" className="mt-4 inline-flex items-center gap-2 text-primary-600 hover:underline">
          <ArrowLeft className="w-4 h-4" />
          Back to Discover
        </Link>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link to="/discover" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4">
          <ArrowLeft className="w-4 h-4" />
          Back to Discover
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              {grant.is_flagged && <Star className="w-6 h-6 text-amber-500 fill-amber-500 flex-shrink-0" />}
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 break-words">{grant.title}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-gray-600 text-sm">
              <span className="flex items-center gap-1">
                <Building2 className="w-4 h-4 flex-shrink-0" />
                <span className="break-words">{grant.agency}</span>
              </span>
              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs sm:text-sm">
                {grant.source === 'GRANTS_GOV' ? 'grants.gov' : grant.source.toLowerCase()}
              </span>
              {grant.source_url && (
                <a
                  href={grant.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary-600 hover:underline"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span className="hidden sm:inline">View Original</span>
                  <span className="sm:hidden">Original</span>
                </a>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => flagMutation.mutate(grant.is_flagged)}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 min-h-[44px] rounded-lg border text-sm ${
                grant.is_flagged
                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                  : 'hover:bg-gray-50'
              }`}
            >
              {grant.is_flagged ? <Star className="w-4 h-4 fill-current" /> : <StarOff className="w-4 h-4" />}
              {grant.is_flagged ? 'Flagged' : 'Flag'}
            </button>
            <button
              onClick={() => dismissMutation.mutate(grant.is_dismissed)}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 min-h-[44px] rounded-lg border text-sm ${
                grant.is_dismissed
                  ? 'bg-gray-100 text-gray-600'
                  : 'hover:bg-gray-50'
              }`}
            >
              {grant.is_dismissed ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              {grant.is_dismissed ? 'Restore' : 'Dismiss'}
            </button>
            <button
              onClick={() => createApplicationMutation.mutate()}
              disabled={createApplicationMutation.isPending}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 min-h-[44px] rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 text-sm w-full sm:w-auto justify-center"
            >
              {createApplicationMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Start Application
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Key Details */}
          <div className="bg-white rounded-xl border p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-gray-500 mb-1">Funding Amount</div>
                <div className="font-semibold text-lg text-green-600">
                  {formatCurrency(grant.funding_amount_max)}
                </div>
                {grant.funding_amount_min && (
                  <div className="text-xs text-gray-500">
                    Min: {formatCurrency(grant.funding_amount_min)}
                  </div>
                )}
              </div>
              <div>
                <div className="text-sm text-gray-500 mb-1">Deadline</div>
                <div className="font-semibold">{formatDate(grant.deadline)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500 mb-1">Status</div>
                <div className={`inline-flex items-center gap-1 px-2 py-1 rounded text-sm font-medium ${
                  grant.status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {grant.status}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500 mb-1">Added</div>
                <div className="text-sm">{formatDate(grant.created_at)}</div>
              </div>
            </div>
            <div className="mt-4">
              <DeadlineStatus deadline={grant.deadline} />
            </div>
          </div>

          {/* Description */}
          <div className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Description</h3>
            <p className="text-gray-700 whitespace-pre-wrap">{grant.description}</p>
          </div>

          {/* Eligibility */}
          {grant.eligibility && (
            <div className="bg-white rounded-xl border p-5">
              <h3 className="font-semibold text-gray-900 mb-3">Eligibility</h3>
              <p className="text-gray-700 whitespace-pre-wrap">{grant.eligibility}</p>
            </div>
          )}

          {/* Categories */}
          {grant.categories.length > 0 && (
            <div className="bg-white rounded-xl border p-5">
              <h3 className="font-semibold text-gray-900 mb-3">Categories</h3>
              <div className="flex flex-wrap gap-2">
                {grant.categories.map(cat => (
                  <span key={cat} className="flex items-center gap-1 px-3 py-1.5 bg-primary-50 text-primary-700 rounded-lg">
                    <Tag className="w-4 h-4" />
                    {cat.replace('_', ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Relevance Score */}
          <RelevanceScore score={grant.relevance_score} notes={grant.relevance_notes} />

          {/* User Notes */}
          <div className="bg-white rounded-xl border p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">Notes</h3>
              {!editingNotes && (
                <button
                  onClick={() => { setNotes(grant.user_notes || ''); setEditingNotes(true) }}
                  className="p-1.5 hover:bg-gray-100 rounded"
                >
                  <Edit3 className="w-4 h-4 text-gray-500" />
                </button>
              )}
            </div>
            {editingNotes ? (
              <div className="space-y-3">
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Add notes about this grant..."
                  className="w-full h-32 px-3 py-2.5 min-h-[44px] text-base sm:text-sm border rounded-lg resize-none focus:ring-2 focus:ring-primary-500"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateMutation.mutate({ user_notes: notes })}
                    disabled={updateMutation.isPending}
                    className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50"
                  >
                    {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save
                  </button>
                  <button
                    onClick={() => setEditingNotes(false)}
                    className="flex items-center gap-1 px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50"
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </button>
                </div>
              </div>
            ) : grant.user_notes ? (
              <p className="text-gray-700 whitespace-pre-wrap">{grant.user_notes}</p>
            ) : (
              <p className="text-gray-400 italic">No notes added yet</p>
            )}
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-gray-900 mb-3">Quick Actions</h3>
            <div className="space-y-2">
              {grant.source_url && (
                <a
                  href={grant.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 w-full px-4 py-2.5 min-h-[44px] border rounded-lg hover:bg-gray-50 text-left"
                >
                  <ExternalLink className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <span>View on {grant.source === 'GRANTS_GOV' ? 'grants.gov' : 'Source'}</span>
                </a>
              )}
              <button
                onClick={() => createApplicationMutation.mutate()}
                disabled={createApplicationMutation.isPending}
                className="flex items-center gap-2 w-full px-4 py-2.5 min-h-[44px] bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100"
              >
                <FileText className="w-4 h-4 flex-shrink-0" />
                <span>Start Application</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
