# Claude Desktop RTL patcher — Linux compatibility branch

A focused fork of [m4tinbeigi-official/claude-rtl-patcher](https://github.com/m4tinbeigi-official/claude-rtl-patcher), originally by Rick Sanchez & Contributors. Persian typography uses **Vazirmatn**, by Saber Rastikerdar. The upstream MIT license and attribution are retained.

This branch patches **Claude Desktop**, not the Claude Code terminal. It supports writable Linux ASAR installations. It does not disable Electron fuses, signatures, sandboxing, certificate checks, or operating-system protections. Signed macOS/MSIX bundles and read-only Flatpak/AppImage containers are deliberately unsupported for in-place modification.

## Install from this checkout

Requirements: Node.js **22.12.0+**, Linux, and `/usr/bin/python3` for preserving and verifying filesystem extended attributes, including ACLs and security labels. No Python packages are required.

```sh
npm ci --ignore-scripts
node index.js --diagnose --json
```

Do not use `npx claude-rtl-patcher` or the legacy download installers for this branch. As checked on 2026-11-02, npm still publishes only the old `1.0.0` (2026-07-21), the latest upstream release is `v1.1.2` (2026-07-23), and upstream main contains later source changes while still declaring package version `1.0.0`. Neither npm nor those release binaries contain these fork changes.

## Commands

Quit Claude completely using its **Quit** menu before apply or restore. Closing its window may leave it running in the tray. The patcher refuses to replace an archive while the corresponding application is running. Launch the GUI only as your normal desktop user.

```sh
# Read-only: never launches Claude or writes to its installation.
node index.js --diagnose
node index.js --dry-run --full --json
node index.js --status

# Explicit mode; --patch alone is intentionally rejected.
node index.js --full
node index.js --font-only

# Restore only a matching, managed patched build.
node index.js --restore
```

A positional installation path or `--path` accepts the application directory, executable, resources directory, or `app.asar`. Linux discovery follows `com.anthropic.Claude.desktop`, honors the per-user override, and resolves the executable symlink. Ambiguous wrappers fail clearly instead of silently modifying another installation.

For this CachyOS installation:

```sh
PATCHER="$HOME/Projects/claude-rtl-patcher/index.js"
ASAR=/usr/lib/claude-desktop/resources/app.asar
NODE="$(readlink -f "$(command -v node)")"

node "$PATCHER" --diagnose --path "$ASAR" --json
# After quitting Claude; pkexec uses the existing system authentication agent.
pkexec "$NODE" "$PATCHER" --full --path "$ASAR" --json
claude-desktop

# To restore: quit Claude, then run
pkexec "$NODE" "$PATCHER" --restore --path "$ASAR" --json
claude-desktop
```

The CLI does not launch, close, or restart the GUI automatically. This avoids killing unrelated processes or launching a privileged GUI. The installation and validation procedure uses the application's own Quit action and relaunches it as the desktop user.

## Renderer behavior

There is **no native-RTL version threshold**. A version number does not verify the behavior of Chat, Code, or Cowork, or of remotely updated frontend code. Choose a mode explicitly:

- `--full`: scoped direction and typography for message prose and composers. Direction uses the balance of Arabic/Hebrew versus other prose words, disregarding a leading Latin acronym or mixed-case identifier and excluding code/math tokens and URL/path text. Ties retain the first prose word's direction. Predominantly Persian paragraphs can begin with `API` or `OpenAI` without becoming LTR.
- `--font-only`: leaves native direction, alignment and bidi behavior unchanged, including during streaming.

Vazirmatn's embedded Arabic Unicode range leaves Latin glyphs to the original font fallback. The preload registers the bundled font bytes with the standard FontFace API; it makes no font URL request and does not relax `font-src 'self'`. Headings, paragraphs, nested lists, blockquotes and table cells are classified separately. Code, math, code editors and icons are excluded from prose processing. Inline code and URL links are isolated; code and math remain LTR. Bare unmarked paths/URLs rely on the browser's normal Unicode bidi handling: the runtime does not rewrite text nodes to manufacture token wrappers.

The runtime changes only presentation attributes and CSS. It never reverses text, inserts invisible direction controls, alters stored messages, or globally forces div/span elements into RTL. Composer direction is classified at the editable root; its editor-owned paragraphs receive inherited CSS without DOM-attribute writes. A per-frame guard prevents duplicate initialization. Scoped observers handle character-data changes during streaming, batch work into animation frames, and do not observe their own attribute writes.

Known renderer boundaries are `.font-claude-response`, `.font-user-message`, `.standard-markdown`, `.prose`, user-message/data-author containers and ProseMirror/textbox composers. Unsupported future frontend markup requires reassessment; finding a preload alone does not prove visual compatibility.

## Transaction, backup and update safety

Supported builds must reference `.vite/build/mainView.js` as a content preload through a recognized `webPreferences.preload` expression. The optional shell preload is `.vite/build/mainWindow.js`. Bridge/require signatures are checked. No blanket CSS scan is used for injection, and an unsupported target layout fails before backup or replacement. Existing legacy CSS/JS patch markers are refused as unmanaged rather than backed up as pristine.

Pristine backups live beside the archive:

```text
app.asar.rtl-backups/<application-version>-<original-sha256>/app.asar
app.asar.rtl-backups/<application-version>-<original-sha256>/manifest.json
```

Pristine bytes are never overwritten. A manifest binds the source path, version, original hash, patched/pending hash, payload identity, target set, and native unpacked tree. Restore requires an exact managed hash and matching build; it cannot put an older archive over an updated application, even if an update reused the version string. A legacy `app.asar.bak` is never trusted automatically.

The patcher uses a unique same-filesystem staging directory and an exclusive lock. It validates all packed bytes, hashes/block hashes, symlinks, unpacked flags and executable metadata before an atomic rename. The installed `app.asar.unpacked` tree is not replaced. Archive ownership, mode, ACLs and extended attributes are preserved and verified; metadata errors fail before replacement. A prepared manifest records recovery state before commit. An existing lock is never forcibly removed.

After an update:

1. Quit Claude and run `--diagnose` against the new installation.
2. Confirm the new package/version, original hash and supported content preload. Reassess the actual renderer; do not infer native support from version.
3. Run `--full` or `--font-only` explicitly. A changed build receives its own pristine backup. Repeating the same payload on the same managed build is a byte-preserving no-op.
4. Relaunch normally and repeat synthetic UI checks. There is no automatic update/repatch daemon.

Do not copy a backup manually over a newer build. If status is `unmanaged-patch`, recover a pristine archive from the **matching** package/build before using this branch; do not guess that an old `.bak` belongs to the current installation.

## Testing

```sh
npm test
```

The real-browser regression test is skipped unless an installed Puppeteer-compatible driver and Chrome executable are supplied. For this machine, the existing Chrome DevTools MCP bundle provides the driver without adding a project dependency:

```sh
RTL_BROWSER_DRIVER="$HOME/.local/lib/node_modules/chrome-devtools-mcp/build/src/third_party/index.js" \
RTL_BROWSER_EXECUTABLE=/opt/google/chrome/chrome npm test
```

Tests exercise real ASAR fixtures, exact restore, native-file preservation, ownership/modes/extended attributes, unsupported targets, legacy markers, locks, failure-before-commit and interruption recovery, changed builds, idempotency, mixed prose, streaming text, native font-only direction, selection preservation and actual Vazirmatn glyph usage in Chromium under `font-src 'self'`. Tests do not access a user's account or private conversations. Passing them does not establish compatibility with a running Desktop frontend; installed GUI checks are a separate requirement.

On CachyOS `claude-desktop 4.4212.0-2`, the installed archive was patched, restored byte-for-byte to its original SHA256, launched successfully after restoration, and reapplied. Synthetic Desktop Code composer RTL and Cowork formatting (lists, blockquotes, tables, paths, links, code and math) were visually checked. Chat was unavailable in the existing third-party deployment. The desktop locked before the remaining live streaming, caret/selection and application Copy-action checks could finish; those checks are not claimed as passed. Exact font glyph usage was instrumented in Chromium, not in Desktop's security-restricted renderer.

The final source also fixes list-only composer classification and cleanup of removed message roots, with failing-then-passing browser regressions. After unlocking on 2026-11-03, the final payload was reapplied and verified to match this checkout; its installed SHA256 is `e3a83a64f9a0db1e032b9fe8b3f62d04102d82d76134eaf0a2c8166c5d3bcd58`. A minimal official-native Chat request returned the exact expected API-leading Persian response, visually verified as RTL, and all 48 regression tests passed with no skips. Code response testing remains gated by account access; the remaining caret, clipboard and sustained streaming checks are not claimed as passed. The pristine backup remains `58ad49c6bf569d433b2dbf4809e0d4f29c2a2166bcadd94153935c680217c102`; application security settings were not weakened.

The dependency audit still reports five inherited advisories (three moderate, two high). This branch does not claim an audit-clean dependency tree.

## Upstream proposals

[PR #28](https://github.com/m4tinbeigi-official/claude-rtl-patcher/pull/28) informed scoped runtime initialization, Linux path discovery and streaming concerns, but was not merged: its native-RTL threshold, observer behavior and backup/security approach were not accepted wholesale. [PR #26](https://github.com/m4tinbeigi-official/claude-rtl-patcher/pull/26) correctly distinguishes the macOS ASAR **header** hash from the whole-file hash; it does not justify disabling integrity checks on Linux. This branch changes no macOS signature or integrity fuse.

## License

MIT; see [LICENSE](LICENSE). Vazirmatn is licensed under the SIL Open Font License supplied with `@fontsource/vazirmatn`. Original upstream helpers and translated documentation describe upstream behavior and are not the installation procedure for this Linux compatibility branch.
