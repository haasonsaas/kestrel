import { ipcMain } from 'electron'
import { getEvalOpsAuthStatus, loginEvalOps, logoutEvalOps } from './auth'
import { registerKestrelAgentInBackground } from './registration'
import {
  flushEvalOpsMemorySyncQueue,
  getEvalOpsMemorySyncQueueStatus
} from './memory-sync'
import {
  annotateEvalOpsTraceQuality,
  getEvalOpsServicesStatus,
  ingestEvalOpsSpans,
  listEvalOpsAgents,
  listEvalOpsApprovals,
  listEvalOpsSkills,
  listEvalOpsTraces,
  recallEvalOpsMemory,
  recordEvalOpsArenaTrace,
  recordEvalOpsArenaVote,
  searchEvalOpsSkills,
  storeEvalOpsMemory
} from './services'
import type {
  EvalOpsAnnotateTraceQualityRequest,
  EvalOpsIngestSpansRequest,
  EvalOpsListApprovalsRequest,
  EvalOpsListAgentsRequest,
  EvalOpsListSkillsRequest,
  EvalOpsListTracesRequest,
  EvalOpsLoginOptions,
  EvalOpsRecallMemoryRequest,
  EvalOpsRecordArenaTraceRequest,
  EvalOpsRecordArenaVoteRequest,
  EvalOpsSearchSkillsRequest,
  EvalOpsStoreMemoryRequest
} from '../../shared/ipc'

export function registerEvalOpsHandlers(): void {
  ipcMain.handle('evalops:authStatus', async () => getEvalOpsAuthStatus())
  ipcMain.handle('evalops:login', async (_event, options?: EvalOpsLoginOptions) => {
    const status = await loginEvalOps(options)
    if (status.authenticated) {
      registerKestrelAgentInBackground()
      void flushEvalOpsMemorySyncQueue({ force: true }).catch((err) => {
        console.warn('[evalops:memory] Failed to flush queued memory syncs after login:', err)
      })
    }
    return status
  })
  ipcMain.handle('evalops:logout', async () => logoutEvalOps())
  ipcMain.handle('evalops:refreshAuth', async () => getEvalOpsAuthStatus())
  ipcMain.handle('evalops:servicesStatus', async () => getEvalOpsServicesStatus())
  ipcMain.handle('evalops:memorySync:status', async () => getEvalOpsMemorySyncQueueStatus())
  ipcMain.handle('evalops:memorySync:flush', async () => {
    await flushEvalOpsMemorySyncQueue({ force: true })
    return getEvalOpsMemorySyncQueueStatus()
  })
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
  ipcMain.handle('evalops:traces:annotateQuality', async (_event, request: EvalOpsAnnotateTraceQualityRequest) => {
    return annotateEvalOpsTraceQuality(request)
  })
  ipcMain.handle('evalops:arena:recordTrace', async (_event, request: EvalOpsRecordArenaTraceRequest) => {
    return recordEvalOpsArenaTrace(request)
  })
  ipcMain.handle('evalops:arena:recordVote', async (_event, request: EvalOpsRecordArenaVoteRequest) => {
    return recordEvalOpsArenaVote(request)
  })
}
