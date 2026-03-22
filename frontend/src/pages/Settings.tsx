import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Settings as SettingsIcon,
  Upload,
  FileText,
  Clock,
  CheckCircle,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  Loader2,
  RefreshCw,
  History,
  Sliders,
  Plus,
  X,
  Save
} from 'lucide-react'

interface OrgProfile {
  id: string
  version: number
  title: string
  content: string
  summary: string | null
  is_active: boolean
  changed_by: string | null
  change_notes: string | null
  relevance_rules: Record<string, unknown> | null
  rules_generated_at: string | null
  created_at: string
  updated_at: string
}

interface ProfileVersion {
  id: string
  version: number
  title: string
  summary: string | null
  changed_by: string | null
  change_notes: string | null
  is_active: boolean
  created_at: string
}

interface RelevanceRules {
  high_priority_keywords: string[]
  medium_priority_keywords: string[]
  low_priority_keywords: string[]
  negative_keywords: string[]
  relevant_categories: string[]
  relevant_agencies: string[]
  geographic_keywords: string[]
  population_keywords: string[]
  min_preferred_funding: number
  max_preferred_funding: number
}

interface RulesResponse {
  rules: RelevanceRules
  generated_at: string | null
  profile_version: number
}

interface UploadResponse {
  status: string
  message: string
  version: number
  id: string
  title?: string
  content_preview?: string
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Editable keyword list component
function KeywordList({
  title,
  description,
  keywords,
  onChange,
  color = 'primary'
}: {
  title: string
  description: string
  keywords: string[]
  onChange: (keywords: string[]) => void
  color?: 'primary' | 'green' | 'amber' | 'red' | 'blue' | 'purple'
}) {
  const [newKeyword, setNewKeyword] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)

  const colorClasses = {
    primary: 'bg-primary-100 text-primary-800 border-primary-200',
    green: 'bg-green-100 text-green-800 border-green-200',
    amber: 'bg-amber-100 text-amber-800 border-amber-200',
    red: 'bg-red-100 text-red-800 border-red-200',
    blue: 'bg-blue-100 text-blue-800 border-blue-200',
    purple: 'bg-purple-100 text-purple-800 border-purple-200',
  }

  const handleAdd = () => {
    if (newKeyword.trim() && !keywords.includes(newKeyword.trim().toLowerCase())) {
      onChange([...keywords, newKeyword.trim().toLowerCase()])
      setNewKeyword('')
    }
  }

