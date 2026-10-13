# Firefox vendor cache path review

**Conclusion:** the candidate `firefox-1555/firefox/browser/chrome/icons/default` is supported by the pinned Playwright and Mozilla distribution sources as a vendor icon directory. Its identity as the actual failing CI entry is **still unproved**. A narrowly bound exception is reviewable; do not remove the global Default/profile/privacy guard or infer identity from length/depth alone.

Scope: read-only public source/package metadata review. Only this new document was written. No exporter/test changes, credential read, cache copy/import, binary/browser launch, SSH, service/DB action, load test or CI rerun occurred. QA's exporter/tests and live isolated PG window remain untouched.

## Reported failure and what it establishes

Root supplied the safe diagnostic from CI run38349505215/job115138422394: `stage=cache-inspection`, `code=entry-path-private-or-traversal`, `engine=firefox`, index621, pathBytes49, pathDepth6, all five known roots present. The candidate has49 UTF-8 bytes and six segments. Those values are compatible, but many paths could share them; the diagnostic does not disclose the entry's literal path or prove its filesystem type.

The frozen exporter validates path segments before lstat. Its case-insensitive forbidden-segment pattern includes exact `Default`, so canonical lowercase `default` at this vendor location is rejected by the same rule. Source review establishes that mechanism, not that index621 must be this directory. Exporter canonical SHA256 at review: `12fb58f581b26bdb5604b24435bf5a3b23a8e42c5846ff6be3a80b8ad0d74e54`.

## Pinned primary-source evidence

| Binding | Verified source fact |
| --- | --- |
| Project/package | package.json and lockfile pin `@playwright/test=1.64.0`; installed playwright-core package reports1.64.0 |
| Firefox descriptor | Installed browsers.json and the official v1.64.0 file both specify revision1555/browserVersion157.0, with no Firefox Ubuntu24.04 revision override |
| Cache root | Pinned registry readDescriptors derives the browser directory from its engine and effective revision; Firefox therefore has root `firefox-1555` |
| Platform artifact | Pinned registry selects `builds/firefox/%s/firefox-ubuntu-24.04.zip` for ubuntu24.04-x64; Linux executable layout is `firefox/firefox` |
| Mozilla provenance | Playwright v1.64.0 Firefox UPSTREAM_CONFIG.sh selects Mozilla's release branch and base revision `fdd757a2e09c9471cddf383e64e631e4ce178499` |

