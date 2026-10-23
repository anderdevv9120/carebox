# Schedule and health decisions

**Goal:** Apply the customer decisions agreed in this conversation to the existing CAREBOX demo.

**Architecture:** Extend the shared reminder model and existing reducer/API. Keep current persisted state compatible with optional reminder metadata. Reuse the existing alert pipeline for manual health readings and the existing visual components for forms and lists.

**Approved behavior:**
- Elders see all today's medication and clinic appointments, including medication details and clinic locations; only family and staff create or edit schedules.
- Medication repeats daily between inclusive start/end dates, with multiple dose times.
- Family-created/edited medication is confirmed immediately. Staff-created/edited medication waits for family confirmation and cannot trigger elder reminders or overdue alerts before approval.
- Cancel only the selected dated occurrence; later daily occurrences remain.
- Both other roles receive schedule notifications.
- Staff and family can view, add and edit schedules; medication forms collect name, dose and instructions; clinic forms collect location.
- Clinic transport opens a simulated booking screen.
- Elders enter health readings separately from existing simulator controls. Manual readings use the same thresholds and notify family/staff with their actual source. Keep disconnect/fall controls.

**Scope:** Reminder types, recurrence/clock, API permissions/validation, seed data, elder schedule/home/health, shared schedule editor and notifications, family/staff navigation, regression tests and demo documentation. Preserve unrelated chat/provider flows and existing local data.

## Execution

- [x] Add failing behavioral tests for schedule permissions, confirmation, recurrence boundaries, individual cancellations, editing and manual readings.
- [x] Extend reminders, clock and reducer; validate input and inject actor roles at the API boundary.
- [x] Add family/staff schedule management, elder medication/clinic views, notifications and simulated ride booking.
- [x] Add manual health entry and preserve source labels and existing simulator behavior.
- [x] Run focused tests, full tests, build and lint; verify workflows in the browser and review the diff.

## Checks that matter

- Unapproved or canceled medication never alerts the elder or escalates.
- Staff cannot forge family confirmation, including through edits and older reminder-request actions.
- Future one-off appointments survive midnight; expired medication does not recur after its end date.
- One cancellation never deletes tomorrow's dose or another dose time.
- Empty, impossible and mismatched metric values are rejected by the API.
- Manual readings preserve physical device connectivity and identify their source.

## Verification and review

- 226 tests pass; production build passes; lint retains five existing Fast Refresh warnings.
- Chrome: staff created two daily dose times, family confirmed one, elder saw only that dose. Canceling it removed only today's occurrence; tomorrow remained available. Family creation and editing applied immediately. Elder medication view included all today's doses and retained acknowledged doses; no create button was present.
- Chrome: clinic location populated the simulated booking form and the success screen clearly stated no real car was booked. Manual blood pressure 168/102 saved as elder-entered and produced the family notification and staff alert. Elder schedule notifications and acknowledgment worked after reload; no console errors on the fresh page.
- Chrome/API: staff opened a structured draft from a reminder request; canceling that request during editing caused save to return the explicit stale-request error without creating another reminder.
- Review fixes: bind elder responses to the due timestamp; retire the free-text staff approval action in favor of structured input; keep hardware freshness separate from manual readings; validate metric-specific numeric ceilings; retain linked request identity across polling.
- Runtime fix: reproduced Windows EPERM with a locked temporary destination. Local atomic saves now retry only temporary EPERM/EBUSY failures, at most three retries; permanent errors remain visible. Recovery, retry bounds and cleanup have regression tests. Redis behavior is unchanged.
- Original local state was backed up before browser verification and restored afterward. No deployment or real transport/device/Google AI integration was attempted.
