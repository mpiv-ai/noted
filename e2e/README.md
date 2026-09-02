# End-to-end review
Requires a live bb on this host.
Requires `noted` installed from this checkout.
Requires `BB_SERVER_URL`, `BB_THREAD_ID`, `BB_ENVIRONMENT_ID`, and `BB_PROJECT_ID` from a bb thread.
Requires Playwright 1.62.1 and its Chromium build. Run `npm run e2e`.
`openSession` reuses an open session for the same producer and path without changing `viewThreadId`.
The cross-thread check ends the producer-view session before reopening it for the viewer.