Sources: [pinned browser descriptor](https://github.com/microsoft/playwright/blob/v1.64.0/packages/playwright-core/browsers.json), [pinned registry](https://github.com/microsoft/playwright/blob/v1.64.0/packages/playwright-core/src/server/registry/index.ts), [pinned Mozilla upstream configuration](https://github.com/microsoft/playwright/blob/v1.64.0/browser_patches/firefox/UPSTREAM_CONFIG.sh). The installed descriptor's canonical-LF SHA256 is `2cfd419f71ac6475d81e1301fa86c34cf2a2a6bae2a0da4b5a2b18310216b6bf`.

At that exact Mozilla base revision, the GTK branding build places icons in `chrome.icons.default`. The installer manifest explicitly includes five PNGs at `browser/chrome/icons/default`: `default16.png`, `default32.png`, `default48.png`, `default64.png`, `default128.png`. This is distribution artwork under the application tree, rather than an arbitrary user-profile directory. Both facts are visible in the pinned [branding build](https://github.com/mozilla-firefox/firefox/blob/fdd757a2e09c9471cddf383e64e631e4ce178499/browser/branding/branding-common.mozbuild) and [installer manifest](https://github.com/mozilla-firefox/firefox/blob/fdd757a2e09c9471cddf383e64e631e4ce178499/browser/installer/package-manifest.in).

The source chain supports the candidate independently of geometry. It does not prove the downloaded archive's current contents, CI entry621, file modes/links, or export stability; those require actual bounded filesystem evidence. No claim of binary/archive verification follows from this review.

## Minimal recommended exception contract

Bind eligibility to trusted platform `ubuntu24.04-x64`, Playwright1.64.0 and the known metadata descriptor whose engine is exactly firefox, effective revision1555 and directory exactly `firefox-1555`. Require that root to be present in the validated cache inventory. A fabricated path string or caller-supplied root name alone must not establish that binding. Any revision/platform/package change needs a new review.

Allow only these canonical lowercase paths:

| Relative path | Required object |
| --- | --- |
| `firefox-1555/firefox/browser/chrome/icons/default` | Real directory, never a symlink |
| That exact directory plus one of the five direct PNG filenames above | Regular file, never a symlink/hardlink |

The exception only neutralizes the forbidden `default` segment at index5 for that complete exact path shape. Every other segment must still pass all original checks. Do not use a prefix-only subtree allowance, case folding, normalization before traversal rejection, a generic `/icons/default` suffix, arbitrary Firefox revisions, or a global removal of `Default` from forbiddenSegments. Unknown files/nested directories under this vendor directory stay rejected.

Apply the same policy at path inspection, entry validation and link-target validation; never let a symlink destination acquire a weaker namespace rule. Once type is available, enforce the directory/regular-file requirements explicitly. The original canonical-cache-root/known-root/parent-directory checks, hidden/private/profile/secret segment rules, no backslash/control/traversal, depth/path/member/byte caps, special-mode and writable-mode rejection, hardlink rejection, file hashing, link containment/cycle/existence checks and before/after stability hashes all remain in force. Vendor naming does not establish safe bytes or replace hash/mode/link checks.

Important rejects include real `Default` or `Profile` directories elsewhere; uppercase `Default` at this location; another revision/engine/root; `.env`, Cookies, Login Data, auth/storage-state/credentials files; an extra directory or unknown leaf under the icon directory; traversal aliases; and a link pretending to be this directory or any of its five PNGs. Even an allowed-name PNG retains the ordinary file/mode/hash/stability gates.

## Root's bounded next diagnostic and correction gate

Before identifying this as the actual CI rejection, Root may add one exact known-path read-only diagnostic under the already validated cache root. No glob scan, profile/credential content read, browser launch or cache copy is needed. Verify the trusted Firefox descriptor/root first; lstat each exact ancestor, the directory and the five named PNG leaves without following links, check containment/type/mode/link counts, and compare the directory's child-name set against the five expected names. Unexpected names remain private; output only alias/flag/count/status fields and no raw error/path/target/environment.

A directory-present flag alone establishes presence of the candidate, not its equality to index621. To identify the failing entry, the diagnostic should additionally report a boolean comparing the rejected entry with this exact constant, while continuing to withhold the rejected path. Retain actual root/revision/platform/descriptor binding and observation/source identity. If the comparison/type/ancestry evidence does not match, keep the original failure classification and investigate that finite result rather than widening the exception.

If confirmed, QA/Root can implement the exact vendor rule with positive directory/five-leaf fixtures plus the negative cases above, preserving their ten existing diagnostic tests and all security guards. Mode/type/link/hash/stability rejection should be exercised after the lexical exception, not bypassed by it. Root owns that implementation/CI action; it has not been done in this review.

Documentation lookup: the Context7 command could not run because npx was unavailable in this shell; the review instead retrieved official version-pinned Playwright and commit-pinned Mozilla sources directly. Current [Playwright browser documentation](https://playwright.dev/docs/browsers) also states that each Playwright release needs its corresponding browser binaries; a stale cache root cannot be accepted by this exception.

## Coordinator follow-up: packaged application preferences

Actual producer3e61dbb [CI38351141472](https://github.com/AmirMo10/Morphiume/actions/runs/38351141472/job/115143581818) again downloaded all official engines and failed the lexical guard at Firefox entry628,49 UTF-8 bytes,5 segments. The historical rejected name remains unproved. Its geometry matches the separate known application preference directory, but geometry is not identity.

At the same pinned Mozilla commit, [config/rules.mk](https://github.com/mozilla-firefox/firefox/blob/fdd757a2e09c9471cddf383e64e631e4ce178499/config/rules.mk) defines the application PREF_DIR as defaults/preferences. The [package manifest](https://github.com/mozilla-firefox/firefox/blob/fdd757a2e09c9471cddf383e64e631e4ce178499/browser/installer/package-manifest.in) explicitly lists debugger.js,firefox.js and firefox-branding.js beneath browser/PREF_DIR. These are packaged default application settings, not a user prefs.js/profile. This independently supports a second exact rule: directory firefox-1555/firefox/browser/defaults/preferences plus only those three direct regular-file leaves, bound to the same validated1555/157.0 descriptor. Other Preferences paths, prefs.js,user.js,unknown leaves, casing aliases and symlinks remain rejected; ordinary mode/hash/stability checks remain. Root prepares that narrow correction without claiming the identity of historical entry628. Actual next export/verified manifest must establish the downloaded members.

## Follow-up: Playwright's automation preference, 13 October 2026

Root reported cacheE4 run38352565925/job115148052652 downloaded all three engines, then failed the same private/traversal path guard at Firefox index629,72 UTF-8 bytes,depth6. `firefox-1555/firefox/browser/defaults/preferences/00-playwright-prefs.js` has matching geometry. **That historical entry's identity remains unproved.** The reviewed GTK and three Mozilla preference exceptions are now in Root's exporter and the separately prepared importer; those prior changes do not prove this next file or archive.

The official [Playwright v1.64.0 file](https://github.com/microsoft/playwright/blob/v1.64.0/browser_patches/firefox/preferences/00-playwright-prefs.js) is present and contains public vendor configuration selecting `playwright.cfg` with unobscured configuration format. The fetched UTF-8 source is160bytes with SHA256 `8c2d32801a924f2c2b133f1191d01213513c86e8d1e42e144e9cb1015ea71084`. This establishes its source identity, not its deployed/cache location or the contents of an unseen artifact. No browser setting was executed or changed.

The version-pinned [preferences directory](https://github.com/microsoft/playwright/tree/v1.64.0/browser_patches/firefox/preferences) lists exactly two files: that JS and `playwright.cfg`. The available [roll_from_upstream.sh](https://github.com/microsoft/playwright/blob/v1.64.0/browser_patches/roll_from_upstream.sh) identifies its source as an internal browser repository, checks for `browser_patches/build_flavors.sh`, and copies the Firefox preferences tree **from that internal checkout into the public patch source**. It is not a binary-packaging destination rule. The complete, nontruncated public v1.64.0 Git tree revealed no Firefox-specific build/package-copy script in its Firefox patch tree. The pinned [bootstrap patch](https://github.com/microsoft/playwright/blob/v1.64.0/browser_patches/firefox/patches/bootstrap.diff) and [juggler moz.build](https://github.com/microsoft/playwright/blob/v1.64.0/browser_patches/firefox/juggler/moz.build) also supply no install rule for this JS. An attempted public `microsoft/playwright-browsers` repository lookup returned404; this does not disclose or grant access to the internal builder.

**Packaging-copy proof is unavailable from the checked public pinned sources.** It would be inaccurate to claim the roll script proves copying this file into `browser/defaults/preferences`. Public source identity and a plausible vendor destination can support a finite known-path diagnostic; they cannot replace its actual result. Root can supply a separately authenticated pinned packager rule if available, or obtain the narrow actual filesystem evidence below. No importer/exporter rule was changed in this follow-up.

At the same pinned Mozilla base, the package manifest's only explicit `browser/@PREF_DIR@` JS entries are `debugger.js`, `firefox.js` and `firefox-branding.js`; the application branch of config/rules.mk makes PREF_DIR `defaults/preferences`. No other preference-directory leaf is clearly established by those checked manifest entries. The public Playwright directory's `playwright.cfg` presence does not prove that it belongs under this preference directory, so this review proposes no allowance there for that file or for a wildcard JS tree.

### Exact proposed diagnostic and conditional rule

Keep the existing trusted Ubuntu24.04-x64/Playwright1.64.0/Firefox1555/version157.0/root-inventory binding. Root may add this **one** fixed canonical leaf to a closed diagnostic candidate map. At the actual rejection point, compare the failing in-memory path to the literal candidate and expose only a candidate alias plus an equality boolean; never emit the unknown path. Independently lstat the fixed candidate and its exact ancestors under the already validated cache root without following links. Record only bound-root/real-parent/regular-file/nlink1/safe-mode flags, size160/content-SHA-match booleans and safe observation/source identity. Hash/read only this known public source candidate after those ancestry/type/size bounds; no other preference/profile contents are needed. Compare its160 bytes to the pinned source SHA above. Candidate presence/content alone still does not identify the rejected entry; retain the equality result separately. Do not retroactively assign this new observation to historical index629.

If the fixed leaf, safe ancestry/type/mode, pinned-source bytes and rejected-entry equality are actually confirmed, the minimal reviewed addition is exactly `firefox-1555/firefox/browser/defaults/preferences/00-playwright-prefs.js`, **regular file only**, on the same descriptor-bound map. Root must explicitly approve and publish the importer/exporter changes. It may neutralize only the existing lowercase `preferences` segment for that full literal leaf. No general preference filename, pattern or subtree allowance follows. All ordinary member/mode/ownership/link/hash/stability/byte/count gates remain; both symlink members and symlink destinations to this exception stay rejected. The producer manifest and importer still bind the actual bytes after the diagnostic/source review.

Meaningful correction tests must positively include the exact leaf and negatively cover another revision/root, casing changes, `prefs.js`, `user.js`, `playwright.cfg` at this directory, an unknown JS/nested child, symlink/hardlink/unsafe-mode variants and an alias into the vendor exception. The next diagnostic should also classify exact matches to the already-reviewed finite directory/leaf map, using closed aliases and booleans. An unknown match remains unknown, rather than forcing another guess from geometry. This does not authorize enumerating or printing arbitrary rejected filenames.

Before Root's content-bound GO below, only this document changed in the follow-up. Primary public text/tree retrieval and owned-document whitespace/hash checks ran; official binary/cache download, cache inspection/import, browser launch, server/SSH/DB action, importer/exporter mutation and CI rerun remained unrun.

### Reviewed content-bound GO and prepared importer correction

Root independently verified the same160-byte public source SHA and approved **only** the exact canonical `00-playwright-prefs.js` regular leaf with both that size and that content hash, under the existing Firefox1555/version157.0/platform/package binding. This is a narrower content rule than a filename-only exception. The missing public packaging-copy proof and unproved historical entry629 identity remain explicit; neither was converted to an acceptance result.

The importer now rejects the candidate at manifest validation unless `bytes=160` and the pinned SHA above match, then verifies the actual streamed tar body against that same hash. Tar hardlinks/specials/symlinks remain rejected for this leaf, and exclusively created regular output files have nlink1 checked. All existing root, mode, parent, path, link-destination and stability gates remain in force. Root owns the matching exporter/candidate-alias diagnostic and its public fixture; this agent changed only its importer, dedicated Python tests, import guide and this vendor review. No other preference leaf was added.

Prepared validation on already-running Ubuntu24.04 WSL/Python3.12.3 passed **40/40**, zero failure/error/skip, in0.345s. The official public fixture's size/hash are independently asserted; meaningful negative cases cover changed same-length contents, wrong size/revision/case, user-preference names, symlink/hardlink/alias/unsafe modes and a tar body changed behind unchanged manifest identity. The prior38 cases remain and are not added into a78-case claim. AST/whitespace checks passed. No actual official cache import, browser launch, CI rerun or server/native/PG activity followed from these prepared checks.
