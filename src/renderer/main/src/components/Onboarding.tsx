import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Bird, Check, ExternalLink, Shield, Mic, Monitor, ArrowRight, LogIn } from 'lucide-react'
import type { EvalOpsAuthStatus } from '@shared/ipc'

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
  const [step, setStep] = useState<'welcome' | 'permissions' | 'evalops' | 'done'>('welcome')
  const [permissions, setPermissions] = useState<PermissionState>({
    accessibility: false, microphone: false, screenRecording: false, allGranted: false
  })
  const [authStatus, setAuthStatus] = useState<EvalOpsAuthStatus | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [signingIn, setSigningIn] = useState(false)
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
    window.api.invoke('evalops:authStatus').then(setAuthStatus)
  }, [])

  const openSettings = useCallback(async (pane: string) => {
    await window.api.invoke('permissions:openSettings', pane)
  }, [])

  const signIn = useCallback(async () => {
    setSigningIn(true)
    setAuthError(null)
    try {
      setAuthStatus(await window.api.invoke('evalops:login'))
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err))
    } finally {
      setSigningIn(false)
    }
  }, [])

  const complete = useCallback(() => {
    window.api.invoke('settings:set', 'onboarding_complete', true)
    onComplete()
  }, [onComplete])

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
                onClick={() => setStep('evalops')}
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

        {step === 'evalops' && (
          <div>
            <h2 className="text-2xl font-semibold tracking-tight mb-2">EvalOps Sign In</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Kestrel uses EvalOps identity for managed platform services and LLM gateway access.
            </p>

            <div className="space-y-4 mb-8">
              <div className={cn(
                'rounded-2xl border p-4',
                authStatus?.authenticated ? 'border-green-500/20 bg-green-500/5' : 'border-border bg-card'
              )}>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center',
                    authStatus?.authenticated ? 'bg-green-500/10' : 'bg-muted'
                  )}>
                    {authStatus?.authenticated
                      ? <Check className="h-5 w-5 text-green-600" />
                      : <Shield className="h-5 w-5 text-muted-foreground" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {authStatus?.authenticated ? 'Signed in to EvalOps' : 'Not signed in'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {authStatus?.organizationId || authStatus?.identityBaseUrl || 'EvalOps identity service'}
                    </p>
                  </div>
                  {!authStatus?.authenticated && (
                    <button
                      onClick={signIn}
                      disabled={signingIn}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-foreground text-background text-sm font-medium disabled:opacity-40"
                    >
                      <LogIn className="h-4 w-4" />
                      {signingIn ? 'Waiting...' : 'Sign In'}
                    </button>
                  )}
                </div>
                {authError && (
                  <p className="text-xs text-red-600 mt-3">{authError}</p>
                )}
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
                onClick={complete}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-foreground text-background font-medium hover:opacity-90"
              >
                {authStatus?.authenticated ? 'Start Using Kestrel' : 'Skip for now'}
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
