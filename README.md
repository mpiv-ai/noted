# Noted

Noted is a [bb](https://getbb.app) plugin for reviewing agent-made HTML artifacts and whiteboards inside the thread side panel. Point at an element or a text range, say what should change, queue it, and send the batch straight into the thread as a message. Revisions are tracked per turn, and finished artifacts can be filed to a knowledge base.

It is built on [Lavish](https://github.com/kunchenguid/lavish-axi) by Kun Chen, whose in-artifact annotation SDK Noted vendors unchanged. Lavish opens artifacts in a browser and hands feedback to the agent through a long-poll; Noted runs the same review loop inside bb, where the thread itself is the session, so the agent never polls.

## Status

Pre-release. v0.1 is HTML review: open, annotate, send in queue or steer mode, revision capture, `bb noted` CLI, save-to-KB. Whiteboards follow in v0.2. See `docs/` once the design and plan land in the repo.

## Install

```sh
bb plugin install git:github.com/mpiv-ai/noted@^0.1.0
```

Or from a checkout during development:

```sh
git clone https://github.com/mpiv-ai/noted.git && cd noted
npm install
bb plugin install .
```

## Usage

From any agent thread:

```sh
bb noted open plan.html            # open in this thread's side panel
bb noted open packet.html --view parent   # show it in the thread that spawned you
bb noted reply "Applied the three changes."
bb noted status
bb noted file plan.html --to <vault-folder> --title "Plan A" --summary "…"
```

Feedback arrives in the receiving thread as a message that starts with `Noted: feedback on …`.

## Develop

```sh
npm run check      # typecheck, tests, build
bb plugin dev .    # rebuild and reload on save
```

## License

MIT. See `LICENSE` and `THIRD_PARTY_NOTICES.md`.
