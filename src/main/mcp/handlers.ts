import { ipcMain } from 'electron'
import { MCPServerManager } from './manager'
import type { MCPServerConfig } from '../../shared/ipc'

export function registerMCPHandlers(manager: MCPServerManager): void {
  ipcMain.handle('mcp:listServers', async () => {
    return manager.getStatus()
  })

  ipcMain.handle('mcp:startServer', async (_e, config: MCPServerConfig) => {
    await manager.startServer(config)
  })

  ipcMain.handle('mcp:stopServer', async (_e, name: string) => {
    await manager.stopServer(name)
  })

  ipcMain.handle('mcp:listTools', async () => {
    return manager.getAllTools()
  })
}
