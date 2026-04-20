import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, Check, LogIn, LogOut, RefreshCw, Save } from 'lucide-react'
import {
  EVALOPS_DEFAULT_IDENTITY_BASE_URL,
  EVALOPS_DEFAULT_RESOURCE,
  EVALOPS_DEFAULT_SCOPES
} from '@shared/config'
import type { EvalOpsAuthStatus } from '@shared/ipc'

interface StoredEvalOpsConfig {
  identityBaseUrl?: string
  resource?: string
  scopes?: string[]
}

export function EvalOpsSettings() {
  const [status, setStatus] = useState<EvalOpsAuthStatus | null>(null)
  const [identityBaseUrl, setIdentityBaseUrl] = useState(EVALOPS_DEFAULT_IDENTITY_BASE_URL)
  const [resource, setResource] = useState(EVALOPS_DEFAULT_RESOURCE)
  const [scopes, setScopes] = useState(EVALOPS_DEFAULT_SCOPES.join(' '))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const parsedScopes = useMemo(() => parseScopes(scopes), [scopes])

  const load = useCallback(async () => {
    const stored = await window.api.invoke('settings:get', 'evalops_config') as StoredEvalOpsConfig | null
    if (stored?.identityBaseUrl) setIdentityBaseUrl(stored.identityBaseUrl)
    if (stored?.resource) setResource(stored.resource)
    if (stored?.scopes?.length) setScopes(stored.scopes.join(' '))
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
        resource: resource.trim(),
        scopes: parsedScopes
      })
      setStatus(await window.api.invoke('evalops:authStatus'))
      setMessage('Saved EvalOps settings.')
      setTimeout(() => setMessage(null), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [identityBaseUrl, parsedScopes, resource])

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

function TextSetting({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <input
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
