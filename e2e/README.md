# End-to-end review
Requires a live bb on this host.
Requires `noted` installed from this checkout.
Requires `BB_SERVER_URL`, `BB_THREAD_ID`, `BB_ENVIRONMENT_ID`, and `BB_PROJECT_ID` from a bb thread.
Requires Playwright 1.62.1 and its Chromium build. Run `npm run e2e`.
The `open-cross-thread` step re-opens the live session with `view: viewer` and relies on Task 10c to move the viewer in place.
