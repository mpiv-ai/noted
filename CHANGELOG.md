# Changelog

## 0.1.1 - 2026-09-02

- Correct package metadata and documentation to describe the current HTML review release.
- Add a security policy, contribution guidance, and public continuous integration.
- Complete the license notices for the third-party software shipped in v0.1.1.

This release does not change product behavior.

## 0.1.0 - 2026-09-02

- Review agent-made HTML artifacts in a sandboxed bb side-panel tab.
- Annotate elements and text ranges with Lavish's vendored in-artifact SDK.
- Queue feedback, add a freeform note, and deliver by queue or steer to any thread.
- Track revisions after agent turns and refresh an open review without a manual reload.
- Separate producer, viewer, and reply-to thread roles for Loops and other cross-thread workflows.
- Open, reply, inspect, end, and file sessions through the `bb noted` CLI.
- Export self-contained HTML and a companion note to a knowledge base.
- Cover the live review loop with Playwright, including cross-thread delivery and session cleanup.

Noted is built on [Lavish](https://github.com/kunchenguid/lavish-axi) by Kun Chen. Whiteboard editing is planned for v0.2.
