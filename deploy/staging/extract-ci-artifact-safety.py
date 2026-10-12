"""Bounded synthetic ZIP checks only; no downloads, Docker, server or credentials."""
import importlib.util
import json
import stat
import tempfile
import unittest
import warnings
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location('artifact_extractor', Path(__file__).with_name('extract-ci-artifact.py'))
extractor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extractor)


class ArtifactSafety(unittest.TestCase):
    def setUp(self):
        local = Path.cwd() / 'deploy/staging/.local'
        local.mkdir(exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(prefix='artifact-safety-', dir=local)
        self.root = Path(self.temporary.name).resolve()
        if not self.root.is_relative_to(local.resolve()): raise ValueError('Synthetic cleanup boundary changed')
        self.addCleanup(self.temporary.cleanup)

    def package(self, entries):
        path = self.root / ('synthetic-' + str(len(list(self.root.glob('*.zip')))) + '.zip')
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', UserWarning)
            with zipfile.ZipFile(path, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
                for name, value in entries:
                    archive.writestr(name, value)
        return path

    def test_exact_five_member_image_evidence_and_bounded_metadata(self):
        archive = self.package([(name, '{}') for name in extractor.EVIDENCE])
        report = extractor.extract(archive, self.root / 'evidence', 'evidence')
        self.assertEqual({item['name'] for item in report['files']}, extractor.EVIDENCE)
        self.assertEqual(len(report['files']), 5)
        self.assertFalse(report['partialEvidence']); self.assertFalse(report['executedEntries']); self.assertFalse(report['dockerAccess'])
        self.assertEqual(report['totalBytes'], 10)

    def test_missing_evidence_requires_explicit_diagnostic_partial(self):
        entries = [(name, '{}') for name in extractor.EVIDENCE if name != '.local/server-failures-image.json']
        archive = self.package(entries)
        with self.assertRaises(ValueError): extractor.extract(archive, self.root / 'full', 'evidence')
        self.assertFalse((self.root / 'full').exists())
        result = extractor.extract(archive, self.root / 'partial', 'evidence', allow_partial=True)
        self.assertTrue(result['partialEvidence']); self.assertEqual(len(result['files']), 4)

    def test_accepted_contract_remains_exact_three_and_never_partial(self):
        self.assertEqual(extractor.ACCEPTED, {'accepted-image.tar.gz', 'accepted-image.sha256', 'image-identity.json'})
        archive = self.package([(name, 'synthetic-only') for name in extractor.ACCEPTED])
        result = extractor.extract(archive, self.root / 'accepted', 'accepted')
        self.assertEqual(len(result['files']), 3)
        with self.assertRaises(ValueError): extractor.extract(archive, self.root / 'accepted-partial', 'accepted', allow_partial=True)
        extra = self.package([(name, 'synthetic-only') for name in extractor.ACCEPTED | {'.local/server-failures-image.json'}])
        with self.assertRaises(ValueError): extractor.extract(extra, self.root / 'accepted-extra', 'accepted')

    def test_traversal_duplicate_unknown_and_symlink_rejected_before_writes(self):
        linked = zipfile.ZipInfo('.local/server-failures-image.json')
        linked.create_system = 3; linked.external_attr = (stat.S_IFLNK | 0o777) << 16
        cases = [('traversal', [('../escape.json', '{}')]), ('duplicate', [('.local/image-scan.json', '{}'), ('.local/image-scan.json', '{}')]),
                 ('unknown', [('.local/private-runtime.json', '{}')]), ('linked', [(linked, 'outside')])]
        for name, entries in cases:
            archive = self.package(entries)
            with self.assertRaises(ValueError): extractor.extract(archive, self.root / name, 'evidence', allow_partial=True)
            self.assertFalse((self.root / name).exists())

    def test_accepted_metadata_bound_and_zip_expansion_ratio_remain_enforced(self):
        oversized = self.package([('image-identity.json', 'x' * (64 * 1024 + 1))])
        with self.assertRaises(ValueError): extractor.extract(oversized, self.root / 'metadata', 'accepted')
        ratio = self.package([('.local/image-scan.json', 'x' * (4 * 1024 ** 2))])
        with self.assertRaises(ValueError): extractor.extract(ratio, self.root / 'ratio', 'evidence', allow_partial=True)
        self.assertFalse((self.root / 'metadata').exists()); self.assertFalse((self.root / 'ratio').exists())

    def test_encrypted_flag_and_declared_evidence_size_rejected_before_writes(self):
        for label in ('encrypted', 'oversized'):
            archive = self.package([('.local/image-scan.json', '{}')])
            content = bytearray(archive.read_bytes())
            central = content.index(b'PK\x01\x02')
            if label == 'encrypted':
                flags = int.from_bytes(content[central + 8:central + 10], 'little') | 1
                content[central + 8:central + 10] = flags.to_bytes(2, 'little')
            else:
                content[central + 24:central + 28] = (32 * 1024 ** 2 + 1).to_bytes(4, 'little')
            archive.write_bytes(content)
            with self.assertRaises(ValueError): extractor.extract(archive, self.root / label, 'evidence', allow_partial=True)
            self.assertFalse((self.root / label).exists())

    def test_nonempty_output_refused_and_created_files_have_declared_hashes(self):
        archive = self.package([(name, '{}') for name in extractor.EVIDENCE])
        destination = self.root / 'existing'; destination.mkdir(); (destination / 'keep').write_text('preserved')
        with self.assertRaises(ValueError): extractor.extract(archive, destination, 'evidence')
        self.assertEqual((destination / 'keep').read_text(), 'preserved')
        result = extractor.extract(archive, self.root / 'fresh', 'evidence')
        import hashlib
        for item in result['files']:
            value = (self.root / 'fresh' / item['name']).read_bytes()
            self.assertEqual(len(value), item['bytes']); self.assertEqual(hashlib.sha256(value).hexdigest(), item['sha256'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
