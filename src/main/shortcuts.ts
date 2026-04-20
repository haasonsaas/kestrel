import { globalShortcut, ipcMain } from 'electron'
import { deleteSettingValue, getSettingValue, setSettingValue } from './evalops/settings'
import type { KeyboardShortcut, KeyboardShortcutId } from '../shared/ipc'

const SHORTCUTS_SETTING_KEY = 'keyboard_shortcuts'

interface ShortcutAction {
  id: KeyboardShortcutId
  label: string
  description: string
  defaultAccelerator: string
  run: () => void | Promise<void>
}

let actions: ShortcutAction[] = []
let registeredAccelerators = new Set<string>()
let lastStatuses: KeyboardShortcut[] = []

export function registerKeyboardShortcutHandlers(nextActions: ShortcutAction[]): void {
  actions = nextActions
  registerAllShortcuts()

  ipcMain.handle('shortcuts:list', () => getKeyboardShortcuts())
  ipcMain.handle('shortcuts:update', (_event, updates: Array<{ id: KeyboardShortcutId; accelerator: string }>) => {
    const stored = loadStoredShortcuts()
    for (const update of updates) {
      const accelerator = update.accelerator.trim()
      if (accelerator) stored[update.id] = accelerator
      else delete stored[update.id]
    }
    setSettingValue(SHORTCUTS_SETTING_KEY, stored)
    registerAllShortcuts()
    return getKeyboardShortcuts()
  })
  ipcMain.handle('shortcuts:reset', () => {
    deleteSettingValue(SHORTCUTS_SETTING_KEY)
    registerAllShortcuts()
    return getKeyboardShortcuts()
  })
}

export function unregisterKeyboardShortcuts(): void {
  for (const accelerator of registeredAccelerators) {
    globalShortcut.unregister(accelerator)
  }
  registeredAccelerators = new Set()
}

function getKeyboardShortcuts(): KeyboardShortcut[] {
  if (lastStatuses.length === 0) registerAllShortcuts()
  return lastStatuses
}

function registerAllShortcuts(): void {
  unregisterKeyboardShortcuts()
  const stored = loadStoredShortcuts()
  const statuses: KeyboardShortcut[] = []

  for (const action of actions) {
    const accelerator = stored[action.id] || action.defaultAccelerator
    const shortcut: KeyboardShortcut = {
      id: action.id,
      label: action.label,
      description: action.description,
      defaultAccelerator: action.defaultAccelerator,
      accelerator,
      registered: false
    }

    if (!accelerator.trim()) {
      shortcut.error = 'Shortcut disabled.'
      statuses.push(shortcut)
      continue
    }

    try {
      const registered = globalShortcut.register(accelerator, () => {
        void action.run()
      })
      shortcut.registered = registered
      if (registered) {
        registeredAccelerators.add(accelerator)
      } else {
        shortcut.error = 'Accelerator could not be registered. It may already be in use.'
      }
    } catch (err) {
      shortcut.error = err instanceof Error ? err.message : String(err)
    }
    statuses.push(shortcut)
  }

  lastStatuses = statuses
}

function loadStoredShortcuts(): Partial<Record<KeyboardShortcutId, string>> {
  const stored = getSettingValue<Partial<Record<KeyboardShortcutId, string>>>(SHORTCUTS_SETTING_KEY)
  return stored ?? {}
}
