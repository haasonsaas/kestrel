import { getEvalOpsAccessToken, getStoredEvalOpsSession } from './auth'

const CONNECT_PROTOCOL_VERSION = '1'

export interface ConnectUnaryInput {
  baseUrl: string
  service: string
  method: string
  body?: Record<string, unknown>
  headers?: Record<string, string>
}

export class EvalOpsConnectError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string
  ) {
    super(message)
    this.name = 'EvalOpsConnectError'
  }
}

export async function evalOpsUnary<T>(input: ConnectUnaryInput): Promise<T> {
  const token = await getEvalOpsAccessToken()
  const session = getStoredEvalOpsSession()
  const url = `${input.baseUrl.replace(/\/+$/, '')}/${input.service}/${input.method}`
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    'Connect-Protocol-Version': CONNECT_PROTOCOL_VERSION,
    'Content-Type': 'application/json',
    ...input.headers
  }

  if (session?.organizationId) {
    headers['X-Organization-ID'] = session.organizationId
    headers['X-Workspace-ID'] = session.organizationId
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(input.body ?? {})
  })

  if (!response.ok) {
    const body = await response.text()
    throw new EvalOpsConnectError(
      `EvalOps ${input.service}/${input.method} failed (${response.status}): ${body}`,
      response.status,
      body
    )
  }

  if (response.status === 204) {
    return {} as T
  }

  return await response.json() as T
}
