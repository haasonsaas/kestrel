import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { BrowserWindow } from 'electron'
import type { MCPServerConfig, MCPServerStatus, MCPTool } from '../../shared/ipc'

interface ServerConnection {
  config: MCPServerConfig
  client: Client
  transport: StdioClientTransport
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  tools: Array<{ name: string; description: string; inputSchema: unknown }>
  error?: string
}

export class MCPServerManager {
  private connections = new Map<string, ServerConnection>()
  private mainWindow: BrowserWindow | null = null

  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window
  }

  async startServer(config: MCPServerConfig): Promise<void> {
    if (this.connections.has(config.name)) {
      await this.stopServer(config.name)
    }

    if (!config.command) {
      throw new Error(`Server ${config.name}: no command specified`)
    }

    const client = new Client({
      name: 'kestrel',
      version: '0.5.0'
    })

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      env: { ...process.env, ...config.env } as Record<string, string>
    })

    const conn: ServerConnection = {
      config,
      client,
      transport,
      status: 'connecting',
      tools: []
    }

    this.connections.set(config.name, conn)
    this.emitStatusUpdate()

    try {
      // Connect with timeout
      await Promise.race([
        client.connect(transport),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Server startup timed out')), 15000)
        )
      ])

      // Discover tools
      const { tools } = await client.listTools()
      conn.tools = tools.map((t) => ({
        name: t.name,
        description: t.description ?? '',
        inputSchema: t.inputSchema
      }))
      conn.status = 'connected'

      console.log(`[MCP] Server "${config.name}" connected with ${conn.tools.length} tools`)
    } catch (err) {
      conn.status = 'error'
      conn.error = err instanceof Error ? err.message : String(err)
      console.error(`[MCP] Server "${config.name}" failed:`, conn.error)
      try {
        await client.close()
      } catch {
        /* ignore */
      }
    }

    this.emitStatusUpdate()
  }

  async stopServer(name: string): Promise<void> {
    const conn = this.connections.get(name)
    if (!conn) return

    try {
      await conn.client.close()
    } catch {
      /* ignore */
    }

    this.connections.delete(name)
    this.emitStatusUpdate()
    console.log(`[MCP] Server "${name}" stopped`)
  }

  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<string> {
    const conn = this.connections.get(serverName)
    if (!conn || conn.status !== 'connected') {
      throw new Error(`Server ${serverName} is not connected`)
    }

    const result = await Promise.race([
      conn.client.callTool({ name: toolName, arguments: args }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Tool call timed out')), 60000)
      )
    ])

    return (result.content as Array<{ type: string; text?: string }>)
      .filter((block) => block.type === 'text' && block.text)
      .map((block) => block.text!)
      .join('\n')
  }

  getStatus(): MCPServerStatus[] {
    return Array.from(this.connections.values()).map((conn) => ({
      name: conn.config.name,
      status: conn.status,
      tools: conn.tools.map((t) => t.name),
      error: conn.error
    }))
  }

  getAllTools(): MCPTool[] {
    const allTools: MCPTool[] = []
    for (const [serverName, conn] of this.connections) {
      if (conn.status !== 'connected') continue
      for (const tool of conn.tools) {
        allTools.push({
          server: serverName,
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        })
      }
    }
    return allTools
  }

  getTool(serverName: string, toolName: string): MCPTool | null {
    const conn = this.connections.get(serverName)
    if (!conn || conn.status !== 'connected') return null
    const tool = conn.tools.find((candidate) => candidate.name === toolName)
    if (!tool) return null
    return {
      server: serverName,
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }
  }

  async stopAll(): Promise<void> {
    const names = Array.from(this.connections.keys())
    await Promise.all(names.map((name) => this.stopServer(name)))
  }

  private emitStatusUpdate() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('mcp:statusUpdate', this.getStatus())
    }
  }
}
