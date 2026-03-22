import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText,
  Calendar,
  DollarSign,
  Clock,
  ChevronRight,
  Plus,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Send,
  XCircle,
  Award,
  ArrowLeft,
  Edit3,
  Save,
  X,
  Trash2,
  ExternalLink
} from 'lucide-react'

interface Application {
  id: string
  opportunity_id: string
  project_title: string
  status: 'draft' | 'in_progress' | 'submitted' | 'under_review' | 'awarded' | 'rejected'
  submission_deadline: string | null
  submitted_at: string | null
  requested_amount: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

interface ApplicationDetail extends Application {
  status_history?: { status: string; changed_at: string; notes: string | null }[]
}

interface ApplicationsResponse {
  applications: Application[]
  total: number
}

interface Grant {
  id: string
  title: string
  agency: string
  funding_amount_max: number | null
  deadline: string | null
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: React.ComponentType<{ className?: string }> }> = {
  draft: { label: 'Draft', color: 'text-gray-600', bgColor: 'bg-gray-100', icon: FileText },
  in_progress: { label: 'In Progress', color: 'text-blue-700', bgColor: 'bg-blue-100', icon: Clock },
  submitted: { label: 'Submitted', color: 'text-purple-700', bgColor: 'bg-purple-100', icon: Send },
  under_review: { label: 'Under Review', color: 'text-amber-700', bgColor: 'bg-amber-100', icon: Clock },
  awarded: { label: 'Awarded', color: 'text-green-700', bgColor: 'bg-green-100', icon: Award },
  rejected: { label: 'Rejected', color: 'text-red-700', bgColor: 'bg-red-100', icon: XCircle },
}

const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['in_progress'],
  in_progress: ['submitted', 'draft'],
  submitted: ['under_review'],
  under_review: ['awarded', 'rejected'],
  awarded: [],
  rejected: [],
}

