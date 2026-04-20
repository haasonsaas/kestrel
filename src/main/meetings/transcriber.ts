import { getSettingValue } from '../evalops/settings'

const WHISPER_API_URL = 'https://api.openai.com/v1/audio/transcriptions'

function getOpenAIKey(): string | null {
  return getSettingValue<string>('openai_api_key')
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  language?: string
): Promise<string> {
  const apiKey = getOpenAIKey()
  if (!apiKey) {
    throw new Error('OpenAI API key not configured. Set it in Settings > API Keys.')
  }

  const formData = new FormData()
  const blob = new Blob([audioBuffer], { type: 'audio/wav' })
  formData.append('file', blob, 'audio.wav')
  formData.append('model', 'whisper-1')
  formData.append('response_format', 'text')
  if (language) formData.append('language', language)

  const response = await fetch(WHISPER_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: formData
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Whisper API error (${response.status}): ${err}`)
  }

  return response.text()
}
