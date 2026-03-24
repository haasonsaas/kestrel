import { makeAutoObservable, runInAction } from 'mobx'
import type { Meeting, MeetingStatus } from '../../../../shared/ipc'

class MeetingStore {
  meetings: Meeting[] = []
  activeMeetingStatus: MeetingStatus | null = null
  selectedMeetingId: string | null = null
  isLoading = false

  constructor() {
    makeAutoObservable(this)
    this.init()
  }

  private async init() {
    await this.loadMeetings()
    this.setupEventListeners()
    // Always poll status — picks up auto-started meetings from main process
    setInterval(() => this.pollStatus(), 2000)
  }

  private setupEventListeners() {
    // Listen for auto-detected meetings
    window.api.on('meeting:detected', (data: { app: string; title: string; meetingId: string }) => {
      console.log('[meetingStore] Auto-detected meeting:', data)
      runInAction(() => {
        this.activeMeetingStatus = {
          id: data.meetingId,
          active: true,
          title: data.title,
          app: data.app,
          duration: 0,
          recording: true
        }
        this.selectedMeetingId = data.meetingId
      })
      this.loadMeetings()
    })

    // Listen for auto-stopped meetings
    window.api.on('meeting:autoStopped', (data: { meetingId: string }) => {
      console.log('[meetingStore] Auto-stopped meeting:', data.meetingId)
      runInAction(() => {
        this.activeMeetingStatus = null
      })
      this.loadMeetings()
      this.pollForTranscript(data.meetingId)
    })

    // Listen for transcription failures
    window.api.on('meeting:transcriptionFailed', (data: { meetingId: string; error: string }) => {
      console.log('[meetingStore] Transcription failed:', data.error)
      this.loadMeetings()
    })
  }

  async loadMeetings() {
    const meetings = await window.api.invoke('meetings:list')
    runInAction(() => {
      this.meetings = meetings
    })
  }

  async startMeeting() {
    const result = await window.api.invoke('meeting:start')
    const meetingId = result.id
    runInAction(() => {
      this.activeMeetingStatus = {
        id: meetingId,
        active: true,
        title: 'Meeting',
        app: 'Manual',
        duration: 0,
        recording: true
      }
      this.selectedMeetingId = meetingId
    })
    await this.loadMeetings()
    return meetingId
  }

  async stopMeeting() {
    if (!this.activeMeetingStatus) return
    const meetingId = this.activeMeetingStatus.id
    await window.api.invoke('meeting:stop', meetingId)
    runInAction(() => {
      this.activeMeetingStatus = null
    })
    await this.loadMeetings()
    this.pollForTranscript(meetingId)
  }

  private pollForTranscript(meetingId: string) {
    let attempts = 0
    const timer = setInterval(async () => {
      attempts++
      await this.loadMeetings()
      const meeting = this.meetings.find(m => m.id === meetingId)
      if (meeting?.transcript || meeting?.summary || attempts > 30) {
        clearInterval(timer)
      }
    }, 3000)
  }

  private async pollStatus() {
    // ALWAYS check main process for active meetings — catches auto-started recordings
    try {
      const status = await window.api.invoke('meeting:status')
      runInAction(() => {
        if (status && !this.activeMeetingStatus) {
          // Main process has an active meeting we didn't know about
          this.activeMeetingStatus = status
          this.selectedMeetingId = status.id
          this.loadMeetings()
        } else if (status) {
          this.activeMeetingStatus = status
        } else if (!status && this.activeMeetingStatus) {
          // Meeting ended in main process
          const endedId = this.activeMeetingStatus.id
          this.activeMeetingStatus = null
          this.loadMeetings()
          this.pollForTranscript(endedId)
        }
      })
    } catch {
      // Ignore poll errors
    }
  }

  selectMeeting(id: string) {
    this.selectedMeetingId = id
  }

  get selectedMeeting(): Meeting | null {
    return this.meetings.find((m) => m.id === this.selectedMeetingId) || null
  }

  get isRecording(): boolean {
    return this.activeMeetingStatus?.active ?? false
  }
}

export const meetingStore = new MeetingStore()