  const handleRemove = (keyword: string) => {
    onChange(keywords.filter(k => k !== keyword))
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAdd()
    }
  }

  return (
    <div className="border rounded-lg">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-gray-50"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
          <div className="text-left">
            <p className="font-medium text-gray-900">{title}</p>
            <p className="text-xs text-gray-500">{description}</p>
          </div>
        </div>
        <span className="text-sm text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
          {keywords.length}
        </span>
      </button>

      {isExpanded && (
        <div className="p-3 border-t bg-gray-50">
          {/* Add new keyword */}
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Add keyword..."
              className="flex-1 px-3 py-2 min-h-[44px] text-base sm:text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <button
              onClick={handleAdd}
              disabled={!newKeyword.trim()}
              className="px-3 py-2 min-w-[44px] min-h-[44px] flex items-center justify-center bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Keywords */}
          <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
            {keywords.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No keywords</p>
            ) : (
              keywords.map((keyword) => (
                <span
                  key={keyword}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded border ${colorClasses[color]}`}
                >
                  {keyword}
                  <button
                    onClick={() => handleRemove(keyword)}
                    className="hover:opacity-70"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Settings() {
  const queryClient = useQueryClient()
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null)
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [uploadMessage, setUploadMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null)
  const [editedRules, setEditedRules] = useState<RelevanceRules | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Fetch current profile
  const { data: profile, isLoading: profileLoading, error: profileError } = useQuery<OrgProfile>({
    queryKey: ['org-profile'],
    queryFn: () => fetch('/api/v1/org/profile').then(r => {
      if (r.status === 404) return null
      if (!r.ok) throw new Error('Failed to load profile')
      return r.json()
    }),
  })

  // Fetch rules
  const { data: rulesData } = useQuery<RulesResponse>({
    queryKey: ['scoring-rules'],
    queryFn: () => fetch('/api/v1/scoring/rules').then(r => {
      if (r.status === 404) return null
      if (!r.ok) throw new Error('Failed to load rules')
      return r.json()
    }),
    enabled: !!profile?.relevance_rules,
  })

  // Initialize edited rules when data loads
  const rules = editedRules || rulesData?.rules

  // Fetch version history
  const { data: versions } = useQuery<{ versions: ProfileVersion[] }>({
    queryKey: ['profile-versions'],
    queryFn: () => fetch('/api/v1/org/profile/versions?limit=20').then(r => r.json()),
  })

  // Fetch specific version when selected
  const { data: versionDetail, isLoading: versionLoading } = useQuery<OrgProfile>({
    queryKey: ['profile-version', selectedVersion],
    queryFn: () => fetch(`/api/v1/org/profile/versions/${selectedVersion}`).then(r => r.json()),
    enabled: selectedVersion !== null,
  })

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('changed_by', 'web-upload')
      formData.append('change_notes', `Uploaded ${file.name}`)

      const response = await fetch('/api/v1/org/profile/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Upload failed')
      }

      return response.json() as Promise<UploadResponse>
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['org-profile'] })
      queryClient.invalidateQueries({ queryKey: ['profile-versions'] })
      queryClient.invalidateQueries({ queryKey: ['scoring-rules'] })
      setEditedRules(null)
      setHasUnsavedChanges(false)

      if (data.status === 'unchanged') {
        setUploadMessage({ type: 'info', text: data.message })
      } else {
        setUploadMessage({ type: 'success', text: data.message })
      }
    },
    onError: (error: Error) => {
      setUploadMessage({ type: 'error', text: error.message })
    },
  })

  // Regenerate rules mutation
  const regenerateRulesMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/v1/scoring/generate-rules', { method: 'POST' })
      if (!response.ok) throw new Error('Failed to generate rules')
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-profile'] })
      queryClient.invalidateQueries({ queryKey: ['scoring-rules'] })
      setEditedRules(null)
      setHasUnsavedChanges(false)
      setUploadMessage({ type: 'success', text: 'Relevance rules regenerated successfully' })
    },
    onError: (error: Error) => {
      setUploadMessage({ type: 'error', text: `Failed to regenerate rules: ${error.message}` })
    },
  })

  // Save rules mutation
  const saveRulesMutation = useMutation({
    mutationFn: async (rules: RelevanceRules) => {
      const response = await fetch('/api/v1/scoring/rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rules),
      })
      if (!response.ok) throw new Error('Failed to save rules')
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-profile'] })
      queryClient.invalidateQueries({ queryKey: ['scoring-rules'] })
      setHasUnsavedChanges(false)
      setUploadMessage({ type: 'success', text: 'Rules saved successfully' })
    },
    onError: (error: Error) => {
      setUploadMessage({ type: 'error', text: `Failed to save rules: ${error.message}` })
    },
  })

  // Score all grants mutation
  const scoreAllMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/v1/scoring/score-all', { method: 'POST' })
      if (!response.ok) throw new Error('Failed to score grants')
      return response.json()
    },
    onSuccess: (data) => {
      setUploadMessage({ type: 'success', text: `Scored ${data.scored} grants` })
    },
    onError: (error: Error) => {
      setUploadMessage({ type: 'error', text: `Failed to score grants: ${error.message}` })
    },
  })

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      if (!file.name.endsWith('.docx')) {
        setUploadMessage({ type: 'error', text: 'Only .docx files are supported' })
        return
      }
      setUploadMessage(null)
      uploadMutation.mutate(file)
    }
  }

  const updateRuleField = (field: keyof RelevanceRules, value: string[] | number) => {
    const currentRules = editedRules || rulesData?.rules
    if (!currentRules) return

    const newRules = { ...currentRules, [field]: value }
    setEditedRules(newRules)
    setHasUnsavedChanges(true)
  }

  const handleSaveRules = () => {
    if (editedRules) {
      saveRulesMutation.mutate(editedRules)
    }
  }

  const handleDiscardChanges = () => {
    setEditedRules(null)
    setHasUnsavedChanges(false)
  }

  // Version comparison view
  if (selectedVersion !== null) {
    return (
      <div>
        <button
          onClick={() => setSelectedVersion(null)}
          className="flex items-center gap-2 text-primary-600 hover:text-primary-800 mb-4 min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Settings
        </button>

        {versionLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          </div>
        ) : versionDetail ? (
          <div className="bg-white rounded-xl border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Version {versionDetail.version}</h2>
              {versionDetail.is_active && (
                <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                  Active
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 text-sm">
              <div>
                <span className="text-gray-500">Title:</span>
                <p className="font-medium">{versionDetail.title}</p>
              </div>
              <div>
                <span className="text-gray-500">Created:</span>
                <p className="font-medium">{formatDate(versionDetail.created_at)}</p>
              </div>
              <div>
                <span className="text-gray-500">Changed by:</span>
                <p className="font-medium">{versionDetail.changed_by || 'Unknown'}</p>
              </div>
              <div>
                <span className="text-gray-500">Notes:</span>
                <p className="font-medium">{versionDetail.change_notes || 'None'}</p>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="font-medium text-gray-900 mb-2">Content</h3>
              <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono">
                  {versionDetail.content}
                </pre>
              </div>
            </div>

            {versionDetail.relevance_rules && (
              <div className="border-t pt-4 mt-4">
                <h3 className="font-medium text-gray-900 mb-2">Relevance Rules</h3>
                <p className="text-sm text-gray-500 mb-2">
                  Generated: {versionDetail.rules_generated_at ? formatDate(versionDetail.rules_generated_at) : 'Never'}
                </p>
                <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
                  <pre className="whitespace-pre-wrap text-xs text-gray-600 font-mono">
                    {JSON.stringify(versionDetail.relevance_rules, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-500">Version not found</p>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <SettingsIcon className="w-6 h-6" />
          Settings
        </h2>
        <p className="text-gray-500 mt-1">Manage organization profile and relevance scoring</p>
      </div>

      {/* Upload Status Message */}
      {uploadMessage && (
        <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
          uploadMessage.type === 'success' ? 'bg-green-50 text-green-800' :
          uploadMessage.type === 'error' ? 'bg-red-50 text-red-800' :
          'bg-blue-50 text-blue-800'
        }`}>
          {uploadMessage.type === 'success' ? (
            <CheckCircle className="w-5 h-5" />
          ) : uploadMessage.type === 'error' ? (
            <AlertTriangle className="w-5 h-5" />
          ) : (
            <FileText className="w-5 h-5" />
          )}
          <span>{uploadMessage.text}</span>
          <button
            onClick={() => setUploadMessage(null)}
            className="ml-auto text-sm underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Organization Profile */}
        <div className="bg-white rounded-xl border p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary-500" />
            Organization Profile
          </h3>

          {profileLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
            </div>
          ) : profileError || !profile ? (
            <div className="text-center py-6">
              <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
              <p className="text-gray-600 mb-4">No organization profile found</p>
              <p className="text-sm text-gray-500">Upload a Word document to get started</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-gray-900">{profile.title}</h4>
                  <p className="text-sm text-gray-500">Version {profile.version}</p>
                </div>
                <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                  Active
                </span>
              </div>

              <div className="text-sm text-gray-600">
                <p><span className="text-gray-400">Updated:</span> {formatDate(profile.updated_at)}</p>
                {profile.changed_by && (
                  <p><span className="text-gray-400">By:</span> {profile.changed_by}</p>
                )}
              </div>

              {profile.relevance_rules ? (
                <div className="bg-green-50 rounded-lg p-3">
                  <p className="text-sm text-green-700 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Relevance rules active
                  </p>
                  {profile.rules_generated_at && (
                    <p className="text-xs text-green-600 mt-1">
                      Generated: {formatDate(profile.rules_generated_at)}
                    </p>
                  )}
                </div>
              ) : (
                <div className="bg-amber-50 rounded-lg p-3">
                  <p className="text-sm text-amber-700 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    No relevance rules generated
                  </p>
                </div>
              )}

              <div className="border-t pt-4">
                <p className="text-sm text-gray-500 mb-2">Preview:</p>
                <div className="bg-gray-50 rounded-lg p-3 max-h-32 overflow-y-auto">
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">
                    {profile.content.slice(0, 500)}
                    {profile.content.length > 500 && '...'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Upload Section */}
          <div className="border-t mt-6 pt-6">
            <h4 className="font-medium text-gray-900 mb-3">Upload New Profile</h4>
            <p className="text-sm text-gray-500 mb-4">
              Upload a Word document (.docx) to update the organization profile.
              A new version will be created only if the content differs.
            </p>

            <label className="block">
              <div className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                uploadMutation.isPending
                  ? 'border-gray-300 bg-gray-50'
                  : 'border-primary-300 hover:border-primary-400 hover:bg-primary-50'
              }`}>
                {uploadMutation.isPending ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
                    <span className="text-gray-600">Uploading...</span>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-primary-500 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">Click to upload .docx file</p>
                  </>
                )}
              </div>
              <input
                type="file"
                accept=".docx"
                onChange={handleFileUpload}
                disabled={uploadMutation.isPending}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Relevance Scoring & Version History */}
        <div className="space-y-6">
          {/* Relevance Actions */}
          <div className="bg-white rounded-xl border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-primary-500" />
              Relevance Scoring
            </h3>

            <p className="text-sm text-gray-500 mb-4">
              Relevance rules are automatically generated when you upload a new profile.
              You can also regenerate them manually or rescore all grants.
            </p>

            <div className="space-y-3">
              <button
                onClick={() => regenerateRulesMutation.mutate()}
                disabled={regenerateRulesMutation.isPending || !profile}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {regenerateRulesMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Regenerate Rules
              </button>

              <button
                onClick={() => scoreAllMutation.mutate()}
                disabled={scoreAllMutation.isPending || !profile?.relevance_rules}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] border border-primary-600 text-primary-600 rounded-lg hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {scoreAllMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                Score All Grants
              </button>
            </div>
          </div>

          {/* Version History */}
          <div className="bg-white rounded-xl border p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <History className="w-5 h-5 text-primary-500" />
                Version History
              </h3>
              <button
                onClick={() => setShowVersionHistory(!showVersionHistory)}
                className="text-sm text-primary-600 hover:underline"
              >
                {showVersionHistory ? 'Hide' : 'Show all'}
              </button>
            </div>

            {versions?.versions && versions.versions.length > 0 ? (
              <div className="space-y-2">
                {(showVersionHistory ? versions.versions : versions.versions.slice(0, 5)).map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVersion(v.version)}
                    className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                        v.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {v.version}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{v.title}</p>
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(v.created_at)}
                          {v.changed_by && ` by ${v.changed_by}`}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm text-center py-4">
                No version history available
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Advanced Rules Editor */}
      {profile?.relevance_rules && (
        <div className="mt-6">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            {showAdvanced ? (
              <ChevronDown className="w-5 h-5" />
            ) : (
              <ChevronRight className="w-5 h-5" />
            )}
            <Sliders className="w-5 h-5" />
            <span className="font-medium">Advanced: Edit Relevance Rules</span>
            {hasUnsavedChanges && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full">
                Unsaved changes
              </span>
            )}
          </button>

          {showAdvanced && rules && (
            <div className="bg-white rounded-xl border p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Relevance Rules</h3>
                  <p className="text-sm text-gray-500">
                    Edit keywords and categories to customize grant relevance scoring
                  </p>
                </div>
                {hasUnsavedChanges && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleDiscardChanges}
                      className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
                    >
                      Discard
                    </button>
                    <button
                      onClick={handleSaveRules}
                      disabled={saveRulesMutation.isPending}
                      className="flex items-center gap-2 px-4 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50"
                    >
                      {saveRulesMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      Save Changes
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* High Priority Keywords */}
                <KeywordList
                  title="High Priority Keywords"
                  description="Strong indicators of relevance (+0.3 score)"
                  keywords={rules.high_priority_keywords || []}
                  onChange={(keywords) => updateRuleField('high_priority_keywords', keywords)}
                  color="green"
                />

                {/* Medium Priority Keywords */}
                <KeywordList
                  title="Medium Priority Keywords"
                  description="Moderate indicators of relevance (+0.2 score)"
                  keywords={rules.medium_priority_keywords || []}
                  onChange={(keywords) => updateRuleField('medium_priority_keywords', keywords)}
                  color="blue"
                />

                {/* Low Priority Keywords */}
                <KeywordList
                  title="Low Priority Keywords"
                  description="Minor indicators of relevance (+0.1 score)"
                  keywords={rules.low_priority_keywords || []}
                  onChange={(keywords) => updateRuleField('low_priority_keywords', keywords)}
                  color="purple"
                />

                {/* Negative Keywords */}
                <KeywordList
                  title="Negative Keywords"
                  description="Indicators of irrelevance (-0.2 score)"
                  keywords={rules.negative_keywords || []}
                  onChange={(keywords) => updateRuleField('negative_keywords', keywords)}
                  color="red"
                />

                {/* Relevant Categories */}
                <KeywordList
                  title="Relevant Categories"
                  description="Grant categories to prioritize"
                  keywords={rules.relevant_categories || []}
                  onChange={(keywords) => updateRuleField('relevant_categories', keywords)}
                  color="primary"
                />

                {/* Relevant Agencies */}
                <KeywordList
                  title="Relevant Agencies"
                  description="Preferred funding agencies"
                  keywords={rules.relevant_agencies || []}
                  onChange={(keywords) => updateRuleField('relevant_agencies', keywords)}
                  color="amber"
                />

                {/* Geographic Keywords */}
                <KeywordList
                  title="Geographic Keywords"
                  description="Location-based relevance indicators"
                  keywords={rules.geographic_keywords || []}
                  onChange={(keywords) => updateRuleField('geographic_keywords', keywords)}
                  color="green"
                />

                {/* Population Keywords */}
                <KeywordList
                  title="Population Keywords"
                  description="Population-based eligibility terms"
                  keywords={rules.population_keywords || []}
                  onChange={(keywords) => updateRuleField('population_keywords', keywords)}
                  color="blue"
                />
              </div>

              {/* Funding Range */}
              <div className="mt-4 pt-4 border-t">
                <h4 className="font-medium text-gray-900 mb-3">Preferred Funding Range</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Minimum ($)</label>
                    <input
                      type="number"
                      value={rules.min_preferred_funding || 0}
                      onChange={(e) => updateRuleField('min_preferred_funding', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2.5 min-h-[44px] text-base sm:text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Maximum ($)</label>
                    <input
                      type="number"
                      value={rules.max_preferred_funding || 0}
                      onChange={(e) => updateRuleField('max_preferred_funding', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2.5 min-h-[44px] text-base sm:text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
