# End-to-end review
Requires a live bb on this host.
Requires `noted` installed from this checkout.
Requires `BB_SERVER_URL`, `BB_THREAD_ID`, `BB_ENVIRONMENT_ID`, and `BB_PROJECT_ID` from a bb thread.
Requires Playwright 1.62.1 and its Chromium build. Run `npm run e2e`.
The `open-cross-thread` step re-opens the live session with `view: viewer` and relies on Task 10c to move the viewer in place.

## Isolated browser check

Run `npm run build` then `node e2e/isolated-ui-evidence.mjs` to exercise the
actual review component without replacing a live BB plugin. This check uses a
local session fixture for RPC and realtime delivery. It covers browser popup,
Markdown source editing and saving, both-view refresh, and HTML read-only mode.
It writes screenshots and a clip under the ignored `.noted-e2e/isolated-ui/`
directory and shuts down its temporary server. It does not certify production
BB routing, authentication, file writes, or Electron window behavior.
