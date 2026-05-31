# TODOs

## Product

- Completed: Show a themed in-page toast when a blocked tracked site is closed, including the next available reset time.
- Completed: Add usage analytics:
  - total social media time per day
  - streak of days without tracked social media use
  - most-used tracked domains
- Completed: Have warning when visits social media site in the blocked time in addition to closing the tab.

## Engineering

- Completed: Add a lightweight manual QA checklist for loading, popup behavior, settings behavior, analytics behavior, and blocked-state behavior.
- Consider extracting shared domain normalization between background and options if the settings UI grows.
- Consider adding automated extension smoke tests when a browser test harness is introduced.
