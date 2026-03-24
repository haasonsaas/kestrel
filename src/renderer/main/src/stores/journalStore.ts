import { makeAutoObservable, runInAction } from 'mobx'
import { format } from 'date-fns'
import type { JournalEntry } from '../../../../shared/ipc'

class JournalStore {
  entries: JournalEntry[] = []
  selectedDate: string = format(new Date(), 'yyyy-MM-dd')
  currentEntry: JournalEntry | null = null
  isGenerating = false
  isLoading = false

  constructor() {
    makeAutoObservable(this)
    this.loadEntries()
    this.loadEntry(this.selectedDate)
  }

  async loadEntries() {
    runInAction(() => { this.isLoading = true })
    const entries = await window.api.invoke('journal:list')
    runInAction(() => {
      this.entries = entries
      this.isLoading = false
    })
  }

  async loadEntry(date: string) {
    const entry = await window.api.invoke('journal:get', date)
    runInAction(() => {
      this.currentEntry = entry
    })
  }

  setSelectedDate(date: string) {
    this.selectedDate = date
    this.loadEntry(date)
  }

  async generateEntry() {
    runInAction(() => { this.isGenerating = true })

    try {
      const entry = await window.api.invoke('journal:generate', this.selectedDate)

      runInAction(() => {
        this.currentEntry = entry
      })

      await this.loadEntries()
    } finally {
      runInAction(() => { this.isGenerating = false })
    }
  }

  get entryDates(): Set<string> {
    return new Set(this.entries.map((e) => e.date))
  }
}

export const journalStore = new JournalStore()
