# Controlled offline browser-toolchain importer

Prepared source only. The coordinator owns artifact download/transfer, authenticated GitHub run/job/artifact provenance, publication and actual import authorization. No official cache has been imported or browser launched by this task. Synthetic archive extraction is a contract test, not official binary acceptance or a native/browser result. The latest exporter failure's actual rejected Firefox entry is still unproved from byte/depth geometry alone.

The new stdlib-only [importer](../../scripts/import-browser-toolchain.py) accepts the current reviewed [exporter](../../scripts/prepare-browser-toolchain-artifact.mjs) schema. Its [dedicated tests](../../tests/ops/browser-toolchain-import.test.py) have no database, service, SSH, downloader or browser behavior. One test invokes local GNU tar only on a tiny synthetic distribution fixture using the producer's exact normalization arguments. No QA/exporter/workflow or application source was edited.

## Trust and inputs

Before invoking the importer, Root must bind the successful producer job and exact source to independently authenticated artifact metadata, verify the downloaded GitHub ZIP digest, and approve the reviewed importer bytes. Keep signed download URLs, tokens and download logs outside public reports. The six required trusted values are ZIP SHA256, source40hex, exporter SHA256, lockfile SHA256, manifest SHA256 and inner archive SHA256. All digests are lowercase64hex. Source/exporter/lock values must come from the reviewed producer revision, not the current workspace tip or values copied from the untrusted manifest as their own authority. The manifest/archive digests likewise require Root's explicit reviewed handoff after provenance verification.

The importer verifies the ZIP again; external verification is not a bypass. Input must be a regular nonsymlink file with link count1. It holds the same open file descriptor, bounds its size, verifies SHA256 and stat identity before/after the complete read-only validation pass, before any symlink creation, and at completion. A changed inode, size, mtime/ctime or digest fails. ZIP members are exactly the three declared basenames: the platform tar.gz, manifest JSON and SHA256 sidecar. Missing, duplicate, extra, directory, encrypted, symlink/special or unsafe-mode members fail; only stored/deflated ZIP entries are supported. Manifest is capped at128MiB, sidecar512bytes; the ZIP's physical bound is4GiB+128MiB+1MiB. Each declared ZIP uncompressed size is checked before reading its contents; CRC verification remains enabled.

Manifest JSON rejects duplicate keys, nonfinite numbers and unexpected fields. Schema1, platform `ubuntu24.04-x64`, Node24.21.0/pnpm11.25.0/Playwright1.64.0 must match exactly. Expected descriptors are chromium1248/version156.0.8078.4, headless-shell1248/same version, Firefox1555/version157.0, WebKit2370/version27.2 and ffmpeg1013/no version. Chromium/Firefox/WebKit are required; the two other exact roots are optional. Advertised roots must actually be present. Counts, file hashes, types, integer permission/size values, required parent directories, the complete license list and archive size/digest/sidecar must agree.

