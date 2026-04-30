# @evalops/kestrel-sdk

JavaScript SDK foundation for Kestrel desktop integrations with EvalOps
Platform services.

## Platform Consumer Kit

Kestrel uses the SDK's Platform Consumer Kit helpers to keep auth headers,
service endpoints, feature flags, and conformance checks consistent with other
EvalOps consumers.

```ts
import {
  buildEvalOpsConsumerClientConfig,
  scoreEvalOpsConsumerConformance
} from '@evalops/kestrel-sdk'

const config = buildEvalOpsConsumerClientConfig({
  organizationId: 'org_123',
  workspaceId: 'workspace_123',
  agentId: 'kestrel-desktop',
  token: process.env.EVALOPS_TOKEN,
  endpoints: {
    baseUrl: 'https://api.evalops.dev',
    agentRegistryBaseUrl: 'https://agent-registry.evalops.dev',
    memoryBaseUrl: 'https://memory.evalops.dev',
    approvalsBaseUrl: 'https://approvals.evalops.dev',
    tracesBaseUrl: 'https://traces.evalops.dev'
  },
  featureFlags: { kestrel: true }
})

const score = scoreEvalOpsConsumerConformance([
  'auth-session',
  'service-discovery',
  'agent-registration',
  'prompts',
  'memory-read',
  'memory-write',
  'approvals',
  'traces',
  'llm-gateway'
])
```

The required conformance checks cover:

- auth/session headers with organization/workspace scope;
- centralized service endpoint discovery;
- durable agent registration;
- Platform prompts, memory, approvals, traces, and LLM Gateway usage;
- correlation IDs for trace/audit joins.

Optional checks cover local retry queues, `evalops://` deep links, and explicit
offline fallback reporting.

## Publish

```bash
npm run build
npm run pack:dry
npm publish --access public
```
