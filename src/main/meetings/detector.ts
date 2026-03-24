// Detect active meeting applications
const MEETING_APPS: Record<string, string> = {
  'us.zoom.xos': 'Zoom',
  'com.google.Chrome': 'Google Meet', // Detected via URL
  'com.microsoft.teams': 'Microsoft Teams',
  'com.microsoft.teams2': 'Microsoft Teams',
  'com.cisco.webexmeetings': 'Webex',
  'com.GoToMeeting': 'GoTo Meeting',
  'com.tinyspeck.slackmacgap': 'Slack Huddle', // Detected via context
  'com.whereby.app': 'Whereby'
}

const MEETING_URLS = [
  'meet.google.com',
  'teams.microsoft.com',
  'zoom.us/j/',
  'zoom.us/my/',
  'whereby.com/',
  'webex.com/meet'
]

export interface MeetingDetection {
  detected: boolean
  app: string
  title: string
}

export function detectMeeting(
  bundleId: string,
  url?: string,
  windowTitle?: string
): MeetingDetection {
  // Check by bundle ID first
  if (MEETING_APPS[bundleId] && bundleId !== 'com.google.Chrome') {
    console.log(`[detector] HIT bundle match: bundleId=${bundleId} → ${MEETING_APPS[bundleId]}`)
    return {
      detected: true,
      app: MEETING_APPS[bundleId],
      title: windowTitle || MEETING_APPS[bundleId]
    }
  }

  // Check by URL for browser-based meetings
  if (url) {
    for (const meetUrl of MEETING_URLS) {
      if (url.includes(meetUrl)) {
        const appName =
          url.includes('meet.google.com')
            ? 'Google Meet'
            : url.includes('teams.microsoft')
              ? 'Microsoft Teams'
              : url.includes('zoom.us')
                ? 'Zoom'
                : url.includes('whereby')
                  ? 'Whereby'
                  : 'Meeting'

        console.log(`[detector] HIT URL match: url=${url} matched=${meetUrl} → ${appName}`)
        return {
          detected: true,
          app: appName,
          title: windowTitle || appName
        }
      }
    }
    // URL provided but didn't match any meeting URL
    console.log(`[detector] MISS — url present but no match: ${url.slice(0, 80)}`)
  } else {
    // No URL at all for this app
    console.log(`[detector] MISS — no url provided for bundleId=${bundleId} (not a known non-Chrome meeting app)`)
  }

  return { detected: false, app: '', title: '' }
}
