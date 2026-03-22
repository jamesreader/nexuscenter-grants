import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  DollarSign,
  Search,
  FileText,
  Clock,
  TrendingUp,
  AlertTriangle,
  Calendar,
  Tag,
  Star,
  ArrowRight,
  Loader2,
  CheckCircle
} from 'lucide-react'

interface Stats {
  grants_open: number
  grants_total: number
  applications_in_progress: number
  applications_awarded: number
  total_awarded: number
  upcoming_deadlines: number
}

interface DeadlineGrant {
  id: string
  title: string
  agency: string
  deadline: string
  days_remaining: number
  funding_max: number | null
  relevance_score: number | null
  is_flagged: boolean
}

interface DeadlinesReport {
  period_days: number
  count: number
  deadlines: DeadlineGrant[]
}

interface CategoryData {
  name: string
  count: number
  high_relevance: number
}

interface CategoriesReport {
  categories: CategoryData[]
}

interface PipelineReport {
  grants: Record<string, number>
  applications: Record<string, number>
  high_relevance_open: number
  flagged: number
  upcoming_deadlines_30d: number
}

function formatCurrency(amount: number | null): string {
  if (amount === null || amount === 0) return '$0'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
}

function StatCard({ icon: Icon, label, value, color, subtext }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  color: string
  subtext?: string
}) {
  return (
    <div className="bg-white rounded-xl border p-5">
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-lg ${color}`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="text-2xl font-bold text-gray-900">{value}</div>
          <div className="text-sm text-gray-500">{label}</div>
          {subtext && <div className="text-xs text-gray-400 mt-0.5">{subtext}</div>}
        </div>
      </div>
    </div>
  )
}

function DeadlineCard({ grant }: { grant: DeadlineGrant }) {
  const isUrgent = grant.days_remaining <= 7
  const isWarning = grant.days_remaining <= 14

  return (
    <Link
      to={`/grants/${grant.id}`}
      className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-900 truncate">{grant.title}</div>
        <div className="text-sm text-gray-500 truncate">{grant.agency}</div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0 ml-4">
        {grant.funding_max && (
          <span className="text-sm text-green-600 font-medium">
            {formatCurrency(grant.funding_max)}
          </span>
        )}
        <span className={`flex items-center gap-1 text-sm font-medium px-2 py-1 rounded ${
          isUrgent ? 'bg-red-100 text-red-700' :
          isWarning ? 'bg-amber-100 text-amber-700' :
          'bg-gray-100 text-gray-600'
        }`}>
          <Clock className="w-3.5 h-3.5" />
          {grant.days_remaining}d
        </span>
      </div>
    </Link>
  )
}

function CategoryBar({ category, maxCount }: { category: CategoryData; maxCount: number }) {
  const pct = maxCount > 0 ? (category.count / maxCount) * 100 : 0
  const highPct = category.count > 0 ? (category.high_relevance / category.count) * 100 : 0

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-700 capitalize">{category.name.replace('_', ' ')}</span>
        <span className="text-gray-500">{category.count} grants</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary-500 rounded-full relative"
          style={{ width: `${pct}%` }}
        >
          {highPct > 0 && (
            <div
              className="absolute right-0 top-0 h-full bg-green-500 rounded-r-full"
              style={{ width: `${highPct}%` }}
            />
          )}
        </div>
      </div>
      <div className="text-xs text-gray-400">
        {category.high_relevance} high relevance
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: () => fetch('/api/v1/stats').then(r => r.json()),
  })

  const { data: deadlines } = useQuery<DeadlinesReport>({
    queryKey: ['deadlines'],
    queryFn: () => fetch('/api/v1/reports/deadlines?days=30&limit=5').then(r => r.json()),
  })

  const { data: categories } = useQuery<CategoriesReport>({
    queryKey: ['categories'],
    queryFn: () => fetch('/api/v1/reports/categories').then(r => r.json()),
  })

  const { data: pipeline } = useQuery<PipelineReport>({
    queryKey: ['pipeline'],
    queryFn: () => fetch('/api/v1/reports/pipeline').then(r => r.json()),
  })

  const categoryList = categories?.categories || []
  const maxCategoryCount = categoryList.length > 0 ? Math.max(...categoryList.map(c => c.count)) : 1
  const urgentCount = deadlines?.deadlines?.filter(d => d.days_remaining <= 14).length || 0

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-warm-400 mt-1">Grant funding overview for Nexus Center for IDD Care</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={Search}
          label="Grants Available"
          value={stats?.grants_open ?? 0}
          color="bg-blue-500"
          subtext={`${stats?.grants_total ?? 0} total tracked`}
        />
        <StatCard
          icon={FileText}
          label="Active Applications"
          value={stats?.applications_in_progress ?? 0}
          color="bg-amber-500"
          subtext={pipeline ? `${pipeline.high_relevance_open} high relevance` : undefined}
        />
        <StatCard
          icon={DollarSign}
          label="Total Awarded"
          value={formatCurrency(stats?.total_awarded ?? 0)}
          color="bg-green-500"
          subtext={stats?.applications_awarded ? `${stats.applications_awarded} grants` : undefined}
        />
        <StatCard
          icon={Clock}
          label="Upcoming Deadlines"
          value={stats?.upcoming_deadlines ?? 0}
          color="bg-red-500"
          subtext={urgentCount > 0 ? `${urgentCount} urgent (< 14d)` : undefined}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Deadlines */}
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-red-500" />
              Upcoming Deadlines
            </h3>
            <Link to="/discover?sort_by=deadline&sort_desc=false" className="text-sm text-primary-600 hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          {!deadlines?.deadlines || deadlines.deadlines.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No upcoming deadlines in the next 30 days</p>
          ) : (
            <div className="divide-y">
              {deadlines.deadlines.slice(0, 5).map(grant => (
                <DeadlineCard key={grant.id} grant={grant} />
              ))}
            </div>
          )}
        </div>

        {/* Categories Overview */}
        <div className="bg-white rounded-xl border p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Tag className="w-5 h-5 text-primary-500" />
              Grants by Category
            </h3>
            <Link to="/discover" className="text-sm text-primary-600 hover:underline flex items-center gap-1">
              Browse <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          {categoryList.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No category data available</p>
          ) : (
            <div className="space-y-4">
              {categoryList.slice(0, 5).map(cat => (
                <CategoryBar key={cat.name} category={cat} maxCount={maxCategoryCount} />
              ))}
            </div>
          )}
        </div>

        {/* Application Pipeline */}
        {pipeline && (pipeline.applications.in_progress > 0 || pipeline.applications.submitted > 0 || pipeline.applications.under_review > 0) && (
          <div className="bg-white rounded-xl border p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-amber-500" />
                Application Pipeline
              </h3>
              <Link to="/applications" className="text-sm text-primary-600 hover:underline flex items-center gap-1">
                Manage <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="flex items-center gap-2">
              {pipeline.applications.draft > 0 && (
                <div className="flex-1 text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-xl font-bold text-gray-600">{pipeline.applications.draft}</div>
                  <div className="text-xs text-gray-500">Draft</div>
                </div>
              )}
              {pipeline.applications.in_progress > 0 && (
                <>
                  <ArrowRight className="w-4 h-4 text-gray-300" />
                  <div className="flex-1 text-center p-3 bg-blue-50 rounded-lg">
                    <div className="text-xl font-bold text-blue-600">{pipeline.applications.in_progress}</div>
                    <div className="text-xs text-blue-600">In Progress</div>
                  </div>
                </>
              )}
              {pipeline.applications.submitted > 0 && (
                <>
                  <ArrowRight className="w-4 h-4 text-gray-300" />
                  <div className="flex-1 text-center p-3 bg-purple-50 rounded-lg">
                    <div className="text-xl font-bold text-purple-600">{pipeline.applications.submitted}</div>
                    <div className="text-xs text-purple-600">Submitted</div>
                  </div>
                </>
              )}
              {pipeline.applications.under_review > 0 && (
                <>
                  <ArrowRight className="w-4 h-4 text-gray-300" />
                  <div className="flex-1 text-center p-3 bg-amber-50 rounded-lg">
                    <div className="text-xl font-bold text-amber-600">{pipeline.applications.under_review}</div>
                    <div className="text-xs text-amber-600">Under Review</div>
                  </div>
                </>
              )}
              {pipeline.applications.awarded > 0 && (
                <>
                  <ArrowRight className="w-4 h-4 text-gray-300" />
                  <div className="flex-1 text-center p-3 bg-green-50 rounded-lg">
                    <div className="text-xl font-bold text-green-600">{pipeline.applications.awarded}</div>
                    <div className="text-xs text-green-600">Awarded</div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <Star className="w-5 h-5 text-amber-500" />
            Quick Actions
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <Link
              to="/discover?min_relevance=0.7"
              className="flex items-center gap-2 p-3 rounded-lg border hover:bg-gray-50 transition-colors"
            >
              <CheckCircle className="w-5 h-5 text-green-500" />
              <div>
                <div className="font-medium text-gray-900">High Relevance</div>
                <div className="text-xs text-gray-500">View top matches</div>
              </div>
            </Link>
            <Link
              to="/discover?sort_by=deadline&sort_desc=false"
              className="flex items-center gap-2 p-3 rounded-lg border hover:bg-gray-50 transition-colors"
            >
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <div>
                <div className="font-medium text-gray-900">Urgent Deadlines</div>
                <div className="text-xs text-gray-500">Closing soon</div>
              </div>
            </Link>
            <Link
              to="/discover"
              className="flex items-center gap-2 p-3 rounded-lg border hover:bg-gray-50 transition-colors"
            >
              <Star className="w-5 h-5 text-amber-500" />
              <div>
                <div className="font-medium text-gray-900">Flagged Grants</div>
                <div className="text-xs text-gray-500">{pipeline?.flagged || 0} flagged</div>
              </div>
            </Link>
            <Link
              to="/applications"
              className="flex items-center gap-2 p-3 rounded-lg border hover:bg-gray-50 transition-colors"
            >
              <FileText className="w-5 h-5 text-blue-500" />
              <div>
                <div className="font-medium text-gray-900">Applications</div>
                <div className="text-xs text-gray-500">Track progress</div>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
