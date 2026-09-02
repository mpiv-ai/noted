# Contributing

Open an issue for bugs and focused changes to the current HTML review release. Discuss larger product changes before opening a pull request. Keep pull requests narrow, update public documentation when behavior changes, and include a clear verification record.

## Set up and check the project

```sh
npm ci
npm run check
```

`npm run check` runs the type check, test suite, and both plugin builds.

Run `npm run e2e` only when a live BB instance is available and Noted is loaded from the checkout. Public CI does not run this live-BB check.

## Update vendored Lavish files

Set `LAVISH_CHECKOUT` to a checked-out Lavish source tree, then run:

```sh
LAVISH_CHECKOUT=/path/to/lavish-axi node scripts/sync-lavish.mjs
```

Review the vendored diff and update `THIRD_PARTY_NOTICES.md` when the shipped software or license terms change.

## Leave release actions to maintainers

Do not include version bumps, release commits, or tags in a contribution. If you contribute through an agent, leave changes uncommitted unless the maintainer asks otherwise.
