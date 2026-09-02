# Security policy

## Supported versions

The current 0.1.x release line receives security updates.

## Report a vulnerability

Report sensitive vulnerabilities through [GitHub private vulnerability reporting](https://github.com/mpiv-ai/noted/security/advisories/new). Do not disclose a vulnerability in a public issue, discussion, or pull request.

## Trust and data boundary

BB plugins run with full trust. Noted reads only artifacts and assets that the user opens. It stores sessions, revisions, and feedback in BB-managed SQLite. Noted writes exports only to the destination passed to `bb noted file --to`. It sends feedback to the selected BB thread and adds no independent telemetry.
