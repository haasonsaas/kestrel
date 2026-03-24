import { getDatabase } from '../db'
import * as schema from '../db/schema'
import { PRIVACY_CATEGORIES, ALWAYS_EXCLUDED_DOMAINS } from './categories'
import type { AppContext } from '../../shared/ipc'

export function shouldExcludeContext(context: AppContext): boolean {
  const db = getDatabase()
  const rules = db.select().from(schema.privacyRules).all()

  // Check always-excluded domains
  if (context.url) {
    const domain = extractDomain(context.url)
    if (domain && ALWAYS_EXCLUDED_DOMAINS.some((d) => domain.endsWith(d))) {
      return true
    }
  }

  for (const rule of rules) {
    if (!rule.enabled) continue

    switch (rule.type) {
      case 'app':
        if (context.bundleId === rule.value || context.appName === rule.value) {
          return true
        }
        break

      case 'domain':
        if (context.url) {
          const domain = extractDomain(context.url)
          if (domain && domain.endsWith(rule.value)) {
            return true
          }
        }
        break

      case 'category': {
        const category = PRIVACY_CATEGORIES.find((c) => c.id === rule.value)
        if (category && context.url) {
          const domain = extractDomain(context.url)
          if (domain && category.domains.some((d) => domain.endsWith(d))) {
            return true
          }
        }
        break
      }
    }
  }

  return false
}

function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url)
    return parsed.hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}
