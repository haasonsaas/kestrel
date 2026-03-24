import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Bird, Check, X, ExternalLink, Shield, Mic, Monitor, Key, ArrowRight } from 'lucide-react'

interface PermissionState {
  accessibility: boolean
  microphone: boolean
  screenRecording: boolean
  allGranted: boolean
}

interface OnboardingProps {
  onComplete: () => void
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<'welcome' | 'permissions' | 'apikey' | 'done'>('welcome')
  const [permissions, setPermissions] = useState<PermissionState>({
    accessibility: false, microphone: false, screenRecording: false, allGranted: false
  })
  const [apiKey, setApiKey] = useState('')
  const [apiKeySaved, setApiKeySaved] = useState(false)
  const [checking, setChecking] = useState(false)

  const checkPermissions = useCallback(async () => {
    setChecking(true)
    try {
      const perms = await window.api.invoke('permissions:check')
      setPermissions(perms)
    } catch { /* ignore */ }
    setChecking(false)
  }, [])

  useEffect(() => {
    checkPermissions()
    // Re-check every 2 seconds while on permissions step
    const interval = setInterval(checkPermissions, 2000)
    return () => clearInterval(interval)
  }, [checkPermissions])

  useEffect(() => {
    // Check if API key already exists
    window.api.invoke('settings:get', 'openrouter_api_key').then((key) => {
      if (key) { setApiKey('••••••••••'); setApiKeySaved(true) }
    })
  }, [])

  const openSettings = useCallback(async (pane: string) => {
    await window.api.invoke('permissions:openSettings', pane)
  }, [])

  const saveApiKey = useCallback(async () => {
    if (!apiKey.trim() || apiKey === '••••••••••') return
    await window.api.invoke('settings:set', 'openrouter_api_key', apiKey.trim())
    setApiKeySaved(true)
  }, [apiKey])

  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="max-w-lg w-full mx-auto px-8 animate-fade-in">

        {step === 'welcome' && (
          <div className="text-center">
            <div className="w-20 h-20 rounded-3xl bg-warm/10 border border-warm/20 flex items-center justify-center mx-auto mb-8">
              <Bird className="h-10 w-10 text-warm" strokeWidth={1.5} />
            </div>
            <h1 className="text-3xl font-semibold tracking-tight mb-3">Welcome to Kestrel</h1>
            <p className="text-muted-foreground leading-relaxed mb-8">
              A context-aware AI assistant that reads your screen and helps with whatever you're working on.
            </p>
            <button
              onClick={() => setStep('permissions')}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-foreground text-background font-medium hover:opacity-90 active:scale-[0.98] transition-all"
            >
              Get Started
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {step === 'permissions' && (
          <div>
            <h2 className="text-2xl font-semibold tracking-tight mb-2">Permissions</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Kestrel needs a few macOS permissions to work. Click each to open System Settings.
            </p>

            <div className="space-y-3 mb-8">
              <PermissionRow
                icon={Shield}
                name="Accessibility"
                description="Read screen content from your active apps"
                granted={permissions.accessibility}
                required
                onEnable={() => openSettings('accessibility')}
              />
              <PermissionRow
                icon={Mic}
                name="Microphone"
                description="Record meeting audio for transcription"
                granted={permissions.microphone}
                required
                onEnable={() => window.api.invoke('permissions:request', 'microphone')}
              />
              <PermissionRow
                icon={Monitor}
                name="Screen Recording"
                description="Capture system audio during meetings (optional)"
                granted={permissions.screenRecording}
                onEnable={() => openSettings('screenRecording')}
              />
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep('welcome')}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Back
              </button>
              <button
                onClick={() => setStep('apikey')}
                className={cn(
                  'inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all',
                  permissions.accessibility
                    ? 'bg-foreground text-background hover:opacity-90'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {permissions.accessibility ? 'Continue' : 'Skip for now'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            {!permissions.accessibility && (
              <p className="text-xs text-warm mt-4 text-center">
                Accessibility is required to read screen content. Without it, Kestrel can only see app names.
              </p>
            )}
          </div>
        )}

        {step === 'apikey' && (
          <div>
            <h2 className="text-2xl font-semibold tracking-tight mb-2">API Key</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Kestrel uses OpenRouter for AI. All models (GPT, Claude, Gemini) through one key.
            </p>

            <div className="space-y-4 mb-8">
              <div>
                <label className="text-sm font-medium mb-1.5 block">OpenRouter API Key</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => { setApiKey(e.target.value); setApiKeySaved(false) }}
                    placeholder="sk-or-..."
                    className="flex-1 rounded-xl border border-input bg-card px-3 py-2.5 text-sm font-mono"
                  />
                  <button
                    onClick={saveApiKey}
                    disabled={!apiKey.trim() || apiKey === '••••••••••'}
                    className={cn(
                      'px-4 py-2.5 rounded-xl text-sm font-medium transition-all',
                      apiKeySaved
                        ? 'bg-green-500/10 text-green-600 border border-green-500/20'
                        : 'bg-foreground text-background disabled:opacity-30'
                    )}
                  >
                    {apiKeySaved ? (
                      <span className="flex items-center gap-1.5"><Check className="h-4 w-4" /> Saved</span>
                    ) : 'Save'}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Get one free at{' '}
                  <button onClick={() => window.api.invoke('window:close')} className="text-warm underline">
                    openrouter.ai/keys
                  </button>
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep('permissions')}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Back
              </button>
              <button
                onClick={() => {
                  window.api.invoke('settings:set', 'onboarding_complete', true)
                  onComplete()
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-foreground text-background font-medium hover:opacity-90"
              >
                {apiKeySaved ? 'Start Using Kestrel' : 'Skip for now'}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PermissionRow({
  icon: Icon, name, description, granted, required, onEnable
}: {
  icon: typeof Shield; name: string; description: string
  granted: boolean; required?: boolean; onEnable: () => void
}) {
  return (
    <div className={cn(
      'flex items-center gap-4 p-4 rounded-2xl border transition-colors',
      granted ? 'border-green-500/20 bg-green-500/5' : 'border-border bg-card'
    )}>
      <div className={cn(
        'w-10 h-10 rounded-xl flex items-center justify-center',
        granted ? 'bg-green-500/10' : 'bg-muted'
      )}>
        {granted
          ? <Check className="h-5 w-5 text-green-600" />
          : <Icon className="h-5 w-5 text-muted-foreground" />
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{name}</p>
          {required && !granted && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-warm/10 text-warm font-medium">Required</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      {!granted && (
        <button
          onClick={onEnable}
          className="flex items-center gap-1 text-xs text-warm hover:underline shrink-0"
        >
          Enable <ExternalLink className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}
