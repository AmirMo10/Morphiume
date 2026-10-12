# Image scan remediation and native runtime evidence

The image built from source1a4fa4433d720b490ce222e8898cb09f73ba4abf passed its Linux-musl Sharp encoder step, then [CI run38248764072](https://github.com/AmirMo10/Morphiume/actions/runs/38248764072) image job114810332985 failed the unchanged Grype high-severity gate. It was not accepted/published/deployed. The original nine findings and exact match/fix metadata are retained in [sanitized scan evidence](image-scan-1a4fa44.json); all locations were `/lib/apk/db/installed`.

| CVE | Original APK matches | Grype | OpenSSL upstream | Remediation candidate |
| --- | --- | --- | --- | --- |
| CVE-2026-54873 | libcrypto3 and libssl3, both3.5.8-r0 | High, fix unknown | Low; OpenSSL QUIC stream metadata memory DoS | Both APKs3.5.9-r0 |
| CVE-2026-84782 | libcrypto3 and libssl3, both3.5.8-r0 | High, fix unknown | High; DTLS retransmission stale offset, disclosure/DoS | Both APKs3.5.9-r0 |
| CVE-2026-84784 | libcrypto3 and libssl3, both3.5.8-r0 | High, fix unknown | Low; OpenSSL QUIC retirement backlog DoS | Both APKs3.5.9-r0 |
| CVE-2026-72897 | libcrypto3 and libssl3, both3.5.8-r0 | High, fix unknown | Low; SSL_set_SSL_CTX context change during handshake with differing provider signature algorithms | Both APKs3.5.9-r0 |
| CVE-2026-85091 | zlib1.3.2-r0 | High; fixed1.3.2-r1, first observed2026-10-07 | zlib/Alpine advisory | zlib1.3.2-r1 |

The [OpenSSL2026-09-29 advisory](https://openssl-library.org/news/secadv/20260929.txt) fixes all four listed OpenSSL issues in3.5.9. The signed [Alpine3.24 main APK index](https://dl-cdn.alpinelinux.org/alpine/v3.24/main/x86_64/APKINDEX.tar.gz) actually downloaded during this review lists libcrypto3/libssl3/openssl3.5.9-r0 and zlib1.3.2-r1. [Alpine security DB](https://secdb.alpinelinux.org/v3.24/main.json) already records the zlib fix, while its OpenSSL secfix entries still end at3.5.8 at this observation. The original Grype CPE ranges nevertheless explicitly exclude OpenSSL>=3.5.9. An unknown scanner fix field does not mean an upstream fix is unavailable.

Both Docker stages now install exact patched APK versions through normal signature-checked `apk add --no-cache --upgrade`. No APK metadata is hidden, no package is blindly removed and no advisory/severity exception is added. Future package replacement needs renewed index/scan evidence; an unavailable exact version makes the build fail.

## Embedded Node OpenSSL is separate

The [official release index](https://nodejs.org/dist/index.json) lists Node24.21.0 with embedded OpenSSL3.5.8 and zlib1.3.2.1-motley. [Node24.21.0 release notes](https://nodejs.org/en/blog/release/v24.21.0) independently record the OpenSSL3.5.8 dependency update. Updating an OS APK does not patch statically embedded Node code. Latest supported Node22 from that index,22.23.3, also embeds3.5.8; it is not a patched alternative. Node26.11.1 Current embeds3.5.9 but is not LTS at this date and requires coordinated engine/target/runtime compatibility testing before adoption. No custom Node source build or Node version change was made.

Assessment below is limited to the four reported OpenSSL IDs and the current application entrypoints. It is a call-path inference, not an independent exploit test, a statement about every OpenSSL3.5.8 advisory or a scanner exclusion:

- CVE-2026-84782 concerns DTLS. [Node SecureContext implementation](https://github.com/nodejs/node/blob/v24.21.0/src/crypto/crypto_context.cc) accepts TLS method names and rejects unknown methods; DTLS methods are absent. The new Linux build audit must actually verify DTLS method rejection.
- CVE-2026-54873/84784 concern OpenSSL's QUIC stack. [Node QUIC documentation](https://github.com/nodejs/node/blob/v24.21.0/doc/api/quic.md) requires `--experimental-quic`. App/worker/migration commands do not enable/import it; the build audit must confirm the module is unavailable in the normal runtime. This alone does not assess other OpenSSL paths or prove native addons cannot expose additional APIs.
- CVE-2026-72897 involves replacing SSL_CTX during a server handshake and differing provider signature-algorithm sets. [Node TLS source](https://github.com/nodejs/node/blob/v24.21.0/src/crypto/crypto_tls.cc) calls `SSL_set_SSL_CTX` from `TLSWrap::SelectSNIContextCallback` after selecting a supplied SecureContext. The callback is registered as the TLS server-name callback. Morphiume's standalone entrypoint starts an HTTP server; proxy TLS, when later configured, terminates at Nginx. Outbound HTTPS and client SNI use the client path; they do not select an application TLS-server SNI context. No app TLS server, custom SNI callback, custom provider/library context or experimental QUIC configuration was found in the scoped source. This narrows the current trigger surface without proving all future/native configurations safe. OpenSSL rates this issue Low, while the recorded Grype/NVD result is High; the gate is unchanged.

Live remains closed pending independent security acceptance and real services. A supported LTS release that embeds patched OpenSSL, or a separately reviewed pinned off-server Node build, should be evaluated when available; no all-clear is inferred from package version updates alone.

## Required Linux build proof

`deploy/staging/audit-native.mjs` runs after runtime files are copied. It verifies the exact installed APK versions while preserving metadata; records actual `process.versions` and shared-library build settings; hashes Node/native binaries; captures `ldd` for Node/addons/shared libraries; loads each addon inside Node; performs certificate-verified HTTPS over TLS1.3 on loopback; and runs the Sharp WebP encoder. Musl ldd output/status is retained with nondeterministic ASLR addresses omitted; standalone ldd cannot supply Node N-API host symbols, so actual addon load and encoder execution establish those symbols resolve inside Node. Missing shared libraries fail the build.

The audit records `/app/morphiume-native-audit.json` without credentials. A temporary OpenSSL CLI creates a synthetic certificate/key, then the key directory, CLI package and audit executable are removed in the same final-stage build step. This does not remove the patched runtime libraries or APK inventory. The audit is prepared and Node syntax passes locally; actual Linux24.21 audit output, unchanged Grype pass and complete container/browser/worker acceptance are still pending the next CI run. No candidate was built or installed on the staging host during this remediation.
