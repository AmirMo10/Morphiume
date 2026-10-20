"""Pure clean-VPS boundary tests: no host inspection, network or installation."""
import contextlib
import copy
import importlib.util
import io
import tarfile
import unittest
import urllib.request
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[2]
BOOTSTRAP = ROOT / "deploy" / "vps" / "bootstrap.py"
MEDIA = ROOT / "deploy" / "vps" / "restore_media.py"


def load_bootstrap():
    spec = importlib.util.spec_from_file_location("morphiume_vps_guard_test", BOOTSTRAP)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_media():
    spec = importlib.util.spec_from_file_location("morphiume_vps_media_guard_test", MEDIA)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def tar_member(name, size=0, kind=tarfile.REGTYPE):
    member = tarfile.TarInfo(name)
    member.type = kind
    member.size = size
    return member


def fixture(module):
    # A synthetic fact set. No claim is made that this VPS actually exists.
    facts = {
        "mode": "read-only-clean-host-observation", "system": "Linux", "uid": 0,
        "osId": "ubuntu", "osVersion": "24.04", "architecture": "amd64",
        "hostname": "morphiume-replica", "machineId": "a1" * 16,
        "localIpv4": ["127.0.0.1", "198.51.100.25"], "cpuCount": 4,
        "memoryBytes": 8 * 1024**3, "rootAvailableBytes": 80 * 1024**3,
        "existingPaths": [], "installedConflicts": [], "dockerInstalled": False,
        "nginxInstalled": False, "listenersOutsideSsh": [], "systemdFailed": [],
        "rebootRequired": False, "ntpSynchronized": True,
    }
    pins = {name: "1.2.3-1~ubuntu.24.04~noble" for name in module.DOCKER_PACKAGES}
    request = {
        "machineId": facts["machineId"], "targetIp": "198.51.100.25",
        "sshAllow": "203.0.113.10/32", "dockerKeySha256": "ab" * 32, "pins": pins,
    }
    return facts, request


class CleanVpsBoundaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = load_bootstrap()

    def test_import_has_no_commands_network_or_filesystem_mutations(self):
        with contextlib.ExitStack() as stack:
            for target in ("subprocess.run", "subprocess.Popen", "urllib.request.urlopen",
                           "pathlib.Path.mkdir", "pathlib.Path.write_text", "pathlib.Path.write_bytes"):
                stack.enter_context(patch(target, side_effect=AssertionError("Import performed IO")))
            imported = load_bootstrap()
            self.assertTrue(callable(imported.validate_target_facts))

    def test_default_plan_does_not_inspect_or_install(self):
        module = self.module
        with patch.object(module, "inspect_host", side_effect=AssertionError("Unexpected inspection")), \
                patch.object(module, "apply_packages", side_effect=AssertionError("Unexpected installation")), \
                patch.object(module, "command", side_effect=AssertionError("Unexpected command")), \
                patch.object(urllib.request, "urlopen", side_effect=AssertionError("Unexpected network")):
            plan = module.main([])
        self.assertEqual(plan["mode"], "unexecuted-package-plan")
        for key in ("serverMutation", "startsApplication", "restoresDatabase", "changesFirewallRules"):
            self.assertIs(plan[key], False)
        self.assertEqual(set(plan["dockerPackages"]), set(module.DOCKER_PACKAGES))

    def test_complete_explicit_new_host_is_accepted_without_io(self):
        facts, request = fixture(self.module)
        with patch.object(self.module, "command", side_effect=AssertionError("Validation performed IO")):
            accepted = self.module.validate_target_facts(facts, request)
        self.assertEqual(accepted["targetIp"], request["targetIp"])
        self.assertEqual(accepted["sshAllow"], request["sshAllow"])
        self.assertIs(accepted["freshTargetAccepted"], True)

    def test_existing_source_ip_and_source_alias_are_refused(self):
        for selected, addresses, hostname in (
            ("192.168.240.51", ["192.168.240.51"], "morphiume-replica"),
            ("198.51.100.25", ["198.51.100.25", "192.168.240.51"], "renamed-source"),
            ("198.51.100.25", ["198.51.100.25"], "MoRpHiUmE"),
        ):
            facts, request = fixture(self.module)
            facts.update(localIpv4=addresses, hostname=hostname)
            request["targetIp"] = selected
            with self.subTest(selected=selected, hostname=hostname), self.assertRaises(ValueError):
                self.module.validate_target_facts(facts, request)

    def test_machine_ip_root_and_supported_os_architecture_are_bound(self):
        changes = (
            {"machineId": "b2" * 16}, {"localIpv4": ["198.51.100.26"]},
            {"uid": 1000}, {"system": "Windows"}, {"osId": "debian"},
            {"osVersion": "22.04"}, {"architecture": "arm64"},
        )
        for change in changes:
            facts, request = fixture(self.module)
            facts.update(change)
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.module.validate_target_facts(facts, request)

    def test_incomplete_safety_observation_fails_closed(self):
        for name in ("existingPaths", "installedConflicts", "dockerInstalled", "nginxInstalled",
                     "listenersOutsideSsh", "systemdFailed", "rebootRequired", "ntpSynchronized"):
            facts, request = fixture(self.module)
            del facts[name]
            with self.subTest(missing=name), self.assertRaises(ValueError):
                self.module.validate_target_facts(facts, request)

    def test_non_boolean_or_non_list_safety_fields_are_refused(self):
        for name, value in (("existingPaths", ""), ("installedConflicts", {}),
                            ("listenersOutsideSsh", False), ("systemdFailed", None),
                            ("dockerInstalled", 0), ("nginxInstalled", None),
                            ("rebootRequired", ""), ("ntpSynchronized", "yes")):
            facts, request = fixture(self.module)
            facts[name] = value
            with self.subTest(field=name, value=value), self.assertRaises(ValueError):
                self.module.validate_target_facts(facts, request)

    def test_existing_data_services_failed_units_and_clock_are_refused(self):
        changes = (
            {"existingPaths": ["/srv/morphiume"]}, {"installedConflicts": ["docker.io"]},
            {"dockerInstalled": True}, {"nginxInstalled": True},
            {"listenersOutsideSsh": ["LISTEN 0 128 0.0.0.0:443"]},
            {"systemdFailed": ["failed-backup.service"]}, {"rebootRequired": True},
            {"ntpSynchronized": False},
        )
        for change in changes:
            facts, request = fixture(self.module)
            facts.update(change)
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.module.validate_target_facts(facts, request)

    def test_resource_floor_is_refused(self):
        for change in ({"cpuCount": 3}, {"memoryBytes": 3 * 1024**3},
                       {"memoryBytes": 4 * 1024**3}, {"memoryBytes": 7 * 1024**3 - 1},
                       {"rootAvailableBytes": 59 * 1024**3}):
            facts, request = fixture(self.module)
            facts.update(change)
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.module.validate_target_facts(facts, request)

    def test_advertised_eight_gib_class_allows_documented_os_reservation(self):
        facts, request = fixture(self.module)
        facts["memoryBytes"] = 7 * 1024**3
        self.assertTrue(self.module.validate_target_facts(facts, request)["freshTargetAccepted"])

    def test_invalid_destination_addresses_are_refused(self):
        for address in ("0.0.0.0", "127.0.0.1", "169.254.1.1", "224.0.0.1"):
            facts, request = fixture(self.module)
            facts["localIpv4"] = [address]
            request["targetIp"] = address
            with self.subTest(address=address), self.assertRaises(ValueError):
                self.module.validate_target_facts(facts, request)

    def test_explicit_key_and_restricted_ssh_network_are_required(self):
        for name, value in (("machineId", ""), ("machineId", "a" * 31),
                            ("dockerKeySha256", ""), ("dockerKeySha256", "not-a-hash"),
                            ("sshAllow", "0.0.0.0/0"), ("sshAllow", "::/0"),
                            ("sshAllow", "127.0.0.1/32"), ("sshAllow", "224.0.0.1/32")):
            facts, request = fixture(self.module)
            request[name] = value
            with self.subTest(field=name, value=value), self.assertRaises(ValueError):
                self.module.validate_target_facts(facts, request)

    def test_package_pins_cannot_inject_options_or_omit_or_drift_engine_cli(self):
        _, request = fixture(self.module)
        self.module.validate_pins(request["pins"])
        bad = []
        missing = copy.deepcopy(request["pins"])
        del missing["docker-ce"]
        bad.append(missing)
        for value in ("", "latest", "--allow-unauthenticated", "1.2.3; touch /tmp/unsafe", "1.2.3\n--yes"):
            pins = copy.deepcopy(request["pins"])
            pins["containerd.io"] = value
            bad.append(pins)
        drift = copy.deepcopy(request["pins"])
        drift["docker-ce-cli"] = "9.9.9"
        bad.append(drift)
        for pins in bad:
            with self.subTest(pins=pins), self.assertRaises(ValueError):
                self.module.validate_pins(pins)

    def test_invalid_apply_stops_before_first_apt_or_network_action(self):
        facts, request = fixture(self.module)
        facts["existingPaths"] = ["/srv/morphiume/staging/postgres"]
        with patch.object(self.module, "command", side_effect=AssertionError("Unsafe Apt action")), \
                patch.object(urllib.request, "urlopen", side_effect=AssertionError("Unsafe network action")), \
                patch.object(self.module, "exclusive_file", side_effect=AssertionError("Unsafe file write")):
            with self.assertRaises(ValueError):
                self.module.apply_packages(facts, request)

    def test_inspect_and_apply_modes_cannot_be_combined(self):
        with patch.object(self.module, "inspect_host", side_effect=AssertionError("Invalid CLI inspected host")), \
                contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as stopped:
            self.module.main(["--inspect", "--apply"])
        self.assertEqual(stopped.exception.code, 2)


class MediaArchiveBoundaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = load_media()

    def test_import_and_default_media_plan_do_not_open_or_extract_archives(self):
        with contextlib.ExitStack() as stack:
            for target in ("tarfile.open", "subprocess.run", "subprocess.Popen", "pathlib.Path.mkdir", "pathlib.Path.write_text",
                           "pathlib.Path.write_bytes", "os.chown", "urllib.request.urlopen"):
                stack.enter_context(patch(target, side_effect=AssertionError("Media import performed IO"), create=target == "os.chown"))
            module = load_media()
            plan = module.main([])
            self.assertEqual(plan["mode"], "unexecuted-media-plan")
            self.assertIs(plan["serverMutation"], False)
            self.assertNotEqual(plan["destination"], plan["quarantine"])

    def test_bounded_regular_media_and_known_capability_are_validated_only(self):
        summary = self.module.validate_members([
            tar_member(".", kind=tarfile.DIRTYPE),
            tar_member("./public", kind=tarfile.DIRTYPE), tar_member("./public/product.webp", size=20),
            tar_member("./.private-preview-access", kind=tarfile.DIRTYPE),
            tar_member("./.private-preview-access/config.json", size=30),
        ])
        self.assertEqual(summary["files"], 2)
        self.assertEqual(summary["bytes"], 50)
        self.assertIs(summary["previewCapabilityQuarantined"], True)

    def test_traversal_absolute_windows_and_ambiguous_paths_are_refused(self):
        for name in ("../outside", "/etc/passwd", "public/../../outside", "public//image.webp",
                     "public/./image.webp", "public\\image.webp", "././image.webp", "bad\0name"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                self.module.validate_members([tar_member(name, size=1)])

    def test_links_devices_pipes_and_file_directory_collisions_are_refused(self):
        for kind in (tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.CHRTYPE,
                     tarfile.BLKTYPE, tarfile.FIFOTYPE):
            member = tar_member("public/image.webp", kind=kind)
            member.linkname = "../../outside"
            with self.subTest(kind=kind), self.assertRaises(ValueError):
                self.module.validate_members([member])
        for members in (
            [tar_member("public", size=1), tar_member("public/image.webp", size=1)],
            [tar_member("public/image.webp", size=1), tar_member("public", size=1)],
            [tar_member("public/image.webp", size=1), tar_member("public/image.webp", size=1)],
        ):
            with self.subTest(names=[member.name for member in members]), self.assertRaises(ValueError):
                self.module.validate_members(members)

    def test_preview_authority_has_only_a_directory_and_regular_config_shape(self):
        for member in (
            tar_member(".private-preview-access", size=1),
            tar_member(".private-preview-access/config.json", kind=tarfile.DIRTYPE),
            tar_member(".private-preview-access/config.json/", kind=tarfile.DIRTYPE),
            tar_member("public/image.webp/", size=1),
            tar_member(".private-preview-access/password.txt", size=1),
            tar_member(".private-preview-access/nested/config.json", size=1),
        ):
            with self.subTest(name=member.name, kind=member.type), self.assertRaises(ValueError):
                self.module.validate_members([member])

    def test_root_and_other_directory_sizes_cannot_evade_expansion_limits(self):
        for name in (".", "./", "public"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                self.module.validate_members([tar_member(name, size=1, kind=tarfile.DIRTYPE)])
        with patch.object(self.module, "MAX_FILES", 2), self.assertRaises(ValueError):
            self.module.validate_members([
                tar_member(".", kind=tarfile.DIRTYPE), tar_member("one.webp", size=1),
                tar_member("two.webp", size=1),
            ])

    def test_total_file_and_member_bounds_are_enforced_without_large_allocations(self):
        with patch.object(self.module, "MAX_BYTES", 10), self.assertRaises(ValueError):
            self.module.validate_members([tar_member("one.webp", size=6), tar_member("two.webp", size=6)])
        with patch.object(self.module, "MAX_FILE_BYTES", 5), self.assertRaises(ValueError):
            self.module.validate_members([tar_member("one.webp", size=6)])
        with patch.object(self.module, "MAX_FILES", 1), self.assertRaises(ValueError):
            self.module.validate_members([tar_member("one.webp", size=1), tar_member("two.webp", size=1)])

    def test_media_apply_requires_archive_and_checksum_before_io(self):
        with patch.object(self.module, "restore", side_effect=AssertionError("Missing contract opened archive")):
            for arguments in (["--apply"], ["--inspect"], ["--apply", "--archive", "/unsafe/archive"]):
                with self.subTest(arguments=arguments), self.assertRaises(ValueError):
                    self.module.main(arguments)

    def test_media_mutator_binds_destination_identity_separately_from_pristine_host(self):
        facts, request = fixture(load_bootstrap())
        identity = {name: facts[name] for name in ("system", "uid", "hostname", "machineId", "localIpv4")}
        binding = {name: request[name] for name in ("machineId", "targetIp")}
        self.assertIsNone(self.module.validate_destination_identity(identity, binding))
        changes = (
            {"uid": 1001}, {"system": "Windows"}, {"hostname": "MoRpHiUmE"},
            {"localIpv4": [request["targetIp"], "192.168.240.51"]},
            {"machineId": "b2" * 16}, {"localIpv4": ["198.51.100.26"]},
            {"localIpv4": "198.51.100.25"},
        )
        for change in changes:
            observed = copy.deepcopy(identity)
            observed.update(change)
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.module.validate_destination_identity(observed, binding)
        for missing in identity:
            observed = copy.deepcopy(identity)
            del observed[missing]
            with self.subTest(missing=missing), self.assertRaises(ValueError):
                self.module.validate_destination_identity(observed, binding)

    def test_wrong_destination_apply_stops_before_any_archive_or_target_io(self):
        facts = {"system": "Linux", "uid": 0, "hostname": "source-alias",
                 "machineId": "a1" * 16, "localIpv4": ["192.168.240.51", "198.51.100.25"]}
        binding = {"machineId": "a1" * 16, "targetIp": "198.51.100.25"}
        with patch.object(self.module, "inspect_destination_identity", return_value=facts), \
                patch.object(self.module, "fresh_directory", side_effect=AssertionError("Wrong target mutation")), \
                patch.object(tarfile, "open", side_effect=AssertionError("Wrong target archive IO")):
            with self.assertRaises(ValueError):
                self.module.restore(None, "ab" * 32, apply=True, identity=binding)


if __name__ == "__main__":
    unittest.main(verbosity=2)
