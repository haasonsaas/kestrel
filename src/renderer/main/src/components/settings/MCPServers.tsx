import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Plug, Plus, Trash2, RefreshCw, Terminal, Check, X, AlertCircle } from 'lucide-react'
import type { MCPServerStatus } from '../../../../../shared/ipc'

export function MCPServers() {
  const [servers, setServers] = useState<MCPServerStatus[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCommand, setNewCommand] = useState('')
  const [newArgs, setNewArgs] = useState('')

  useEffect(() => {
    loadServers()
    const unsub = window.api.on('mcp:statusUpdate', (status) => {
      setServers(status)
    })
    return unsub
  }, [])

  const loadServers = async () => {
    const status = await window.api.invoke('mcp:listServers')
    setServers(status)
  }

  const addServer = useCallback(async () => {
    if (!newName.trim() || !newCommand.trim()) return

    await window.api.invoke('mcp:startServer', {
      name: newName.trim(),
      command: newCommand.trim(),
      args: newArgs.trim() ? newArgs.split(' ') : [],
      enabled: true
    })

    setNewName('')
    setNewCommand('')
    setNewArgs('')
    setShowAdd(false)
    loadServers()
  }, [newName, newCommand, newArgs])

  const stopServer = useCallback(async (name: string) => {
    await window.api.invoke('mcp:stopServer', name)
    loadServers()
  }, [])

  return (
    <div>
      <h3 className="text-xl font-semibold mb-2">MCP Servers</h3>
      <p className="text-sm text-muted-foreground mb-6">
        Connect Model Context Protocol servers for extensible tool support.
        Uses the same config format as Claude Desktop.
      </p>

      {/* Server list */}
      <div className="space-y-2 mb-4">
        {servers.map((server) => (
          <div
            key={server.name}
            className="flex items-center justify-between p-4 rounded-xl border border-border"
          >
            <div className="flex items-center gap-3">
              <StatusIndicator status={server.status} />
              <div>
                <p className="text-sm font-medium">{server.name}</p>
                <p className="text-xs text-muted-foreground">
                  {server.status === 'connected'
                    ? `${server.tools.length} tools available`
                    : server.status === 'error'
                      ? server.error
                      : server.status}
                </p>
                {server.tools.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {server.tools.slice(0, 5).map((tool) => (
                      <span key={tool} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">
                        {tool}
                      </span>
                    ))}
                    {server.tools.length > 5 && (
                      <span className="text-[10px] text-muted-foreground">
                        +{server.tools.length - 5} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={() => stopServer(server.name)}
              className="p-2 text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}

        {servers.length === 0 && !showAdd && (
          <div className="text-center py-8 text-muted-foreground">
            <Plug className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No MCP servers configured.</p>
            <p className="text-xs mt-1">Add a server to extend Kestrel's capabilities.</p>
          </div>
        )}
      </div>

      {/* Add server form */}
      {showAdd ? (
        <div className="p-4 rounded-xl border border-border space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium">Name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="filesystem"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Command</label>
            <input
              value={newCommand}
              onChange={(e) => setNewCommand(e.target.value)}
              placeholder="npx"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Arguments (space-separated)</label>
            <input
              value={newArgs}
              onChange={(e) => setNewArgs(e.target.value)}
              placeholder="-y @modelcontextprotocol/server-filesystem /Users/me/Documents"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={addServer}
              disabled={!newName.trim() || !newCommand.trim()}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
            >
              Connect
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add MCP Server
        </button>
      )}
    </div>
  )
}

function StatusIndicator({ status }: { status: string }) {
  switch (status) {
    case 'connected':
      return <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
    case 'connecting':
      return <RefreshCw className="h-3 w-3 text-yellow-500 animate-spin" />
    case 'error':
      return <AlertCircle className="h-3.5 w-3.5 text-red-500" />
    default:
      return <div className="w-2.5 h-2.5 rounded-full bg-gray-400" />
  }
}
