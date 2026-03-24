import { useState, useEffect, useCallback } from 'react'
import { Key, Check, Eye, EyeOff } from 'lucide-react'

export function APIKeySettings() {
  const [openrouterKey, setOpenrouterKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [showOpenrouter, setShowOpenrouter] = useState(false)
  const [showOpenai, setShowOpenai] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(() => {
    loadKeys()
  }, [])

  const loadKeys = async () => {
    const or = await window.api.invoke('settings:get', 'openrouter_api_key')
    const oa = await window.api.invoke('settings:get', 'openai_api_key')
    if (or) setOpenrouterKey(or as string)
    if (oa) setOpenaiKey(oa as string)
  }

  const saveKey = useCallback(async (key: string, value: string) => {
    await window.api.invoke('settings:set', key, value)
    setSaved(key)
    setTimeout(() => setSaved(null), 2000)
  }, [])

  return (
    <div>
      <h3 className="text-xl font-semibold mb-2">API Keys</h3>
      <p className="text-sm text-muted-foreground mb-6">
        Configure API keys for AI providers and services.
      </p>

      <div className="space-y-8">
        <KeyInput
          label="OpenRouter API Key"
          value={openrouterKey}
          onChange={setOpenrouterKey}
          onSave={() => saveKey('openrouter_api_key', openrouterKey)}
          show={showOpenrouter}
          onToggleShow={() => setShowOpenrouter(!showOpenrouter)}
          placeholder="sk-or-..."
          description="Used for all AI model access. Get one at openrouter.ai"
          isSaved={saved === 'openrouter_api_key'}
        />

        <KeyInput
          label="OpenAI API Key"
          value={openaiKey}
          onChange={setOpenaiKey}
          onSave={() => saveKey('openai_api_key', openaiKey)}
          show={showOpenai}
          onToggleShow={() => setShowOpenai(!showOpenai)}
          placeholder="sk-..."
          description="Used for Whisper transcription. Get one at platform.openai.com"
          isSaved={saved === 'openai_api_key'}
        />
      </div>
    </div>
  )
}

interface KeyInputProps {
  label: string
  value: string
  onChange: (v: string) => void
  onSave: () => void
  show: boolean
  onToggleShow: () => void
  placeholder: string
  description: string
  isSaved: boolean
}

function KeyInput({
  label, value, onChange, onSave, show, onToggleShow,
  placeholder, description, isSaved
}: KeyInputProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <div className="flex gap-2 max-w-lg">
        <div className="flex-1 relative">
          <input
            type={show ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono pr-10"
          />
          <button
            onClick={onToggleShow}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <button
          onClick={onSave}
          disabled={!value.trim()}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
        >
          {isSaved ? <Check className="h-4 w-4" /> : <Key className="h-4 w-4" />}
          {isSaved ? 'Saved' : 'Save'}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  )
}
