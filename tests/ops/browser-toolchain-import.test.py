"""Small synthetic archives only. Run on Ubuntu: python3 -B this-file.py."""
import contextlib
import copy
import gzip
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest import mock
import zipfile

sys.dont_write_bytecode = True
SCRIPT = Path(__file__).resolve().parents[2] / "scripts/import-browser-toolchain.py"
OFFICIAL_PREF_FIXTURE = Path(__file__).resolve().parents[1] / "fixtures/firefox-playwright-preferences-1.64.0.txt"
spec = importlib.util.spec_from_file_location("browser_import", SCRIPT)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def directory(name):
    return {"path": name, "type": "directory", "mode": 0o755, "bytes": 0}


def file(name, data=b"fixture-license"):
    return {"path": name, "type": "file", "mode": 0o644, "bytes": len(data), "sha256": m.sha(data), "_data": data}


def link(name, target="LICENSE"):
    return {"path": name, "type": "symlink", "mode": 0o777, "bytes": 0, "target": target}


def entries():
    result = []
    for engine in ("chromium", "firefox", "webkit"):
        root = m.ROOTS[engine]["directory"]
        result.extend((directory(root), file(root + "/LICENSE")))
    return result


def icons():
    result = entries()
    parts = m.ICON_DIR.split("/")
    result.extend(directory("/".join(parts[:index])) for index in range(2, len(parts) + 1))
    result.extend(file(name, b"synthetic-png") for name in sorted(m.ICONS))
    return result


def preferences():
    result = entries()
    parts = m.PREF_DIR.split("/")
    result.extend(directory("/".join(parts[:index])) for index in range(2, len(parts) + 1))
    result.extend(file(name, b"synthetic-vendor-js") for name in sorted(m.PREFS))
    return result


def pax_record(key, value):
    text = f" {key}={value}\n".encode()
    length = len(text) + 1
    while len(str(length).encode()) + len(text) != length:
        length = len(str(length).encode()) + len(text)
    return str(length).encode() + text


def header(name, type_value, data=b"", **changes):
    info = tarfile.TarInfo(name)
    info.type = type_value
    info.mode = 0o755 if type_value == tarfile.DIRTYPE else 0o777 if type_value == tarfile.SYMTYPE else 0o644
    info.uid = info.gid = info.mtime = 0
    info.uname = info.gname = ""
    info.size = len(data)
    for key, value in changes.items():
        setattr(info, key, value)
    return info.tobuf(format=tarfile.USTAR_FORMAT) + data + bytes((-len(data)) % 512)


def raw_tar(records):
    result = []
    types = {"directory": tarfile.DIRTYPE, "file": tarfile.REGTYPE, "symlink": tarfile.SYMTYPE}
    for entry in records:
        changes = {"mode": entry["mode"], "linkname": entry.get("target", "")}
        changes.update(entry.get("_header", {}))
        result.append(header(entry.get("_name", entry["path"]), entry.get("_type", types[entry["type"]]), entry.get("_data", b""), **changes))
    return b"".join(result) + bytes(1024)


def build(items=None, tar_items=None, raw=None, mutate=None, json_bytes=None, zip_mutate=None):
    items = entries() if items is None else items
    regular = [entry for entry in items if entry["type"] == "file"]
    tar = raw if raw is not None else raw_tar(items if tar_items is None else tar_items)
    compressed = gzip.compress(tar, mtime=0)
    manifest = {"schemaVersion": 1, "sourceCommit": "a" * 40, "platform": m.PLATFORM, "versions": m.VERSIONS.copy(),
                "lockfileSha256": "b" * 64, "exporterSha256": "c" * 64,
                "archive": {"file": m.ARCHIVE, "bytes": len(compressed), "sha256": m.sha(compressed)},
                "roots": [copy.deepcopy(m.ROOTS[name]) for name in ("chromium", "firefox", "webkit")],
                "counts": {"memberCount": len(items), "totalBytes": sum(entry["bytes"] for entry in regular), "fileCount": len(regular), "symlinkCount": sum(entry["type"] == "symlink" for entry in items)},
                "excludedRegistryLinks": True, "licenseFiles": [entry["path"] for entry in regular if m.LICENSE.fullmatch(entry["path"].split("/")[-1])],
                "entries": [{key: value for key, value in entry.items() if not key.startswith("_")} for entry in items]}
    if mutate:
        mutate(manifest)
    manifest_bytes = json_bytes if json_bytes is not None else json.dumps(manifest, separators=(",", ":")).encode()
    records = [(m.ARCHIVE, compressed), (m.MANIFEST, manifest_bytes), (m.SIDECAR, f"{m.sha(compressed)}  {m.ARCHIVE}\n".encode())]
    if zip_mutate:
        records = zip_mutate(records)
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in records:
            info = zipfile.ZipInfo(name)
            info.create_system = 3
            info.external_attr = (stat.S_IFREG | 0o600) << 16
            archive.writestr(info, data)
    payload = buffer.getvalue()
    trusted = {"zipSha256": m.sha(payload), "sourceCommit": "a" * 40, "lockfileSha256": "b" * 64,
               "exporterSha256": "c" * 64, "manifestSha256": m.sha(manifest_bytes), "archiveSha256": m.sha(compressed)}
    return payload, trusted


