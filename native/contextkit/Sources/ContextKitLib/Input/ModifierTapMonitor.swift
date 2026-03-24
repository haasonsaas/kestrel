import Cocoa
import Foundation

/// Monitors global modifier key events to detect double-tap and hold gestures.
///
/// Uses `NSEvent.addGlobalMonitorForEvents(matching: .flagsChanged)` to track
/// modifier key state transitions. Detects two gesture types:
///   - **Double-tap**: rapid press-release cycles (each < `maxHoldDuration`,
///     all within `tapInterval`)
///   - **Hold**: a single press held longer than `maxHoldDuration`
///
/// Must be started on the main thread (requires the main run loop).
public final class ModifierTapMonitor {

    // MARK: - Public types

    public enum Event {
        /// The required number of rapid taps was detected.
        case tap
        /// The modifier has been held longer than `maxHoldDuration`.
        case holdStarted
        /// The modifier was released after a hold.
        case holdReleased
    }

    public typealias EventCallback = (Event) -> Void

    // MARK: - Configuration

    /// Which modifier to watch (default: Option / Alt).
    public let modifier: NSEvent.ModifierFlags

    /// Number of rapid taps required to fire `.tap` (default: 2).
    public let requiredTaps: Int

    /// Maximum elapsed time between the first tap-down and the last tap-up
    /// for the sequence to count as a multi-tap (default: 0.4 s).
    public let tapInterval: TimeInterval

    /// Maximum duration a single press can be held and still count as a tap
    /// rather than a hold (default: 0.3 s). Once a press exceeds this
    /// duration, `.holdStarted` fires instead.
    public let maxHoldDuration: TimeInterval

    // MARK: - Private state

    private let callback: EventCallback

    /// The global event monitor handle returned by AppKit.
    private var monitor: Any?

    /// Timer that fires when the current press has been held long enough
    /// to transition from "potential tap" to "hold".
    private var holdTimer: Timer?

    /// Timestamp of the current (or most recent) modifier key-down.
    private var pressTimestamp: TimeInterval = 0

    /// `true` while the monitored modifier is physically pressed.
    private var isPressed = false

    /// `true` after `.holdStarted` has been sent for the current press.
    private var holdActive = false

    /// Timestamps of recent key-down events that qualified as taps
    /// (i.e., the subsequent release arrived within `maxHoldDuration`).
    private var tapDownTimestamps: [TimeInterval] = []

    // MARK: - Init

    public init(
        modifier: NSEvent.ModifierFlags = .option,
        requiredTaps: Int = 2,
        tapInterval: TimeInterval = 0.4,
        maxHoldDuration: TimeInterval = 0.3,
        callback: @escaping EventCallback
    ) {
        self.modifier = modifier
        self.requiredTaps = requiredTaps
        self.tapInterval = tapInterval
        self.maxHoldDuration = maxHoldDuration
        self.callback = callback
    }

    deinit {
        stop()
    }

    // MARK: - Public API

    /// Begin monitoring. Must be called on the main thread.
    public func start() {
        guard monitor == nil else { return }

        monitor = NSEvent.addGlobalMonitorForEvents(matching: .flagsChanged) { [weak self] event in
            self?.handleFlagsChanged(event)
        }
    }

    /// Stop monitoring and clean up.
    public func stop() {
        if let monitor = monitor {
            NSEvent.removeMonitor(monitor)
            self.monitor = nil
        }
        cancelHoldTimer()
        resetState()
    }

    // MARK: - Event handling

    private func handleFlagsChanged(_ event: NSEvent) {
        let modifierIsDown = event.modifierFlags.contains(modifier)

        if modifierIsDown && !isPressed {
            handleModifierDown(event)
        } else if !modifierIsDown && isPressed {
            handleModifierUp(event)
        }
    }

    private func handleModifierDown(_ event: NSEvent) {
        isPressed = true
        pressTimestamp = ProcessInfo.processInfo.systemUptime

        // Schedule a timer to detect hold after maxHoldDuration
        cancelHoldTimer()
        holdTimer = Timer.scheduledTimer(
            withTimeInterval: maxHoldDuration,
            repeats: false
        ) { [weak self] _ in
            self?.holdTimerFired()
        }
    }

    private func handleModifierUp(_ event: NSEvent) {
        isPressed = false
        let now = ProcessInfo.processInfo.systemUptime
        let pressDuration = now - pressTimestamp

        cancelHoldTimer()

        if holdActive {
            // Was in a hold — emit release event
            holdActive = false
            callback(.holdReleased)
            // A hold consumes the gesture; reset tap tracking
            tapDownTimestamps.removeAll()
            return
        }

        // Press was short enough to count as a tap
        if pressDuration <= maxHoldDuration {
            tapDownTimestamps.append(pressTimestamp)

            // Prune taps that are outside the tap interval relative to
            // the *first* tap in the current candidate sequence.
            pruneStaleTaps(relativeTo: now)

            if tapDownTimestamps.count >= requiredTaps {
                callback(.tap)
                tapDownTimestamps.removeAll()
            }
        } else {
            // Press was too long for a tap but holdTimer somehow didn't
            // fire (shouldn't happen, but be defensive). Reset.
            tapDownTimestamps.removeAll()
        }
    }

    private func holdTimerFired() {
        guard isPressed else { return }
        holdActive = true
        // A hold invalidates any in-progress tap sequence
        tapDownTimestamps.removeAll()
        callback(.holdStarted)
    }

    // MARK: - Helpers

    /// Remove tap timestamps that are too old to form a valid sequence
    /// with a hypothetical next tap.
    private func pruneStaleTaps(relativeTo now: TimeInterval) {
        tapDownTimestamps.removeAll { timestamp in
            (now - timestamp) > tapInterval
        }
    }

    private func cancelHoldTimer() {
        holdTimer?.invalidate()
        holdTimer = nil
    }

    private func resetState() {
        isPressed = false
        holdActive = false
        pressTimestamp = 0
        tapDownTimestamps.removeAll()
    }
}
