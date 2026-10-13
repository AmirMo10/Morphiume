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
