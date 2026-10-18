# Redesign CI — accepted source and image

Observed 2026-10-14. [Run 38547949250](https://github.com/AmirMo10/Morphiume/actions/runs/38547949250), attempt 1, completed successfully at the exact application source `7feb4fe8e8254e917c53f9654b315ee7ef3fada1`. Both verify and image jobs succeeded. This report covers CI and downloaded artifacts; server cutover and native staging acceptance have separate evidence.

| Execution | Actual result |
| --- | --- |
| Verify job `115798565244` | Lint, TypeScript, build, secret and dependency gates passed; 886 unit/database tests in 56 files passed |
| Source browser run | 84/84 passed: 28 cases each in Chromium, Firefox and WebKit; 1146.129 seconds; zero skipped, flaky, error or test-retry cases |
| Image job `115807571346` | Build/scan, migration, media/auth, app readiness, bundled-worker tick/shutdown and provenance/SBOM promotion passed |
| Built-image browser run | 84/84 passed: the same 28 cases in each of three engines; 1073.722 seconds; zero skipped, flaky or failed cases |
| Source server evidence | 6152 lines scanned; zero unexpected failure events; no byte/line/event limit reached |
| Image server evidence | 6167 lines scanned; zero unexpected failure events; no byte/line/event limit reached |

The two browser runs repeat the same scenarios against source and the packaged image. The initially failed local run remains documented in [local execution evidence](REDESIGN_EXECUTION.md); it is not replaced with these later successful results.

The image scan's High/Critical gate passed. Three Medium package matches remain, all for `CVE-2025-60876` in BusyBox-family packages at `1.37.0-r31`; no independent exploit assessment or fix availability was established here. Native audit confirmed Node24.21.0, embedded OpenSSL3.5.8, rejected DTLS methods, disabled experimental QUIC, a verified TLS1.3 HTTPS client and successful Sharp WebP encoding.

## Artifact verification actually executed

GitHub artifact IDs and ZIP SHA256 values:

- Source evidence `11886666101`: `14737c72561c0a5ebfa922e60c4cecdd808e2683329bf5a09be8ffe3b02d0468`.
- Image evidence `11886704550`: `a346925d7f4be12adefd1c3d561d71d69133f23a2516116bc880d81573befc0b`.
- Accepted runtime `11886889201`: `570002c668f01c6d9db693ef3bce117c9dc1cc4cf3ad3817f9ba26396f529af1`.

All three downloads matched GitHub's observed ZIP digests. The accepted ZIP contained exactly the three allowed files. The published bounded extractor and archive verifier validated the 86,727,341-byte archive, platform/user/source/config identity and all fifteen layers, totaling 231,606,784 uncompressed bytes. These local verification calls performed no Docker or server action.

| Accepted image identity | Exact value |
| --- | --- |
| Source | `7feb4fe8e8254e917c53f9654b315ee7ef3fada1` |
| Tested platform config | `sha256:7fd5086681dbfe2fc7690eafc308a18e7f1a8f8e081262ccc8a909f8bb5cbaab` |
| Registry provenance/SBOM manifest | `sha256:6db2e24e987fdf76e427f55ad574fcee1dedf6b52408b28a5f317a894f4dfde5` |
| Accepted archive SHA256 | `ef221159cc6b65483e8f0beac855f2c34a0455010e4488af4161b43983158971` |

The immutable server Engine mapping is recorded separately after loading. These config/registry identities alone do not establish deployment, preserved server data, native staging purchases, recovery or recurring timer delivery.

## Published operational corrections, 18 October 2026

Observed at `2026-10-18T07:08:22Z`: both later workflows completed with successful `verify` and `image` jobs.

| Tooling source | Workflow | Actual result |
| --- | --- | --- |
| `878acdf3b5dea637915f7dcf2aa137bb61ac4289` | [39102885279](https://github.com/AmirMo10/Morphiume/actions/runs/39102885279) | verify success; image success |
| `404132f330625f91d4a06a97d86031b53540d4a9` | [39103532586](https://github.com/AmirMo10/Morphiume/actions/runs/39103532586) | verify success; image success |

These commits correct release-specific recovery metadata validation and its offline controls; [the correction report](../ops/REDESIGN_MEDIA_POLICY_FIX.md) records the original safe failures and the 47 final offline cases. The table reports observed job conclusions, without deriving new detailed test counts or vulnerability findings from job summaries. The deployed application and server checkout remain the separately accepted `7feb4fe` image above. The published operational tools use source `404132f`; neither later CI image was substituted into that deployment.

## Final documentation handoff

The final handoff commit changes documentation and recorded design-access state only and uses `[skip ci]`. The application remains the independently accepted and deployed `7feb4fe` image; the later operational corrections retain their own completed CI runs above. Final local document/link/JSON/secret checks and the actual pushed main commit are confirmed at delivery. No new application build or deployment is inferred from the documentation commit.
