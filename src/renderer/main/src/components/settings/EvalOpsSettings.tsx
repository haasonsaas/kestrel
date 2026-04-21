import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Check, LogIn, LogOut, RefreshCw, Save } from 'lucide-react'
import {
  EVALOPS_DEFAULT_AGENT_ID,
  EVALOPS_DEFAULT_AGENT_REGISTRY_BASE_URL,
  EVALOPS_DEFAULT_APPROVALS_BASE_URL,
  EVALOPS_DEFAULT_BASE_URL,
  EVALOPS_DEFAULT_IDENTITY_BASE_URL,
  EVALOPS_DEFAULT_LLM_GATEWAY_BASE_URL,
  EVALOPS_DEFAULT_MEMORY_BASE_URL,
  EVALOPS_DEFAULT_PROVIDER_REF,
  EVALOPS_DEFAULT_RESOURCE,
  EVALOPS_DEFAULT_SCOPES,
  EVALOPS_DEFAULT_SKILLS_BASE_URL,
  EVALOPS_DEFAULT_TRACES_BASE_URL,
  EVALOPS_DEFAULT_WORKSPACE_ID
} from '@shared/config'
import type { EvalOpsAuthStatus, EvalOpsMemorySyncQueueStatus, EvalOpsServiceStatus } from '@shared/ipc'

interface StoredEvalOpsConfig {
  identityBaseUrl?: string
  baseUrl?: string
  token?: string
  llmGatewayBaseUrl?: string
  resource?: string
  scopes?: string[]
  agentRegistryBaseUrl?: string
  approvalsBaseUrl?: string
  skillsBaseUrl?: string
  memoryBaseUrl?: string
  tracesBaseUrl?: string
  workspaceId?: string
  agentId?: string
  providerRef?: {
    provider?: string
    environment?: string
    credentialName?: string
    teamId?: string
  }
}

interface StoredEvalOpsMemorySync {
  enabled?: boolean
  chat?: boolean
  meetings?: boolean
  journal?: boolean
}

const EVALOPS_MEMORY_SYNC_SETTING_KEY = 'evalops_memory_sync'

