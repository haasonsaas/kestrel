import { ipcMain } from 'electron'
import { getEvalOpsAuthStatus, loginEvalOps, logoutEvalOps } from './auth'
import type { EvalOpsLoginOptions } from '../../shared/ipc'

export function registerEvalOpsHandlers(): void {
  ipcMain.handle('evalops:authStatus', async () => getEvalOpsAuthStatus())
  ipcMain.handle('evalops:login', async (_event, options?: EvalOpsLoginOptions) => {
    return loginEvalOps(options)
  })
  ipcMain.handle('evalops:logout', async () => logoutEvalOps())
  ipcMain.handle('evalops:refreshAuth', async () => getEvalOpsAuthStatus())
}
