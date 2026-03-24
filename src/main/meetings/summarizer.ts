import { chatCompletion } from '../ai/openrouter'
import { INTERNAL_MODEL } from '../../shared/config'

export async function summarizeMeeting(
  transcript: string,
  title: string
): Promise<{ summary: string; tldr: string; actionItems: string[] }> {
  const prompt = `You are a meeting summarizer. Given the following meeting transcript titled "${title}", provide:

1. A concise TLDR (1-2 sentences)
2. A comprehensive summary (2-4 paragraphs)
3. A list of action items mentioned in the meeting

Format your response as JSON:
{
  "tldr": "...",
  "summary": "...",
  "actionItems": ["...", "..."]
}

Meeting transcript:
${transcript.slice(0, 50000)}`

  const response = await chatCompletion(
    [{ role: 'user', content: prompt }],
    INTERNAL_MODEL
  )

  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
  } catch {
    // Fallback if JSON parsing fails
  }

  return {
    summary: response,
    tldr: response.slice(0, 200),
    actionItems: []
  }
}
