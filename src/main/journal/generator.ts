import { getDatabase } from '../db'
import * as schema from '../db/schema'
import { chatCompletion } from '../ai/openrouter'
import { INTERNAL_MODEL } from '../../shared/config'

export async function generateJournal(date: string): Promise<{
  title: string
  tldr: string
  content: string
}> {
  const db = getDatabase()

  // Get all context snapshots for the given date
  const startOfDay = new Date(date).getTime()
  const endOfDay = startOfDay + 86400000
  const snapshots = db
    .select()
    .from(schema.contextSnapshots)
    .all()
    .filter((s) => {
      const ts = s.createdAt instanceof Date ? s.createdAt.getTime() : Number(s.createdAt)
      return ts >= startOfDay && ts < endOfDay
    })

  // Get meetings for the day
  const meetings = db
    .select()
    .from(schema.meetings)
    .all()
    .filter((m) => {
      const ts = m.startedAt instanceof Date ? m.startedAt.getTime() : Number(m.startedAt)
      return ts >= startOfDay && ts < endOfDay
    })

  // Build context summary
  const contextSummary = snapshots
    .map((s) => `[${s.appName}] ${s.windowTitle || ''} ${s.url || ''}`)
    .filter(Boolean)
    .slice(0, 100)
    .join('\n')

  const meetingSummary = meetings
    .map((m) => `Meeting: ${m.title} (${m.app})${m.summary ? ' - ' + m.summary.slice(0, 200) : ''}`)
    .join('\n')

  const prompt = `You are a personal journal generator. Based on the following activity data from ${date}, generate a reflective daily journal entry.

${contextSummary ? `App activity:\n${contextSummary}\n` : 'No app activity data available.\n'}
${meetingSummary ? `Meetings:\n${meetingSummary}\n` : ''}

Generate a journal entry with:
1. A creative title for the day
2. A TLDR (1 sentence)
3. A reflective journal entry (3-5 paragraphs, written in first person, focusing on key activities, themes, and reflections)

${!contextSummary && !meetingSummary ? 'Since no activity data is available, generate a general reflective journal prompt for the day.' : ''}

Format as JSON:
{
  "title": "...",
  "tldr": "...",
  "content": "..."
}`

  const response = await chatCompletion(
    [{ role: 'user', content: prompt }],
    INTERNAL_MODEL
  )

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
  } catch {
    // Fallback
  }

  return {
    title: `Journal - ${date}`,
    tldr: 'A day of work and reflection.',
    content: response
  }
}