export function EvalOpsSettings() {
  const [status, setStatus] = useState<EvalOpsAuthStatus | null>(null)
  const [identityBaseUrl, setIdentityBaseUrl] = useState(EVALOPS_DEFAULT_IDENTITY_BASE_URL)
  const [baseUrl, setBaseUrl] = useState(EVALOPS_DEFAULT_BASE_URL)
  const [llmGatewayBaseUrl, setLlmGatewayBaseUrl] = useState(EVALOPS_DEFAULT_LLM_GATEWAY_BASE_URL)
  const [agentRegistryBaseUrl, setAgentRegistryBaseUrl] = useState(EVALOPS_DEFAULT_AGENT_REGISTRY_BASE_URL)
  const [approvalsBaseUrl, setApprovalsBaseUrl] = useState(EVALOPS_DEFAULT_APPROVALS_BASE_URL)
  const [skillsBaseUrl, setSkillsBaseUrl] = useState(EVALOPS_DEFAULT_SKILLS_BASE_URL)
  const [memoryBaseUrl, setMemoryBaseUrl] = useState(EVALOPS_DEFAULT_MEMORY_BASE_URL)
  const [tracesBaseUrl, setTracesBaseUrl] = useState(EVALOPS_DEFAULT_TRACES_BASE_URL)
  const [token, setToken] = useState('')
  const [resource, setResource] = useState(EVALOPS_DEFAULT_RESOURCE)
  const [scopes, setScopes] = useState(EVALOPS_DEFAULT_SCOPES.join(' '))
  const [workspaceId, setWorkspaceId] = useState(EVALOPS_DEFAULT_WORKSPACE_ID)
  const [agentId, setAgentId] = useState(EVALOPS_DEFAULT_AGENT_ID)
  const [provider, setProvider] = useState(EVALOPS_DEFAULT_PROVIDER_REF.provider)
  const [providerEnvironment, setProviderEnvironment] = useState(EVALOPS_DEFAULT_PROVIDER_REF.environment)
  const [providerCredentialName, setProviderCredentialName] = useState(EVALOPS_DEFAULT_PROVIDER_REF.credentialName)
  const [providerTeamId, setProviderTeamId] = useState(EVALOPS_DEFAULT_PROVIDER_REF.teamId)
  const [memorySyncEnabled, setMemorySyncEnabled] = useState(false)
  const [memorySyncChat, setMemorySyncChat] = useState(false)
  const [memorySyncMeetings, setMemorySyncMeetings] = useState(false)
  const [memorySyncJournal, setMemorySyncJournal] = useState(false)
  const [memoryQueueStatus, setMemoryQueueStatus] = useState<EvalOpsMemorySyncQueueStatus | null>(null)
  const [serviceStatuses, setServiceStatuses] = useState<EvalOpsServiceStatus[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const parsedScopes = useMemo(() => parseScopes(scopes), [scopes])
  const tokenConfigured = Boolean(token.trim()) || Boolean(status?.tokenConfigured)

  const load = useCallback(async () => {
    const stored = await window.api.invoke('settings:get', 'evalops_config') as StoredEvalOpsConfig | null
    const memorySync = await window.api.invoke('settings:get', EVALOPS_MEMORY_SYNC_SETTING_KEY) as StoredEvalOpsMemorySync | null
    if (stored?.identityBaseUrl) setIdentityBaseUrl(stored.identityBaseUrl)
    if (stored?.baseUrl) setBaseUrl(stored.baseUrl)
    if (stored?.llmGatewayBaseUrl) setLlmGatewayBaseUrl(stored.llmGatewayBaseUrl)
    if (stored?.agentRegistryBaseUrl) setAgentRegistryBaseUrl(stored.agentRegistryBaseUrl)
    if (stored?.approvalsBaseUrl) setApprovalsBaseUrl(stored.approvalsBaseUrl)
    if (stored?.skillsBaseUrl) setSkillsBaseUrl(stored.skillsBaseUrl)
    if (stored?.memoryBaseUrl) setMemoryBaseUrl(stored.memoryBaseUrl)
    if (stored?.tracesBaseUrl) setTracesBaseUrl(stored.tracesBaseUrl)
    if (stored?.token) setToken(stored.token)
    if (stored?.resource) setResource(stored.resource)
    if (stored?.scopes?.length) setScopes(stored.scopes.join(' '))
    if (stored?.workspaceId) setWorkspaceId(stored.workspaceId)
    if (stored?.agentId) setAgentId(stored.agentId)
    if (stored?.providerRef?.provider) setProvider(stored.providerRef.provider)
    if (stored?.providerRef?.environment) setProviderEnvironment(stored.providerRef.environment)
    if (stored?.providerRef?.credentialName) setProviderCredentialName(stored.providerRef.credentialName)
    if (stored?.providerRef?.teamId) setProviderTeamId(stored.providerRef.teamId)
    setMemorySyncEnabled(memorySync?.enabled === true)
    setMemorySyncChat(memorySync?.chat === true)
    setMemorySyncMeetings(memorySync?.meetings === true)
    setMemorySyncJournal(memorySync?.journal === true)
    setMemoryQueueStatus(await window.api.invoke('evalops:memorySync:status'))
    setStatus(await window.api.invoke('evalops:authStatus'))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const saveConfig = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await window.api.invoke('settings:set', 'evalops_config', {
        identityBaseUrl: identityBaseUrl.trim(),
        baseUrl: baseUrl.trim(),
        llmGatewayBaseUrl: llmGatewayBaseUrl.trim(),
        agentRegistryBaseUrl: agentRegistryBaseUrl.trim(),
        approvalsBaseUrl: approvalsBaseUrl.trim(),
        skillsBaseUrl: skillsBaseUrl.trim(),
        memoryBaseUrl: memoryBaseUrl.trim(),
        tracesBaseUrl: tracesBaseUrl.trim(),
        token: token.trim(),
        resource: resource.trim(),
        scopes: parsedScopes,
        workspaceId: workspaceId.trim(),
        agentId: agentId.trim(),
        providerRef: {
          provider: provider.trim(),
          environment: providerEnvironment.trim(),
          credentialName: providerCredentialName.trim(),
          teamId: providerTeamId.trim()
        }
      })
      await window.api.invoke('settings:set', EVALOPS_MEMORY_SYNC_SETTING_KEY, {
        enabled: memorySyncEnabled,
        chat: memorySyncChat,
        meetings: memorySyncMeetings,
        journal: memorySyncJournal
      })
      if (memorySyncEnabled) {
        setMemoryQueueStatus(await window.api.invoke('evalops:memorySync:flush'))
      } else {
        setMemoryQueueStatus(await window.api.invoke('evalops:memorySync:status'))
      }
      setStatus(await window.api.invoke('evalops:authStatus'))
      setMessage('Saved EvalOps settings.')
      setTimeout(() => setMessage(null), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [
    agentId,
    agentRegistryBaseUrl,
    approvalsBaseUrl,
    baseUrl,
    identityBaseUrl,
    llmGatewayBaseUrl,
    memoryBaseUrl,
    memorySyncChat,
    memorySyncEnabled,
    memorySyncJournal,
    memorySyncMeetings,
    parsedScopes,
    provider,
    providerCredentialName,
    providerEnvironment,
    providerTeamId,
    resource,
    skillsBaseUrl,
    token,
    tracesBaseUrl,
    workspaceId
  ])

  const signIn = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await saveConfig()
      const next = await window.api.invoke('evalops:login', {
        identityBaseUrl: identityBaseUrl.trim(),
        resource: resource.trim(),
        scopes: parsedScopes
      })
      setStatus(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [identityBaseUrl, parsedScopes, resource, saveConfig])

  const signOut = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      setStatus(await window.api.invoke('evalops:logout'))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [])

  const refresh = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      setStatus(await window.api.invoke('evalops:refreshAuth'))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [])

  const checkServices = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await saveConfig()
      setServiceStatuses(await window.api.invoke('evalops:servicesStatus'))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [saveConfig])

  const retryMemorySyncQueue = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      setMemoryQueueStatus(await window.api.invoke('evalops:memorySync:flush'))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [])

  return (
    <div>
      <h3 className="text-xl font-semibold mb-2">EvalOps</h3>
      <p className="text-sm text-muted-foreground mb-6">
        Authenticate with EvalOps identity and configure the platform resource used by managed services.
      </p>

      <div className="space-y-6 max-w-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border pb-5">
          <div>
            <h4 className="text-sm font-medium mb-1">Authentication</h4>
            <p className="text-xs text-muted-foreground">
              {status?.authenticated
                ? `Signed in${status.organizationId ? ` to ${status.organizationId}` : ''}.`
                : tokenConfigured
                  ? 'Using manually configured bearer token.'
                  : 'Not signed in.'}
            </p>
            {status?.expiresAt && (
              <p className="text-xs text-muted-foreground mt-1">
                Access token expires {new Date(status.expiresAt).toLocaleString()}.
              </p>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={refresh}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            {status?.authenticated ? (
              <button
                onClick={signOut}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm hover:bg-muted disabled:opacity-50"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            ) : (
              <button
                onClick={signIn}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
              >
                <LogIn className="h-4 w-4" />
                Sign In
              </button>
            )}
          </div>
        </div>

        <TextSetting
          label="Platform Base URL"
          value={baseUrl}
          onChange={setBaseUrl}
          placeholder={EVALOPS_DEFAULT_BASE_URL}
        />

        <TextSetting
          label="LLM Gateway Base URL"
          value={llmGatewayBaseUrl}
          onChange={setLlmGatewayBaseUrl}
          placeholder={EVALOPS_DEFAULT_LLM_GATEWAY_BASE_URL}
        />

        <div className="grid grid-cols-2 gap-4">
          <TextSetting
            label="Agent Registry URL"
            value={agentRegistryBaseUrl}
            onChange={setAgentRegistryBaseUrl}
            placeholder={EVALOPS_DEFAULT_AGENT_REGISTRY_BASE_URL}
          />
          <TextSetting
            label="Approvals URL"
            value={approvalsBaseUrl}
            onChange={setApprovalsBaseUrl}
            placeholder={EVALOPS_DEFAULT_APPROVALS_BASE_URL}
          />
          <TextSetting
            label="Skills URL"
            value={skillsBaseUrl}
            onChange={setSkillsBaseUrl}
            placeholder={EVALOPS_DEFAULT_SKILLS_BASE_URL}
          />
          <TextSetting
            label="Memory URL"
            value={memoryBaseUrl}
            onChange={setMemoryBaseUrl}
            placeholder={EVALOPS_DEFAULT_MEMORY_BASE_URL}
          />
          <TextSetting
            label="Traces URL"
            value={tracesBaseUrl}
            onChange={setTracesBaseUrl}
            placeholder={EVALOPS_DEFAULT_TRACES_BASE_URL}
          />
        </div>

        <TextSetting
          label="Bearer Token"
          value={token}
          onChange={setToken}
          placeholder="Use OIDC sign-in or paste a service token"
          type="password"
        />

        <TextSetting
          label="Identity Base URL"
          value={identityBaseUrl}
          onChange={setIdentityBaseUrl}
          placeholder={EVALOPS_DEFAULT_IDENTITY_BASE_URL}
        />

        <TextSetting
          label="OAuth Resource"
          value={resource}
          onChange={setResource}
          placeholder={EVALOPS_DEFAULT_RESOURCE}
        />

        <TextSetting
          label="Requested Scopes"
          value={scopes}
          onChange={setScopes}
          placeholder={EVALOPS_DEFAULT_SCOPES.join(' ')}
        />

        <div className="grid grid-cols-2 gap-4">
          <TextSetting
            label="Workspace ID"
            value={workspaceId}
            onChange={setWorkspaceId}
            placeholder={EVALOPS_DEFAULT_WORKSPACE_ID}
          />
          <TextSetting
            label="Agent ID"
            value={agentId}
            onChange={setAgentId}
            placeholder={EVALOPS_DEFAULT_AGENT_ID}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <TextSetting
            label="Provider Ref"
            value={provider}
            onChange={setProvider}
            placeholder={EVALOPS_DEFAULT_PROVIDER_REF.provider}
          />
          <TextSetting
            label="Provider Environment"
            value={providerEnvironment}
            onChange={setProviderEnvironment}
            placeholder={EVALOPS_DEFAULT_PROVIDER_REF.environment}
          />
          <TextSetting
            label="Provider Credential"
            value={providerCredentialName}
            onChange={setProviderCredentialName}
            placeholder="default"
          />
          <TextSetting
            label="Provider Team ID"
            value={providerTeamId}
            onChange={setProviderTeamId}
            placeholder="team_platform"
          />
        </div>

        <div className="space-y-4 border-t border-border pt-5">
          <div>
            <h4 className="text-sm font-medium mb-1">Memory Sync</h4>
            <p className="text-xs text-muted-foreground">
              Selected chat, meeting, and journal content is stored in EvalOps Memory and leaves this Mac when enabled.
            </p>
          </div>
          <div className="space-y-3">
            <CheckboxSetting
              label="Sync selected local data to EvalOps Memory"
              checked={memorySyncEnabled}
              onChange={setMemorySyncEnabled}
            />
            <div className="grid grid-cols-3 gap-3">
              <CheckboxSetting
                label="Chat"
                checked={memorySyncChat}
                onChange={setMemorySyncChat}
                disabled={!memorySyncEnabled}
              />
              <CheckboxSetting
                label="Meetings"
                checked={memorySyncMeetings}
                onChange={setMemorySyncMeetings}
                disabled={!memorySyncEnabled}
              />
              <CheckboxSetting
                label="Journal"
                checked={memorySyncJournal}
                onChange={setMemorySyncJournal}
                disabled={!memorySyncEnabled}
              />
            </div>
            {memoryQueueStatus && (
              <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    {memoryQueueStatus.pending === 0
                      ? 'No queued syncs'
                      : `${memoryQueueStatus.pending} queued sync${memoryQueueStatus.pending === 1 ? '' : 's'}`}
                  </p>
                  {memoryQueueStatus.nextAttemptAt && (
                    <p className="text-xs text-muted-foreground">
                      Next retry {new Date(memoryQueueStatus.nextAttemptAt).toLocaleString()}.
                    </p>
                  )}
                  {memoryQueueStatus.lastError && (
                    <p className="text-xs text-red-600 mt-1 truncate">
                      {memoryQueueStatus.lastError}
                    </p>
                  )}
                </div>
                <button
                  onClick={retryMemorySyncQueue}
                  disabled={busy || memoryQueueStatus.pending === 0 || !memorySyncEnabled}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm hover:bg-muted disabled:opacity-50"
                >
                  <RefreshCw className="h-4 w-4" />
                  Retry
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4 border-t border-border pt-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-medium mb-1">Platform Services</h4>
              <p className="text-xs text-muted-foreground">
                Agent registry, approvals, skills, memory, and traces are checked through their configured EvalOps service URLs.
              </p>
            </div>
            <button
              onClick={checkServices}
              disabled={busy || (!status?.authenticated && !tokenConfigured)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" />
              Check
            </button>
          </div>

          {serviceStatuses.length > 0 && (
            <div className="space-y-2">
              {serviceStatuses.map((item) => (
                <div key={item.service} className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm">
                  {item.ok
                    ? <Check className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                    : <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  }
                  <div className="min-w-0">
                    <p className="font-medium">{item.service}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.baseUrl}</p>
                    {item.error && <p className="text-xs text-red-600 mt-1">{item.error}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={saveConfig}
            disabled={busy || parsedScopes.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            Save Settings
          </button>
          {message && (
            <span className="inline-flex items-center gap-1 text-xs text-green-600">
              <Check className="h-3.5 w-3.5" />
              {message}
            </span>
          )}
        </div>

        {error && (
          <div className="flex gap-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-600">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function CheckboxSetting({
  label,
  checked,
  onChange,
  disabled = false
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className={`flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm ${disabled ? 'opacity-50' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-primary"
      />
      <span>{label}</span>
    </label>
  )
}

function TextSetting({
  label,
  value,
  onChange,
  placeholder,
  type = 'text'
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  type?: string
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono"
      />
    </div>
  )
}

function parseScopes(value: string): string[] {
  return Array.from(new Set(value.split(/[,\s]+/).map((scope) => scope.trim()).filter(Boolean)))
}
