# Working on this compatibility branch

This fork repairs the **Claude Desktop application**, not the Claude Code terminal. Use the current README and source checkout; the published upstream npm package and download installers do not include these changes.

- Inspect the actual desktop launcher, executable, package version and ASAR before applying anything.
- Run `npm ci --ignore-scripts`, `npm test`, and `node index.js --diagnose --json` first.
- Select `--full` or `--font-only` explicitly; native RTL is never inferred from version.
- Quit Claude through its own Quit action before apply/restore. Run its GUI only as the desktop user.
- Do not disable integrity fuses, remove signatures, bypass security protections, trust an unversioned `.bak`, or restore a different build.
- Keep user accounts, settings, integrations and private conversations untouched. Use synthetic UI test content and keep screenshots outside Git.
- Verify backups, staged archive/native metadata, idempotency and exact restore before changing an installed archive. Unit/browser tests do not prove compatibility with the installed frontend.

Linux in-place patching is supported only for the verified writable-ASAR layout. Unsupported signatures, containers, wrappers and targets must fail clearly. The original upstream MIT license and attribution must remain.
