import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Plus, X, Globe, AppWindow, ChevronDown, ChevronUp } from 'lucide-react'
import type { PrivacyRule } from '../../../../../shared/ipc'

type Tab = 'apps' | 'websites'

const CATEGORIES = [
  { id: 'adult', name: 'Adult Content', description: 'Adult websites and mature content' },
  { id: 'banking', name: 'Banking & Finance', description: 'Bank accounts, financial transactions, and investment platforms' },
  { id: 'health', name: 'Health & Medical', description: 'Medical records, health information, and healthcare providers' },
  { id: 'social', name: 'Social Media', description: 'Social media platforms and messaging services' },
  { id: 'shopping', name: 'Shopping', description: 'E-commerce sites and online shopping platforms' },
  { id: 'entertainment', name: 'Entertainment', description: 'Streaming services, games, and entertainment platforms' }
]

export function PrivacyControls() {
  const [tab, setTab] = useState<Tab>('websites')
  const [rules, setRules] = useState<PrivacyRule[]>([])
  const [newDomain, setNewDomain] = useState('')
  const [newApp, setNewApp] = useState('')
  const [categoriesExpanded, setCategoriesExpanded] = useState(true)
  const [specificExpanded, setSpecificExpanded] = useState(true)

  useEffect(() => {
    loadRules()
  }, [])

  const loadRules = async () => {
    const data = await window.api.invoke('privacy:list')
    setRules(data)
  }

  const toggleCategory = useCallback(async (categoryId: string) => {
    const existing = rules.find(r => r.type === 'category' && r.value === categoryId)
    if (existing) {
      await window.api.invoke('privacy:update', existing.id, { enabled: !existing.enabled })
    } else {
      await window.api.invoke('privacy:create', { type: 'category', value: categoryId, enabled: true })
    }
    loadRules()
  }, [rules])

  const addDomain = useCallback(async () => {
    const domain = newDomain.trim().toLowerCase()
    if (!domain) return
    await window.api.invoke('privacy:create', { type: 'domain', value: domain })
    setNewDomain('')
    loadRules()
  }, [newDomain])

  const addApp = useCallback(async () => {
    const app = newApp.trim()
    if (!app) return
    await window.api.invoke('privacy:create', { type: 'app', value: app })
    setNewApp('')
    loadRules()
  }, [newApp])

  const deleteRule = useCallback(async (id: string) => {
    await window.api.invoke('privacy:delete', id)
    loadRules()
  }, [])

  const categoryRules = rules.filter(r => r.type === 'category')
  const domainRules = rules.filter(r => r.type === 'domain')
  const appRules = rules.filter(r => r.type === 'app')

  const enabledCategories = categoryRules.filter(r => r.enabled).length

  return (
    <div>
      <h3 className="text-xl font-semibold mb-2">Privacy Controls</h3>
      <p className="text-sm text-muted-foreground mb-6">
        Control what Kestrel can see. Excluded content won't appear in your context.
      </p>

      {/* Tab toggle */}
      <div className="inline-flex rounded-lg border border-border p-1 mb-6">
        <button
          onClick={() => setTab('apps')}
          className={cn(
            'px-4 py-1.5 text-sm rounded-md transition-colors',
            tab === 'apps' ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <span className="flex items-center gap-2">
            <AppWindow className="h-3.5 w-3.5" />
            Exclude Apps ({appRules.length})
          </span>
        </button>
        <button
          onClick={() => setTab('websites')}
          className={cn(
            'px-4 py-1.5 text-sm rounded-md transition-colors',
            tab === 'websites' ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <span className="flex items-center gap-2">
            <Globe className="h-3.5 w-3.5" />
            Exclude Websites ({enabledCategories + domainRules.length})
          </span>
        </button>
      </div>

      {tab === 'websites' ? (
        <div className="space-y-6">
          {/* Exclude by Category */}
          <section>
            <button
              onClick={() => setCategoriesExpanded(!categoriesExpanded)}
              className="flex items-center gap-2 text-sm font-medium mb-3"
            >
              {categoriesExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Exclude by Category ({enabledCategories})
            </button>

            {categoriesExpanded && (
              <div className="space-y-2">
                {CATEGORIES.map((cat) => {
                  const rule = categoryRules.find(r => r.value === cat.id)
                  const isEnabled = rule?.enabled ?? false

                  return (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between p-4 rounded-xl border border-border"
                    >
                      <div>
                        <p className="text-sm font-medium">{cat.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{cat.description}</p>
                      </div>
                      <Toggle enabled={isEnabled} onToggle={() => toggleCategory(cat.id)} />
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Exclude Specific Websites */}
          <section>
            <button
              onClick={() => setSpecificExpanded(!specificExpanded)}
              className="flex items-center gap-2 text-sm font-medium mb-3"
            >
              {specificExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Exclude Specific Websites ({domainRules.length})
            </button>

            {specificExpanded && (
              <div className="space-y-2">
                {/* Add domain input */}
                <div className="flex gap-2">
                  <input
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addDomain()}
                    placeholder="Add domain (example.com)"
                    className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  />
                  <button
                    onClick={addDomain}
                    disabled={!newDomain.trim()}
                    className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted disabled:opacity-50 transition-colors"
                  >
                    Add
                  </button>
                </div>

                {/* Domain list */}
                {domainRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-border"
                  >
                    <div className="flex items-center gap-3">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{rule.value}</span>
                    </div>
                    <button
                      onClick={() => deleteRule(rule.id)}
                      className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}

                {/* Always excluded */}
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-2">Always excluded (password managers):</p>
                  {['1password.com', 'bitwarden.com', 'lastpass.com', 'dashlane.com'].map((d) => (
                    <div key={d} className="flex items-center gap-3 py-1.5 px-3 text-xs text-muted-foreground">
                      <Globe className="h-3 w-3" />
                      <span>{d}</span>
                      <span className="ml-auto text-[10px] bg-muted px-1.5 py-0.5 rounded">excluded by default</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Add app input */}
          <div className="flex gap-2">
            <input
              value={newApp}
              onChange={(e) => setNewApp(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addApp()}
              placeholder="App name or bundle ID (e.g., com.apple.Notes)"
              className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
            <button
              onClick={addApp}
              disabled={!newApp.trim()}
              className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted disabled:opacity-50 transition-colors"
            >
              Add
            </button>
          </div>

          {/* App list */}
          {appRules.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center justify-between p-3 rounded-xl border border-border"
            >
              <div className="flex items-center gap-3">
                <AppWindow className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{rule.value}</span>
              </div>
              <button
                onClick={() => deleteRule(rule.id)}
                className="p-1 text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}

          {appRules.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No apps excluded. Add an app name or bundle ID above.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        'w-11 h-6 rounded-full relative transition-colors',
        enabled ? 'bg-primary' : 'bg-muted'
      )}
    >
      <div
        className={cn(
          'w-5 h-5 bg-white rounded-full absolute top-0.5 shadow transition-transform',
          enabled ? 'translate-x-[22px]' : 'translate-x-0.5'
        )}
      />
    </button>
  )
}