Pinned revisions are taken from [Playwright v1.64.0 browsers.json](https://github.com/microsoft/playwright/blob/v1.64.0/packages/playwright-core/browsers.json); the [same registry source](https://github.com/microsoft/playwright/blob/v1.64.0/packages/playwright-core/src/server/registry/index.ts) defines cache directory naming. Browser/runtime installation and native-library checks remain a separate coordinator step; [Playwright browser documentation](https://playwright.dev/docs/browsers) explains the coupling to each Playwright version.

## Archive and vendor policy

Limits are50000 manifest/tar members,4GiB aggregate regular-file bytes,1GiB per regular file,1024 UTF-8 bytes and32 segments per member/link target. Counters are validated before body reads; file bodies are streamed in chunks. Every tar member must match exactly one manifest record's canonical path, type, Unix mode, size, SHA256 or relative link target. Duplicate/missing/extra members, absolute/traversal/control/backslash/hidden/private-profile names, hardlinks, special/sparse/GNU extension types, setid/sticky modes and group/other-writable regular files/directories fail. Symlink mode777 is the normal Linux link metadata; it does not grant target permissions. Directory owner search/read access is required.

Raw ustar headers are inspected before extraction, including checksum, numeric UID/GID0, timestamp0, empty username/groupname fields, zero device identity, exact supported type, content padding and two end-of-archive blocks. GNU tar's single directory trailing slash is accepted and compared to the manifest without any other path normalization; double slashes are rejected. Trailing nonzero archive data or more than1MiB zero padding fails. Local POSIX PAX headers may contain only unique, well-formed `path`/`linkpath` keys, bounded to4096bytes each and128MiB aggregate; global headers, other keys, unsafe metadata names/raw override paths, invalid link overrides or unfinished/repeated extensions fail. Valid long-path/link records still undergo the same manifest binding. The importer does not use `extract`, `extractall` or implicit tarfile PAX iteration. Python's [tarfile format/header documentation](https://docs.python.org/3.12/library/tarfile.html) describes raw headers and extension support; supported features here are deliberately limited to the exporter contract.

The central `VENDOR_MEMBERS` map permits only the following exact lowercase, descriptor-bound Firefox distribution assets. Their required types are enforced, and links to or from these exception members fail:

- `firefox-1555/firefox/browser/chrome/icons/default`: real directory; direct regular `default16.png`, `default32.png`, `default48.png`, `default64.png`, `default128.png` only.
- `firefox-1555/firefox/browser/defaults/preferences`: real directory; direct regular `debugger.js`, `firefox.js`, `firefox-branding.js` only.
- One additional content-bound direct leaf, `00-playwright-prefs.js`, must be a regular file with exactly160bytes and SHA256 `8c2d32801a924f2c2b133f1191d01213513c86e8d1e42e144e9cb1015ea71084`. Both metadata and the streamed body must match; a producer manifest with altered bytes/hash cannot redefine this exception.

The [pinned Mozilla source review](FIREFOX_VENDOR_CACHE_REVIEW.md) records the GTK and application-preference packaging provenance. Unknown children/nested trees, `prefs.js`, `user.js`, `Cookies`, casing changes, directory-prefix wildcards and arbitrary revisions remain rejected. Root reviewed the second exact map addition after checking Mozilla's `PREF_DIR` and package-manifest; this does not establish the actual failing CI member. Root separately approved the exact [Playwright v1.64.0 automation preference source](https://github.com/microsoft/playwright/blob/v1.64.0/browser_patches/firefox/preferences/00-playwright-prefs.js) by its160-byte content identity. Public pinned packaging-copy destination remains unproved; this content-bound allowance makes no historical index629 claim. Root's next diagnostic must separately measure the exact candidate match/presence/content, preserving unknown paths privately. Any new vendor exception requires primary-source review, meaningful counterexamples and newly published importer bytes.

Relative symlinks must terminate at an enumerated member in the same root. All path parents are manifest real directories; links cannot act as parents. Absolute, cross-root, dangling, cyclic, hidden/private-target or vendor-exception links fail. All regular data are validated in a complete read-only pass before any output directory is created.

## Operator commands, unexecuted on official artifacts

Use published/hash-verified source on Ubuntu24.04 x86_64/Python3.12+. `-B` prevents Python bytecode writes. The CLI checks that platform before reading the artifact. It does not launch Node/pnpm/Playwright, install dependencies, copy a cache, change active runtime configuration or fall back to another cache. Root supplies the following variables from the protected reviewed handoff; placeholders below are not identities.

```bash
python3 -B scripts/import-browser-toolchain.py \
  --zip "$TRUSTED_ZIP_PATH" --zip-sha256 "$TRUSTED_ZIP_SHA256" \
  --source-commit "$TRUSTED_PRODUCER_SOURCE" \
  --exporter-sha256 "$TRUSTED_EXPORTER_SHA256" \
  --lockfile-sha256 "$TRUSTED_LOCK_SHA256" \
  --manifest-sha256 "$TRUSTED_MANIFEST_SHA256" \
  --archive-sha256 "$TRUSTED_ARCHIVE_SHA256"
```

That default command performs verification only and creates no files. For separately authorized extraction, append both `--private-parent "$APPROVED_PRIVATE_PARENT" --cache-dir "$FRESH_CACHE_PATH"`. The parent must already be a canonical absolute real directory owned by the effective user with exact mode700, with no symlink in its ancestry. The cache must be a direct child with a canonical absolute path and must not exist. The importer exclusively creates that fresh private scratch cache with mode700; it does not merge, overwrite, delete, rename or activate an existing cache. Root should allocate a new staging path for each attempt and leave the failed original download/cache/logs intact.

The second archive pass rechecks every byte/hash while writing. Directory traversal uses Linux `dir_fd`, `O_DIRECTORY` and `O_NOFOLLOW`; file creation is exclusive/no-follow. Engine directories are initially700, regular files retain validated modes, and relative links are created only after all regular entries and input stability pass. Validated directory modes are applied last while the cache root stays700. If extraction fails, the partial directory remains private and is never automatically resumed or removed. Fixed public failure output is `state=rejected`, `code=browser-toolchain-contract-rejected`, `partialMayExist`; it prints no paths, member values, error text, stack, secret or environment. A success emits only state, source/platform/versions, hashes and counts. Exit0/imported proves archive extraction under this contract; actual three-engine launch/native behavior still requires separate Root GO.

Python's [ZIP documentation](https://docs.python.org/3.12/library/zipfile.html) covers CRC and archive metadata, and [OS file APIs](https://docs.python.org/3.12/library/os.html#files-and-directories) document directory-descriptor operations. Context7's prescribed `npx ctx7@latest library Python ...` lookup failed locally because `npx` is unavailable; the official Python3.12 pages were checked directly.

## Actual prepared-source validation

On the already-running Ubuntu-24.04 WSL distribution, Python3.12.3:

```text
wsl.exe -d Ubuntu-24.04 --exec python3 -B /mnt/s/Morphiume/tests/ops/browser-toolchain-import.test.py
40 tests, 40 PASS, 0 failure/error/skip, 0.345s
```

These are small synthetic tests, including genuine local GNU POSIX tar directory and long-name PAX normalization, both exact vendor maps, independent trusted-identity mismatch, duplicate-key/exact-schema rejection, smaller injected member/byte/file/path/depth caps, all member/owner/mode/body/target identities, private-profile canaries, ZIP identity/type/CRC/sidecar bounds, link cycle/escape/dangling/cross-root/parent cases, read-only rejection before any writes, exclusive destination/no symlink ancestry, valid file modes/licenses/delayed links, and failure retention before links. The new content-bound case reads Root's exact public160-byte source fixture, verifies its pinned digest, and rejects altered same-size bytes,159/161-byte variants, wrong revision/casing, user preference leaves, links/hardlinks/aliases, unsafe modes and a tampered tar body. The fixture is vendor source data, never executed as browser code. No official cache, artifact download or browser was used.

The initial33-test run was32pass/1failure: the synthetic device-number mutation was omitted by `TarInfo.tobuf` for a regular member, so the intended hostile raw field had never reached the importer. Replacing that fixture with a checksummed raw-header mutation proved rejection. This was a test-fixture correction, not removal of an importer guard. The later38-case scope passed in0.396s before the content-bound addition; the final40-case scope is not added to earlier counts. Both Python files passed AST parsing without bytecode generation; owned-file whitespace check passed.

Still unrun: successful producer evidence/download/ZIP digest handoff, actual official archive validation and private import, OS browser dependency checks, all three browser launches, anonymous-cookie/native acceptance, application image acceptance, private-IP preview and capacity runs. Actual run-specific cache failures remain preserved by Root and must be resolved before invoking this importer against an official artifact.
