import { WideEvent } from '../observability/wide-event'

export type PiiKind = 'email' | 'phone' | 'ssn' | 'credit_card'

export interface PiiRedactionSummary {
  total: number
  byKind: Record<PiiKind, number>
}

export interface PiiRedactionResult {
  text: string
  summary: PiiRedactionSummary
}

const EMPTY_SUMMARY: PiiRedactionSummary = {
  total: 0,
  byKind: {
    email: 0,
    phone: 0,
    ssn: 0,
    credit_card: 0
  }
}

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const SSN_PATTERN = /\b(?!000|666|9\d\d)\d{3}[- ]?(?!00)\d{2}[- ]?(?!0000)\d{4}\b/g
const PHONE_PATTERN = /\b(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}\b/g
const CREDIT_CARD_CANDIDATE_PATTERN = /\b(?:\d[ -]?){13,19}\b/g

const REDACTION_LABELS: Record<PiiKind, string> = {
  email: '[REDACTED-EMAIL]',
  phone: '[REDACTED-PHONE]',
  ssn: '[REDACTED-SSN]',
  credit_card: '[REDACTED-CC]'
}

/**
 * Local deterministic PII redaction for context before it leaves the device.
 * This catches common high-confidence patterns without sending raw text to a
 * remote classifier first.
 */
export function redactPiiText(text: string): PiiRedactionResult {
  const summary = cloneSummary()
  let redacted = text

  redacted = redactPattern(redacted, EMAIL_PATTERN, 'email', summary)
  redacted = redactPattern(redacted, SSN_PATTERN, 'ssn', summary)
  redacted = redactCreditCards(redacted, summary)
  redacted = redactPattern(redacted, PHONE_PATTERN, 'phone', summary)

  return { text: redacted, summary }
}

export function redactPiiForPlatform(
  text: string,
  source: string,
  fields: Record<string, string | number | boolean | null> = {}
): PiiRedactionResult {
  const result = redactPiiText(text)
  if (result.summary.total > 0) {
    WideEvent.emit('pii_redaction', {
      source,
      pii_span_count: result.summary.total,
      pii_email_count: result.summary.byKind.email,
      pii_phone_count: result.summary.byKind.phone,
      pii_ssn_count: result.summary.byKind.ssn,
      pii_credit_card_count: result.summary.byKind.credit_card,
      ...fields
    })
  }
  return result
}

export function hasPiiRedactions(summary: PiiRedactionSummary | null | undefined): boolean {
  return Boolean(summary && summary.total > 0)
}

export function piiSummaryLabel(summary: PiiRedactionSummary): string {
  return (Object.entries(summary.byKind) as Array<[PiiKind, number]>)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${count} ${kind.replace('_', ' ')}`)
    .join(', ')
}

function redactPattern(
  text: string,
  pattern: RegExp,
  kind: PiiKind,
  summary: PiiRedactionSummary
): string {
  return text.replace(pattern, () => {
    summary.total++
    summary.byKind[kind]++
    return REDACTION_LABELS[kind]
  })
}

function redactCreditCards(text: string, summary: PiiRedactionSummary): string {
  return text.replace(CREDIT_CARD_CANDIDATE_PATTERN, (match) => {
    const digits = match.replace(/\D/g, '')
    if (!isLikelyCreditCard(digits)) return match
    summary.total++
    summary.byKind.credit_card++
    return REDACTION_LABELS.credit_card
  })
}

function isLikelyCreditCard(digits: string): boolean {
  if (digits.length < 13 || digits.length > 19) return false
  if (/^(\d)\1+$/.test(digits)) return false
  return passesLuhn(digits)
}

function passesLuhn(digits: string): boolean {
  let sum = 0
  let shouldDouble = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = Number(digits[i])
    if (!Number.isInteger(digit)) return false
    if (shouldDouble) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    shouldDouble = !shouldDouble
  }
  return sum % 10 === 0
}

function cloneSummary(): PiiRedactionSummary {
  return {
    total: EMPTY_SUMMARY.total,
    byKind: { ...EMPTY_SUMMARY.byKind }
  }
}
