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

### Kestrel Adopter Inventory

The kit is extracted from Kestrel's current EvalOps integration surface:

| Surface | Kestrel role | Consumer kit contract |
| --- | --- | --- |
| Auth/session | Desktop auth context forwards tenant, workspace, and agent identity. | Build scoped headers with organization, workspace, agent, and trace IDs. |
| Service discovery/config | Runtime config selects Platform service URLs and feature flags. | Keep endpoint overrides in one bootstrap object. |
| Agent registration | Desktop agent identity is durable across app restarts. | Require stable agent and workspace IDs before Platform calls. |
| Prompts | Assistant flows can resolve shared prompts before local fallback. | Score prompt resolution as a required capability. |
| Memory | Recall and writes are scoped to workspace/user/agent privacy intent. | Treat read and write paths as separate required capabilities. |
| Approvals | Human decisions should link back to Platform approval records. | Include approvals as a required consumer boundary. |
| Traces | Wide events need correlation IDs for audit joins. | Preserve trace IDs in headers and conformance evidence. |
| LLM Gateway | Model calls route through EvalOps provider refs. | Require an EvalOps gateway base URL and provider binding. |
| Local retry queue | Offline desktop writes are retried with bounded local state. | Expose retry queue behavior as an optional but scored capability. |
| Deep links | `evalops://` routes can return users to desktop context. | Score deep links as optional adopter evidence. |

### Second Adopter Fixture

`examples/node-agent-adopter.ts` proves the kit shape against a non-Kestrel
background worker. It builds a scoped client config, declares the same required
Platform capabilities, and fails fast if a required conformance check is missing.

```bash
npm run build
npm run typecheck:examples
```

## Publish

```bash
npm run build
npm run typecheck:examples
npm run pack:dry
npm publish --access public
```