function formatCurrency(amount: number | null): string {
  if (amount === null) return 'Not specified'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Not set'
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return 'Not set'
  const date = new Date(dateStr)
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null
  const deadline = new Date(dateStr)
  const now = new Date()
  const diff = deadline.getTime() - now.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft
  const Icon = config.icon
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bgColor} ${config.color}`}>
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </span>
  )
}

function ApplicationCard({ app, grant }: { app: Application; grant?: Grant }) {
  const days = daysUntil(app.submission_deadline)
  const isUrgent = days !== null && days <= 14 && days > 0

  return (
    <Link
      to={`/applications/${app.id}`}
      className="block bg-white rounded-xl border p-5 hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <StatusBadge status={app.status} />
            {isUrgent && (
              <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
                <AlertTriangle className="w-3.5 h-3.5" />
                {days}d left
              </span>
            )}
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1 line-clamp-1">{app.project_title}</h3>
          {grant && (
            <p className="text-sm text-gray-500 mb-3 line-clamp-1">
              {grant.agency} - {grant.title}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
            {app.requested_amount && (
              <span className="flex items-center gap-1">
                <DollarSign className="w-4 h-4 text-green-600" />
                {formatCurrency(app.requested_amount)}
              </span>
            )}
            {app.submission_deadline && (
              <span className={`flex items-center gap-1 ${isUrgent ? 'text-red-600 font-medium' : ''}`}>
                <Calendar className="w-4 h-4" />
                Due {formatDate(app.submission_deadline)}
              </span>
            )}
            {app.submitted_at && (
              <span className="flex items-center gap-1 text-green-600">
                <CheckCircle className="w-4 h-4" />
                Submitted {formatDate(app.submitted_at)}
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0 mt-2" />
      </div>
    </Link>
  )
}

function ApplicationDetailView({ id }: { id: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState({ project_title: '', requested_amount: '', notes: '' })
  const [statusNote, setStatusNote] = useState('')

  const { data: app, isLoading } = useQuery<ApplicationDetail>({
    queryKey: ['application', id],
    queryFn: () => fetch(`/api/v1/applications/${id}`).then(r => {
      if (!r.ok) throw new Error('Not found')
      return r.json()
    }),
  })

  const { data: grant } = useQuery<Grant>({
    queryKey: ['grant', app?.opportunity_id],
    queryFn: () => fetch(`/api/v1/grants/${app?.opportunity_id}`).then(r => r.json()),
    enabled: !!app?.opportunity_id,
  })

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<Application>) =>
      fetch(`/api/v1/applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['application', id] })
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      setEditing(false)
    },
  })

  const statusMutation = useMutation({
    mutationFn: async ({ status, notes }: { status: string; notes?: string }) =>
      fetch(`/api/v1/applications/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notes }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['application', id] })
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      setStatusNote('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () =>
      fetch(`/api/v1/applications/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['applications'] })
      navigate('/applications')
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  if (!app) {
    return (
      <div className="bg-white rounded-xl border p-8 text-center">
        <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-red-400" />
        <h3 className="text-lg font-medium text-gray-900">Application not found</h3>
        <Link to="/applications" className="mt-4 inline-flex items-center gap-2 text-primary-600 hover:underline">
          <ArrowLeft className="w-4 h-4" />
          Back to Applications
        </Link>
      </div>
    )
  }

  const nextStatuses = STATUS_TRANSITIONS[app.status] || []

  return (
    <div>
      <Link to="/applications" className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4">
        <ArrowLeft className="w-4 h-4" />
        Back to Applications
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <StatusBadge status={app.status} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{app.project_title}</h1>
          {grant && (
            <Link to={`/grants/${grant.id}`} className="text-gray-600 hover:text-primary-600 flex items-center gap-1 mt-1">
              {grant.agency} - {grant.title}
              <ExternalLink className="w-4 h-4" />
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditData({
                project_title: app.project_title,
                requested_amount: app.requested_amount?.toString() || '',
                notes: app.notes || '',
              })
              setEditing(true)
            }}
            className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            <Edit3 className="w-4 h-4" />
            Edit
          </button>
          {app.status === 'draft' && (
            <button
              onClick={() => {
                if (confirm('Delete this application?')) deleteMutation.mutate()
              }}
              className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Details */}
          <div className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Application Details</h3>
            {editing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Project Title</label>
                  <input
                    type="text"
                    value={editData.project_title}
                    onChange={e => setEditData({ ...editData, project_title: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Requested Amount</label>
                  <input
                    type="number"
                    value={editData.requested_amount}
                    onChange={e => setEditData({ ...editData, requested_amount: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500"
                    placeholder="Enter amount"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <textarea
                    value={editData.notes}
                    onChange={e => setEditData({ ...editData, notes: e.target.value })}
                    className="w-full h-32 px-3 py-2 border rounded-lg resize-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Application notes..."
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateMutation.mutate({
                      project_title: editData.project_title,
                      requested_amount: editData.requested_amount ? parseFloat(editData.requested_amount) : null,
                      notes: editData.notes || null,
                    })}
                    disabled={updateMutation.isPending}
                    className="flex items-center gap-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                  >
                    {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Changes
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="flex items-center gap-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-gray-500">Requested Amount</div>
                  <div className="font-semibold text-green-600">{formatCurrency(app.requested_amount)}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Deadline</div>
                  <div className="font-semibold">{formatDate(app.submission_deadline)}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Created</div>
                  <div>{formatDateTime(app.created_at)}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Last Updated</div>
                  <div>{formatDateTime(app.updated_at)}</div>
                </div>
                {app.submitted_at && (
                  <div className="col-span-2">
                    <div className="text-sm text-gray-500">Submitted</div>
                    <div className="text-green-600 font-medium">{formatDateTime(app.submitted_at)}</div>
                  </div>
                )}
                {app.notes && (
                  <div className="col-span-2">
                    <div className="text-sm text-gray-500 mb-1">Notes</div>
                    <p className="text-gray-700 whitespace-pre-wrap">{app.notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Status History */}
          {app.status_history && app.status_history.length > 0 && (
            <div className="bg-white rounded-xl border p-5">
              <h3 className="font-semibold text-gray-900 mb-4">Status History</h3>
              <div className="space-y-3">
                {app.status_history.map((entry, i) => {
                  const config = STATUS_CONFIG[entry.status] || STATUS_CONFIG.draft
                  return (
                    <div key={i} className="flex items-start gap-3">
                      <div className={`p-1.5 rounded-full ${config.bgColor}`}>
                        <config.icon className={`w-4 h-4 ${config.color}`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{config.label}</span>
                          <span className="text-sm text-gray-500">{formatDateTime(entry.changed_at)}</span>
                        </div>
                        {entry.notes && <p className="text-sm text-gray-600 mt-0.5">{entry.notes}</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status Actions */}
          {nextStatuses.length > 0 && (
            <div className="bg-white rounded-xl border p-5">
              <h3 className="font-semibold text-gray-900 mb-3">Update Status</h3>
              <div className="space-y-3">
                <textarea
                  value={statusNote}
                  onChange={e => setStatusNote(e.target.value)}
                  placeholder="Optional note about this status change..."
                  className="w-full h-20 px-3 py-2 border rounded-lg resize-none text-sm focus:ring-2 focus:ring-primary-500"
                />
                <div className="space-y-2">
                  {nextStatuses.map(status => {
                    const config = STATUS_CONFIG[status]
                    return (
                      <button
                        key={status}
                        onClick={() => statusMutation.mutate({ status, notes: statusNote || undefined })}
                        disabled={statusMutation.isPending}
                        className={`flex items-center gap-2 w-full px-4 py-2.5 rounded-lg border ${config.bgColor} ${config.color} hover:opacity-80 disabled:opacity-50`}
                      >
                        {statusMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <config.icon className="w-4 h-4" />
                        )}
                        Move to {config.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Grant Info */}
          {grant && (
            <div className="bg-white rounded-xl border p-5">
              <h3 className="font-semibold text-gray-900 mb-3">Grant Details</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-gray-500">Agency</div>
                  <div className="font-medium">{grant.agency}</div>
                </div>
                <div>
                  <div className="text-gray-500">Max Funding</div>
                  <div className="font-medium text-green-600">{formatCurrency(grant.funding_amount_max)}</div>
                </div>
                <div>
                  <div className="text-gray-500">Grant Deadline</div>
                  <div className="font-medium">{formatDate(grant.deadline)}</div>
                </div>
                <Link
                  to={`/grants/${grant.id}`}
                  className="flex items-center gap-1 text-primary-600 hover:underline pt-2"
                >
                  View Full Grant Details
                  <ExternalLink className="w-4 h-4" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Applications() {
  const { id } = useParams<{ id: string }>()
  const [filter, setFilter] = useState<string>('')

  const { data, isLoading } = useQuery<ApplicationsResponse>({
    queryKey: ['applications', filter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filter) params.set('status', filter)
      return fetch(`/api/v1/applications?${params}`).then(r => r.json())
    },
  })

  // Fetch grants for application cards
  const opportunityIds = data?.applications.map(a => a.opportunity_id).filter(Boolean) || []
  const { data: grantsData } = useQuery<{ grants: Grant[] }>({
    queryKey: ['grants-for-apps', opportunityIds],
    queryFn: async () => {
      if (opportunityIds.length === 0) return { grants: [] }
      // Fetch all grants - in production you'd batch this
      const responses = await Promise.all(
        [...new Set(opportunityIds)].slice(0, 10).map(id =>
          fetch(`/api/v1/grants/${id}`).then(r => r.ok ? r.json() : null)
        )
      )
      return { grants: responses.filter(Boolean) }
    },
    enabled: opportunityIds.length > 0,
  })

  const grantsMap = new Map(grantsData?.grants.map(g => [g.id, g]) || [])

  if (id) {
    return <ApplicationDetailView id={id} />
  }

  const statusCounts = data?.applications.reduce((acc, app) => {
    acc[app.status] = (acc[app.status] || 0) + 1
    return acc
  }, {} as Record<string, number>) || {}

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Applications</h2>
          <p className="text-gray-500 mt-1">
            {data ? `${data.total} application${data.total !== 1 ? 's' : ''}` : 'Loading...'}
          </p>
        </div>
        <Link
          to="/discover"
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          <Plus className="w-4 h-4" />
          Find Grants
        </Link>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
        <button
          onClick={() => setFilter('')}
          className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
            filter === '' ? 'bg-primary-100 text-primary-800' : 'bg-white border hover:bg-gray-50'
          }`}
        >
          All ({data?.total || 0})
        </button>
        {Object.entries(STATUS_CONFIG).map(([status, config]) => {
          const count = statusCounts[status] || 0
          if (count === 0 && filter !== status) return null
          return (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
                filter === status ? `${config.bgColor} ${config.color}` : 'bg-white border hover:bg-gray-50'
              }`}
            >
              <config.icon className="w-4 h-4" />
              {config.label} ({count})
            </button>
          )
        })}
      </div>

      {/* Applications List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      ) : data?.applications.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center">
          <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-900">No applications yet</h3>
          <p className="text-gray-500 mt-2 max-w-md mx-auto">
            Start by discovering grants that match Nexus Center's needs, then create applications to track your progress.
          </p>
          <Link
            to="/discover"
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            <Plus className="w-4 h-4" />
            Discover Grants
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {data?.applications.map(app => (
            <ApplicationCard key={app.id} app={app} grant={grantsMap.get(app.opportunity_id)} />
          ))}
        </div>
      )}
    </div>
  )
}
