# Accepted E4 image: actual CI and archive verification

Observed on2026-10-13 through06:56UTC. This establishes CI/archive acceptance, actual private transfer/load and Ops-scoped engine mapping. Runtime migration and app/worker cutover remain unexecuted gates.

Source `e4bed691dc938a9c0f79022696d24f063ad97724`: [CI38352565901](https://github.com/AmirMo10/Morphiume/actions/runs/38352565901) completed both jobs successfully. Verify115148051427 passed837 domain tests in55 files and78 native browser cases. Image115154350593 passed78 packaged-image browser cases and actual migration/seed/app/media/auth/worker-heartbeat/graceful-shutdown acceptance. The CI runtime DML account was independently authenticated apart from the migration owner.

| Actual downloaded evidence | Verify | Packaged image |
|---|---:|---:|
| Cases per engine |26|26|
| Passed / failed / skipped / flaky / retries |78 /0 /0 /0 /0|78 /0 /0 /0 /0|
| Authoritative duration, ms |1136524.312|1091052.720|
| Native auth responses |540|539|
| Auth status200 /400 /429 /503 |486 /3 /48 /3|486 /3 /47 /3|
| Server-log lines / wrapper500 |5403 /0|5414 /0|

Both server exports are `collected`, with byte/line/event caps all false. Expected negative auth/limiter/outage scenarios remain in the counts. These are distinct runs, not156 unique cases or proof of capacity. Verify started05:43:56.188Z; image started06:06:42.028Z. Browser summaries SHA256: `466d16c1caf60e633b1d01e3b14c94de25313e77d469befd104e41f6ea22fae4` and `289fe28b15143a8a16b2901510eb74b047ef0729edf966585193238c9ca24c22`.

## Trusted bytes and release identity

Authenticated accepted artifact11791954889 is86185674 bytes; whole downloaded ZIP SHA256 `36571e21d07548af43721f709e749dfff6bef4ad5b7ce2c28ee1a49321da422e` matched before the bounded extractor accepted exactly three filenames.

| Release field | Exact value |
|---|---|
| testedPlatformConfig |`sha256:246b9226db86bf63b37499c2b4a80c2e5e8f62265b3546674de48c480f524665`|
| candidateManifestDigest |`sha256:dea7a91aa15b8ea653f92d68aee16a168a204f8c0da79a2459e5f748df659c47`|
| archiveSha256 |`aed2f8a7b868d32410c55708042dcf945a0491a1f747632df16689e3d072432c`|
| Compressed archive / uncompressed layers |86184814 /230841344 bytes|
| Layers / config bytes / platform / UID |15 /11293 /linux-amd64 /1001:1001|

Local `verify-release.py` completed exit0/`verified-without-extraction`: exact checksum, tag, source/config/manifest, labels, entrypoint, credential-free image environment, config digest and every uncompressed RootFS diff-ID matched. That phase performed no Docker access or archive-member execution. Registry provenance/SBOM belongs to the published manifest; the platform Docker-save archive is not an attested multi-platform envelope.

## Actual server transfer and loaded-image mapping

Strict verified Ed25519 SSH transferred the exact three files into a fresh root-owned0700 E4 release directory. Server-side size/full SHA256 matched at06:52:25.697929Z; all files0600. At06:54:09.137141Z, clean main checkout613 was fast-forwarded specifically to accepted E4. Current running containers were not recreated. At06:54:41.807591Z, all21 public Ops files were independently hashed before Python import and materialized into the immutable E4/Ops bundle with fingerprint `68bc527a9c34ccefef72bb4427288da47c75c3a584e7cb140ecfc3c3fbdad6a3`. Old591/613 bundles, profiles and credentials were retained.

The frozen bundle's explicit runtime `verify-release.py --load` completed at06:55:27.773769Z, exit0,22.078080185seconds. Its actual version2 protected proof binds runtimeImageId `sha256:3b78dc30dcaa2a6d9b88f913e8bec4002454a0eef7b81ea83a953c5e8a5c2b6d` and engineProofSha256 `3f1b15a278706ac09be6f644b2042728b1a5ae3cacf3dfb5315181c51de03810` to the accepted archive/config/source/Ops. `applicationStarted=false`; no SQL or app/worker cutover occurred. The immutable engine ID is distinct from testedPlatformConfig and must be used as the runtime reference.

Independent read-only post-load inventory at06:56:52.946179Z found clean E4 checkout, both healthy running613 containers with oldenginead5c0e3d…/UID1001/readOnly/unchanged limits, protected configuration metadata and reserved vg0-lv--2/ext4 mount intact. Root free20586373120 bytes, Docker free37926404096 bytes. These are dated headroom/metadata samples, not row-equality, backup, migration, capacity or E4 application acceptance. Fresh encrypted old-release backup, stopped-writer before49/after53 preservation, compatible E4 activation, native retained fixture/restore/private preview/load remain separate gates.

Image-evidence artifact11793170006:24126 bytes, ZIP SHA256 `ff27a1653d7b218c743064031f4597175b62c8aaf248ef267f783f746a2f2985`, exact five-member extraction. Verify-evidence11792880028:10911 bytes, ZIP SHA256 `35dcb682d1a7b29a7c4bfa0ffe6e6ec6e8625eabe28828b59e5b0cca889ba9e0`, exact browser-summary/server-export pair. All three downloads actually completed with digest equality at06:43:50–06:43:55Z; raw captures and signed references remain private.

## Scanner and native limits

Actual Grype0.120.1 report SHA256 `19fbf419cc6ff6f1688802998db330dfba51ce9dfeafa7dd2d3633e505de9b8f` has three Medium findings forCVE-2025-60876: busybox, busybox-binsh and ssl_client1.37.0-r31, with no fixed version supplied; no High/Critical finding. The unchanged gate passed. This is neither zero-vulnerability nor ASVS acceptance. Actual native audit reports Node24.21.0, embedded OpenSSL3.5.8, verified TLS1.3 client, rejected DTLS methods, disabled experimental QUIC and passed sharp WebP encoder.

Earlier db928 image77/78 and Windows WebKit cookie-omission failure remain historical retained results. Local focused Linux tests, server preservation/deployment/restore/preview/load need their own source and execution evidence.