class ImportTests(unittest.TestCase):
    def verify(self, built=None, **kwargs):
        payload, trusted = build(**kwargs) if built is None else built
        with tempfile.TemporaryDirectory(prefix="morphiume-import-synthetic-") as root:
            source = Path(root) / "fixture.zip"
            source.write_bytes(payload)
            return m.import_zip(source, trusted)

    def rejected(self, **kwargs):
        with self.assertRaises((m.Rejected, tarfile.TarError, zipfile.BadZipFile, EOFError, OSError, ValueError)):
            self.verify(**kwargs)

    def test_complete_verify_is_readonly_and_count_bound(self):
        result = self.verify()
        self.assertEqual(result["state"], "verified")
        self.assertEqual((result["memberCount"], result["fileCount"], result["totalBytes"]), (6, 3, 45))

    def test_exact_vendor_icons_accepted(self):
        self.assertEqual(self.verify(items=icons())["fileCount"], 8)

    def test_exact_vendor_preferences_accepted(self):
        self.assertEqual(self.verify(items=preferences())["fileCount"], 6)

    def test_exact_automation_preference_official_public_fixture(self):
        data = OFFICIAL_PREF_FIXTURE.read_bytes()
        self.assertEqual(len(data), 160)
        self.assertEqual(m.sha(data), "8c2d32801a924f2c2b133f1191d01213513c86e8d1e42e144e9cb1015ea71084")
        self.assertEqual(self.verify(items=preferences() + [file(m.AUTOMATION_PREF, data)])["fileCount"], 7)

    def test_automation_preference_content_size_and_context_fail_closed(self):
        data = OFFICIAL_PREF_FIXTURE.read_bytes()
        for invalid in (bytes([data[0] ^ 1]) + data[1:], data[:-1], data + b"\n"):
            with self.subTest(bytes=len(invalid)):
                with self.assertRaisesRegex(m.Rejected, "vendor-content"):
                    self.verify(items=preferences() + [file(m.AUTOMATION_PREF, invalid)])
        for name in (m.AUTOMATION_PREF.replace("00-playwright", "00-Playwright"), m.PREF_DIR + "/prefs.js", m.PREF_DIR + "/user.js"):
            self.rejected(items=preferences() + [file(name, data)])
        for revision in ("1554", "1556"):
            self.rejected(items=preferences() + [file(m.AUTOMATION_PREF, data)], mutate=lambda value, revision=revision: value["roots"][1].update(revision=revision))
        self.rejected(items=preferences() + [link(m.AUTOMATION_PREF)])
        self.rejected(items=preferences() + [file(m.AUTOMATION_PREF, data), link("firefox-1555/pref-alias", "firefox/browser/defaults/preferences/00-playwright-prefs.js")])
        unsafe = file(m.AUTOMATION_PREF, data)
        unsafe["mode"] = 0o666
        self.rejected(items=preferences() + [unsafe])
        items = preferences() + [file(m.AUTOMATION_PREF, data)]
        changed = copy.deepcopy(items)
        changed[-1]["_data"] = bytes([data[0] ^ 1]) + data[1:]
        self.rejected(items=items, tar_items=changed)
        changed = copy.deepcopy(items)
        changed[-1]["_type"] = tarfile.LNKTYPE
        self.rejected(items=items, tar_items=changed)

    def test_preferences_exception_rejects_user_files_casing_unknown_links(self):
        for name in (m.PREF_DIR + "/prefs.js", m.PREF_DIR + "/user.js", m.PREF_DIR + "/unknown.js",
                     m.PREF_DIR + "/nested/firefox.js", m.PREF_DIR.replace("preferences", "Preferences") + "/firefox.js"):
            with self.subTest(name=name):
                self.rejected(items=preferences() + [file(name)])
        for name in (m.PREF_DIR, sorted(m.PREFS)[0]):
            self.rejected(items=[link(entry["path"], "LICENSE") if entry["path"] == name else entry for entry in preferences()])
        self.rejected(items=preferences() + [link("firefox-1555/pref-alias", "firefox/browser/defaults/preferences/firefox.js")])

    @unittest.skipUnless(os.name == "posix", "Producer GNU tar normalization requires Linux.")
    def test_actual_gnu_posix_tar_directory_and_long_pax_path(self):
        items = entries() + [file("chromium-1248/" + "a" * 180)]
        with tempfile.TemporaryDirectory(prefix="morphiume-import-gnu-synthetic-") as root:
            cache = Path(root) / "cache"
            cache.mkdir(mode=0o700)
            for entry in items:
                target = cache / entry["path"]
                if entry["type"] == "directory":
                    target.mkdir(mode=entry["mode"])
                else:
                    target.write_bytes(entry["_data"])
                    target.chmod(entry["mode"])
            listing = Path(root) / "members-private.list"
            listing.write_bytes(b"".join(entry["path"].encode() + b"\0" for entry in items))
            archive = Path(root) / "fixture.tar.gz"
            subprocess.run(["tar", "--create", "--gzip", "--file", str(archive), "--format=posix", "--owner=0", "--group=0", "--numeric-owner", "--mtime=@0", "--pax-option=delete=atime,delete=ctime", "--directory", str(cache), "--no-recursion", "--null", "--files-from", str(listing)], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
            self.assertEqual(self.verify(items=items, raw=gzip.decompress(archive.read_bytes()))["fileCount"], 4)

    def test_gnu_directory_single_trailing_slash_accepted(self):
        records = entries()
        for entry in records:
            if entry["type"] == "directory":
                entry["_name"] = entry["path"] + "/"
        self.assertEqual(self.verify(tar_items=records)["memberCount"], 6)

    def test_double_directory_slash_rejected(self):
        records = entries()
        # TarInfo.tobuf itself canonicalizes trailing slashes; preserve the raw
        # malicious header manually and recalculate its checksum.
        tar = bytearray(raw_tar(records))
        name = b"chromium-1248//"
        tar[:100] = name + bytes(100 - len(name))
        tar[148:156] = b"        "
        tar[148:156] = f"{sum(tar[:512]):06o}\0 ".encode()
        self.rejected(raw=bytes(tar))

    def test_each_trusted_identity_is_independent(self):
        payload, trusted = build()
        for key in trusted:
            with self.subTest(key=key):
                changed = dict(trusted)
                changed[key] = "f" * (40 if key == "sourceCommit" else 64)
                self.rejected(built=(payload, changed))

    def test_exact_json_keys_duplicate_keys_and_types(self):
        for mutation in (lambda value: value.update(extra="secret-canary"), lambda value: value.update(schemaVersion=True),
                         lambda value: value["entries"][1].update(extra=True), lambda value: value["counts"].update(fileCount=True)):
            with self.subTest(mutation=mutation):
                self.rejected(mutate=mutation)
        self.rejected(json_bytes=b'{"schemaVersion":1,"schemaVersion":1}')
        self.rejected(json_bytes=b'{"number":NaN}')

    def test_exact_platform_versions_revision_and_roots(self):
        for mutation in (lambda value: value.update(platform="ubuntu22.04-x64"), lambda value: value["versions"].update(playwright="1.63.0"),
                         lambda value: value["roots"][1].update(revision="1554"), lambda value: value["roots"][1].update(browserVersion="156.0"),
                         lambda value: value["roots"].append(value["roots"][0]), lambda value: value["roots"].pop(),
                         lambda value: value["roots"][0].update(engine=[])):
            with self.subTest(mutation=mutation):
                self.rejected(mutate=mutation)

    def test_count_and_license_lists_exact(self):
        for mutation in (lambda value: value["counts"].update(totalBytes=99), lambda value: value.update(licenseFiles=[]),
                         lambda value: value["licenseFiles"].append(value["licenseFiles"][0]), lambda value: value.update(excludedRegistryLinks="true")):
            with self.subTest(mutation=mutation):
                self.rejected(mutate=mutation)

    def test_optional_known_engine_descriptor_accepted(self):
        items = entries() + [directory("ffmpeg-1013"), file("ffmpeg-1013/LICENSE")]
        self.assertEqual(self.verify(items=items, mutate=lambda value: value["roots"].append(m.ROOTS["ffmpeg"].copy()))["fileCount"], 4)

    def test_all_private_hidden_traversal_root_canaries(self):
        for name in ("chromium-1248/Default", "firefox-1555/Profile one", "webkit-2370/Cookies", "webkit-2370/.env",
                     "webkit-2370/.links", "webkit-2370/.hidden", "/chromium-1248/LICENSE", "chromium-1248/../private",
                     "chromium-1248//file", "unknown/file", "chromium-1248/back\\slash", "chromium-1248/new\nline",
                     "chromium-1248/credentials.json", "chromium-1248/token.json", "webkit-2370/secret.pem"):
            with self.subTest(name=name):
                self.rejected(items=entries() + [file(name)])

    def test_vendor_exception_never_wildcard_or_link(self):
        for name in (m.ICON_DIR + "/Cookies", m.ICON_DIR + "/default256.png", m.ICON_DIR + "/extra/file", m.ICON_DIR.replace("default", "Default") + "/default16.png"):
            with self.subTest(name=name):
                self.rejected(items=icons() + [file(name)])
        items = icons()
        for name in (m.ICON_DIR, sorted(m.ICONS)[0]):
            altered = [link(entry["path"], "LICENSE") if entry["path"] == name else entry for entry in items]
            self.rejected(items=altered)

    def test_missing_parent_duplicate_and_special_modes(self):
        self.rejected(items=entries() + [file("chromium-1248/no-parent/file")])
        self.rejected(items=entries() + [entries()[1]])
        for mode in (0o666, 0o4755, 0o2755, 0o1755, 0o000):
            items = entries()
            items[1]["mode"] = mode
            self.rejected(items=items)

    def test_actual_small_bound_counterexamples(self):
        payload, trusted = build()
        with tempfile.TemporaryDirectory() as root:
            source = Path(root) / "fixture.zip"
            source.write_bytes(payload)
            for change in ({"members": 5}, {"bytes": 44}, {"fileBytes": 14}, {"pathBytes": 10}, {"depth": 1}):
                with self.subTest(change=change), self.assertRaises(m.Rejected):
                    m.import_zip(source, trusted, limits={**m.LIMITS, **change})

    def test_relative_link_and_link_chain_accepted(self):
        items = entries() + [link("chromium-1248/link"), link("chromium-1248/chain", "link")]
        self.assertEqual(self.verify(items=items)["symlinkCount"], 2)

    def test_escape_crossroot_cycles_dangling_and_private_links(self):
        for target in ("/etc/passwd", "../../private", "../firefox-1555/LICENSE", "missing", "link", "Default/../LICENSE", ".hidden/../LICENSE", "LICENSE\nsecret", "./" * 32 + "LICENSE"):
            with self.subTest(target=target):
                self.rejected(items=entries() + [link("chromium-1248/link", target)])
        self.rejected(items=entries() + [link("chromium-1248/link", "other"), link("chromium-1248/other", "link")])
        self.rejected(items=icons() + [link("firefox-1555/link", "firefox/browser/chrome/icons/default/default16.png")])

    def test_symlink_parent_rejected(self):
        self.rejected(items=entries() + [link("chromium-1248/alias"), file("chromium-1248/alias/child")])

    def test_tar_member_missing_extra_duplicate_rejected(self):
        for records in (entries()[:-1], entries() + [file("chromium-1248/extra")], entries() + [entries()[1]]):
            self.rejected(tar_items=records)

    def test_tar_exact_mode_size_content_and_target(self):
        for changes in ({"mode": 0o600}, {"_data": b"short"}, {"_data": b"x" * 15}, {"target": "secret"}):
            records = entries()
            records[1].update(changes)
            self.rejected(tar_items=records)
        items = entries() + [link("chromium-1248/link")]
        records = copy.deepcopy(items)
        records[-1]["target"] = "other"
        self.rejected(items=items, tar_items=records)

    def test_tar_owner_identity_time_uname_gname(self):
        for changes in ({"uid": 1}, {"gid": 1}, {"mtime": 1}, {"uname": "runner"}, {"gname": "runner"}):
            with self.subTest(changes=changes):
                records = entries()
                records[1]["_header"] = changes
                self.rejected(tar_items=records)
        # TarInfo.tobuf omits device numbers for regular files; tamper the real
        # raw field instead of asserting against a mutation it never serialized.
        raw = bytearray(raw_tar(entries()))
        raw[329:337] = b"0000001\0"
        raw[148:156] = b"        "
        raw[148:156] = f"{sum(raw[:512]):06o}\0 ".encode()
        self.rejected(raw=bytes(raw))

    def test_tar_hardlink_special_and_gnu_unknown_types(self):
        for value in (tarfile.LNKTYPE, tarfile.FIFOTYPE, tarfile.CHRTYPE, tarfile.BLKTYPE, tarfile.GNUTYPE_LONGNAME, tarfile.GNUTYPE_SPARSE, tarfile.XGLTYPE):
            records = entries()
            records[1]["_type"] = value
            self.rejected(tar_items=records)

    def test_valid_explicit_pax_path_and_linkpath(self):
        name = "chromium-1248/" + "a" * 180
        items = entries() + [file(name)]
        extension = pax_record("path", name)
        raw = raw_tar(entries())[:-1024] + header("chromium-1248/PaxHeaders/long", tarfile.XHDTYPE, extension) + header("chromium-1248/short", tarfile.REGTYPE, b"fixture-license") + bytes(1024)
        self.assertEqual(self.verify(items=items, raw=raw)["fileCount"], 4)
        items = entries() + [link("chromium-1248/link")]
        extension = pax_record("linkpath", "LICENSE")
        raw = raw_tar(entries())[:-1024] + header("chromium-1248/PaxHeaders/link", tarfile.XHDTYPE, extension) + header("chromium-1248/link", tarfile.SYMTYPE, linkname="short") + bytes(1024)
        self.assertEqual(self.verify(items=items, raw=raw)["symlinkCount"], 1)

    def test_pax_unknown_duplicate_malformed_traversal_and_pending(self):
        for extension in (pax_record("atime", "0"), pax_record("path", "chromium-1248/LICENSE") * 2,
                          b"999 path=short\n", pax_record("path", "../../private"), pax_record("path", "/outside")):
            raw = header("chromium-1248/PaxHeaders/fixture", tarfile.XHDTYPE, extension) + raw_tar(entries())
            self.rejected(raw=raw)
        self.rejected(raw=raw_tar(entries())[:-1024] + header("chromium-1248/PaxHeaders/fixture", tarfile.XHDTYPE, pax_record("path", "chromium-1248/LICENSE")) + bytes(1024))

    def test_pax_helper_canary_and_unsafe_raw_overrides_rejected(self):
        for helper in ("chromium-1248/.env", "chromium-1248/Cookies", "unknown/PaxHeaders/member", "../PaxHeaders/member"):
            extension = header(helper, tarfile.XHDTYPE, pax_record("path", "chromium-1248/LICENSE"))
            self.rejected(raw=extension + raw_tar(entries()))
        raw = raw_tar(entries())[:-1024] + header("chromium-1248/PaxHeaders/alias", tarfile.XHDTYPE, pax_record("linkpath", "LICENSE")) + header("chromium-1248/alias", tarfile.SYMTYPE, linkname="/outside") + bytes(1024)
        self.rejected(items=entries() + [link("chromium-1248/alias")], raw=raw)
        raw = header("chromium-1248/PaxHeaders/file", tarfile.XHDTYPE, pax_record("path", "firefox-1555/LICENSE")) + header("chromium-1248/short", tarfile.REGTYPE, b"fixture-license") + raw_tar(entries())
        self.rejected(raw=raw)

    def test_padding_truncation_extra_nonzero_tail(self):
        tar = raw_tar(entries())
        for raw in (tar[:-600], tar + b"private", tar[:1024] + b"x" + tar[1025:]):
            self.rejected(raw=raw)

    def test_zip_exact_members_duplicate_traversal_unknown(self):
        for mutation in (lambda records: records[:-1], lambda records: records + [records[0]],
                         lambda records: records + [("../private", b"secret")], lambda records: records + [("extra", b"secret")]):
            with self.subTest(mutation=mutation):
                with contextlib.redirect_stderr(io.StringIO()):
                    self.rejected(zip_mutate=mutation)

    def test_zip_symlink_and_unsafe_modes(self):
        payload, trusted = build()
        for mode in (stat.S_IFLNK | 0o777, stat.S_IFREG | 0o666, stat.S_IFREG | 0o4755):
            source, output = zipfile.ZipFile(io.BytesIO(payload)), io.BytesIO()
            with source, zipfile.ZipFile(output, "w") as archive:
                for info in source.infolist():
                    data = source.read(info)
                    info.external_attr = mode << 16
                    archive.writestr(info, data)
            changed = output.getvalue()
            self.rejected(built=(changed, {**trusted, "zipSha256": m.sha(changed)}))

    def test_zip_crc_and_sidecar_fail_closed(self):
        self.rejected(zip_mutate=lambda records: [(name, b"wrong" if name == m.SIDECAR else data) for name, data in records])
        payload, trusted = build()
        changed = bytearray(payload)
        changed[100] ^= 1
        self.rejected(built=(bytes(changed), {**trusted, "zipSha256": m.sha(changed)}))

    @unittest.skipUnless(os.name == "posix", "Unix openat/mode/link behavior requires Linux.")
    def test_fresh_extract_permissions_links_and_licenses(self):
        payload, trusted = build(items=icons() + [link("chromium-1248/link")])
        with tempfile.TemporaryDirectory() as root:
            parent = Path(root) / "private"
            parent.mkdir(mode=0o700)
            source = Path(root) / "fixture.zip"
            source.write_bytes(payload)
            target = parent / "cache"
            result = m.import_zip(source, trusted, str(parent), str(target))
            self.assertEqual(result["state"], "imported")
            self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o700)
            self.assertEqual((target / "chromium-1248/link").read_bytes(), b"fixture-license")
            self.assertEqual(os.readlink(target / "chromium-1248/link"), "LICENSE")
            self.assertEqual(stat.S_IMODE((target / "chromium-1248/LICENSE").stat().st_mode), 0o644)
            self.assertEqual(len(list((target / m.ICON_DIR).iterdir())), 5)

    @unittest.skipUnless(os.name == "posix", "Unix openat/mode/link behavior requires Linux.")
    def test_existing_destination_never_overwritten(self):
        payload, trusted = build()
        with tempfile.TemporaryDirectory() as root:
            source = Path(root) / "fixture.zip"
            source.write_bytes(payload)
            target = Path(root) / "cache"
            target.mkdir()
            canary = target / "retained"
            canary.write_bytes(b"retained")
            with self.assertRaises(FileExistsError):
                m.import_zip(source, trusted, root, str(target))
            self.assertEqual(canary.read_bytes(), b"retained")

    @unittest.skipUnless(os.name == "posix", "Unix link semantics require Linux.")
    def test_input_symlink_and_hardlink_rejected(self):
        payload, trusted = build()
        with tempfile.TemporaryDirectory() as root:
            source = Path(root) / "fixture.zip"
            source.write_bytes(payload)
            alias = Path(root) / "alias.zip"
            alias.symlink_to(source)
            with self.assertRaises(OSError):
                m.import_zip(alias, trusted)
            alias.unlink()
            os.link(source, alias)
            with self.assertRaises(m.Rejected):
                m.import_zip(source, trusted)

    @unittest.skipUnless(os.name == "posix", "Unix openat/mode/link behavior requires Linux.")
    def test_parent_symlink_or_nonprivate_rejected(self):
        payload, trusted = build()
        with tempfile.TemporaryDirectory() as root:
            source = Path(root) / "fixture.zip"
            source.write_bytes(payload)
            private = Path(root) / "private"
            private.mkdir(mode=0o700)
            alias = Path(root) / "alias"
            alias.symlink_to(private, target_is_directory=True)
            for parent in (alias, private):
                if parent == private:
                    private.chmod(0o755)
                with self.assertRaises(m.Rejected):
                    m.import_zip(source, trusted, str(parent), str(parent / "cache"))
                self.assertFalse((private / "cache").exists())

    @unittest.skipUnless(os.name == "posix", "Unix openat/mode/link behavior requires Linux.")
    def test_bad_archive_fully_rejected_before_any_write(self):
        records = entries()
        records[-1]["_data"] = b"tampered"
        payload, trusted = build(tar_items=records)
        with tempfile.TemporaryDirectory() as root:
            source = Path(root) / "fixture.zip"
            source.write_bytes(payload)
            with self.assertRaises(m.Rejected):
                m.import_zip(source, trusted, root, root + "/cache")
            self.assertFalse(Path(root, "cache").exists())

    @unittest.skipUnless(os.name == "posix", "Unix openat/mode/link behavior requires Linux.")
    def test_stability_failure_retains_partial_without_creating_links(self):
        payload, trusted = build(items=entries() + [link("chromium-1248/link")])
        with tempfile.TemporaryDirectory() as root:
            source = Path(root) / "fixture.zip"
            source.write_bytes(payload)
            target = Path(root) / "cache"
            actual = m.file_digest
            calls = 0
            def changing(file_handle):
                nonlocal calls
                calls += 1
                return "f" * 64 if calls == 3 else actual(file_handle)
            with mock.patch.object(m, "file_digest", side_effect=changing), self.assertRaises(m.Rejected):
                m.import_zip(source, trusted, root, str(target))
            self.assertTrue((target / "chromium-1248/LICENSE").exists())
            self.assertFalse((target / "chromium-1248/link").is_symlink())
            self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o700)

    @unittest.skipUnless(os.name == "posix", "Unix openat/mode/link behavior requires Linux.")
    def test_link_creation_failure_retains_partial_and_never_cleans(self):
        payload, trusted = build(items=entries() + [link("chromium-1248/link")])
        with tempfile.TemporaryDirectory() as root:
            source = Path(root) / "fixture.zip"
            source.write_bytes(payload)
            target = Path(root) / "cache"
            with mock.patch.object(m.os, "symlink", side_effect=OSError("PRIVATE-CANARY")), self.assertRaises(OSError):
                m.import_zip(source, trusted, root, str(target))
            self.assertEqual((target / "chromium-1248/LICENSE").read_bytes(), b"fixture-license")

    def test_cli_error_redaction_and_no_network_or_process_modules(self):
        argv = ["import", "--zip", "private-canary", "--zip-sha256", "d" * 64, "--source-commit", "a" * 40,
                "--exporter-sha256", "c" * 64, "--lockfile-sha256", "b" * 64, "--manifest-sha256", "e" * 64, "--archive-sha256", "f" * 64]
        output = io.StringIO()
        with mock.patch.object(sys, "argv", argv), mock.patch.object(m, "import_zip", side_effect=OSError("PRIVATE-CANARY")), contextlib.redirect_stdout(output):
            self.assertEqual(m.main(), 1)
        self.assertNotIn("CANARY", output.getvalue())
        self.assertEqual(json.loads(output.getvalue())["code"], "browser-toolchain-contract-rejected")
        import ast
        tree = ast.parse(SCRIPT.read_text())
        imports = {alias.name.split(".")[0] for node in ast.walk(tree) if isinstance(node, ast.Import) for alias in node.names}
        self.assertFalse(imports & {"subprocess", "socket", "urllib", "requests", "shutil"})


if __name__ == "__main__":
    unittest.main(verbosity=2)
