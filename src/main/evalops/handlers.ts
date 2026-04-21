import { ipcMain } from 'electron'
import { getEvalOpsAuthStatus, loginEvalOps, logoutEvalOps } from './auth'
import { registerKestrelAgentInBackground } from './registration'
import {
  getEvalOpsServicesStatus,
  ingestEvalOpsSpans,
  listEvalOpsAgents,
  listEvalOpsApprovals,
  listEvalOpsSkills,
  listEvalOpsTraces,
  recallEvalOpsMemory,
  searchEvalOpsSkills,
  storeEvalOpsMemory
} from './services'
import type {
  EvalOpsIngestSpansRequest,
  EvalOpsListApprovalsRequest,
  EvalOpsListAgentsRequest,
  EvalOpsListSkillsRequest,
  EvalOpsListTracesRequest,
  EvalOpsLoginOptions,
  EvalOpsRecallMemoryRequest,
  EvalOpsSearchSkillsRequest,
  EvalOpsStoreMemoryRequest
} from '../../shared/ipc'

export function registerEvalOpsHandlers(): void {
  ipcMain.handle('evalops:authStatus', async () => getEvalOpsAuthStatus())
  ipcMain.handle('evalops:login', async (_event, options?: EvalOpsLoginOptions) => {
    const status = await loginEvalOps(options)
    if (status.authenticated) registerKestrelAgentInBackground('login')
    return status
  })
  ipcMain.handle('evalops:logout', async () => logoutEvalOps())
  ipcMain.handle('evalops:refreshAuth', async () => getEvalOpsAuthStatus())
  ipcMain.handle('evalops:servicesStatus', async () => getEvalOpsServicesStatus())
  ipcMain.handle('evalops:agents:list', async (_event, request?: EvalOpsListAgentsRequest) => {
    return listEvalOpsAgents(request)
  })
  ipcMain.handle('evalops:skills:list', async (_event, request?: EvalOpsListSkillsRequest) => {
    return listEvalOpsSkills(request)
  })
  ipcMain.handle('evalops:skills:search', async (_event, request: EvalOpsSearchSkillsRequest) => {
    return searchEvalOpsSkills(request)
  })
  ipcMain.handle('evalops:memory:recall', async (_event, request: EvalOpsRecallMemoryRequest) => {
    return recallEvalOpsMemory(request)
  })
  ipcMain.handle('evalops:memory:store', async (_event, request: EvalOpsStoreMemoryRequest) => {
    return storeEvalOpsMemory(request)
  })
  ipcMain.handle('evalops:approvals:list', async (_event, request?: EvalOpsListApprovalsRequest) => {
    return listEvalOpsApprovals(request)
  })
  ipcMain.handle('evalops:traces:list', async (_event, request?: EvalOpsListTracesRequest) => {
    return listEvalOpsTraces(request)
  })
  ipcMain.handle('evalops:traces:ingest', async (_event, request: EvalOpsIngestSpansRequest) => {
    return ingestEvalOpsSpans(request)
  })
}
