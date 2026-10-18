# Private preview image verification — 18 October 2026

Application source: `3b62c340cbcb9becec3b1a9552eedeecb4837be2`.
Both jobs in [GitHub Actions run 39116267630](https://github.com/AmirMo10/Morphiume/actions/runs/39116267630) completed successfully. This report records CI evidence; server activation and native acceptance require separate execution evidence.

| Job | Actual result |
| --- | --- |
| verify, `117642574902` | 925 tests across 59 files; all 84 browser cases passed. |
| accepted image, `117646917521` | Image build, vulnerability scan and runtime tool exclusion passed; all 84 browser cases passed against the packaged image. |

The accepted archive artifact is `12133950636`. Its downloaded ZIP SHA256 is `0d09f182d1ba3728bc4f42ca88703fd91367622c37ab9aa972fe4ec48a57f8f2`. The extracted archive SHA256 is `d17f2f3e4b3b738b8661c5863d8be797ee94c76a1ec68685ae0a021001e3b1bd`; tested platform config is `sha256:0f023b08ed1fd92a10447b550fbc48ee7d0585cadb7b04e294d86d43bcd01f5a`, and manifest digest is `sha256:961da3ebc93584c92181e96e73973477c5159f9091cea2c878f51a1f50549cd8`.

The coordinator retained the original private job logs. Their raw SHA256 values are `f605c601d4bde8e934f7c21e8601a8d451e3ac9c032de02f35f744ecfbadecef` for verify and `93056b64e780c3cf4921f9df4b1fca24708afb063d06504e33d865c9e9c530e6` for the image job. The local archive verifier also finished with exit0 before transfer: Linux amd64, application UID1001, 15 layers, 238227456 uncompressed layer bytes. An actual Docker Engine identity must still come from the server's loaded-image proof; a platform config digest is not substituted for it.

Earlier failures remain part of the record:

- `4388019`: 915 tests passed and seven failed; lease and public-quota behavior required correction.
- `13e8b07`: 916 passed and seven failed; native TOTP enrollment used the wrong secret decoding.
- `8ba6b13`: source verification passed with 925 tests and 84 browser cases, but the image job rejected traced development-tool metadata before starting its browser suite.
- `3b62c34`: the trace rule omits only the reviewed metadata paths when every trace parent is the exact BetterAuth telemetry detector. Executable or unreviewed tool paths remain rejected. Both jobs then passed.

The preview capability is limited to staging, the exact private-IP origin and mock providers. Normal and isolated-restore authentication remain required. CI success alone does not establish public sales readiness, native server behavior, backup recovery or recurring service delivery.
