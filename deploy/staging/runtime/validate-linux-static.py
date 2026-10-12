"""Authorized temporary-source validation only; no DB, Docker or service start."""
import ast
import argparse
import importlib.util
import json
import re
import subprocess
import unittest
from pathlib import Path

import contract as c

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--ops-sha256', required=True, help='Explicit root-reviewed canonical source fingerprint')
args = parser.parse_args()
root = c.OPS_ROOT
if root.parent != Path('/tmp') or not re.fullmatch(r'morphiume-ops-validation-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}', root.name):
    raise SystemExit('Use only the reviewed new temporary validation directory')
if root.resolve() != root or root.is_symlink():
    raise SystemExit('Temporary validation boundary changed')
expected = args.ops_sha256
if not re.fullmatch('[a-f0-9]{64}', expected):
    raise SystemExit('A trusted canonical source fingerprint is required')
if c.ops_digest() != expected:
    raise SystemExit('Reviewed source fingerprint mismatch')
for name in c.OPS_FILES:
    if name.endswith('.py'):
        ast.parse((root / name).read_text(), filename=name)
for name in ('assert-boundaries.sh', 'runtime/restore-init.sh'):
    subprocess.run(['bash', '-n', str(root / name)], check=True)
spec = importlib.util.spec_from_file_location('runtime_safety', root / 'runtime/safety-check.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
suite = unittest.TestSuite(module.Safety(name) for name in unittest.defaultTestLoader.getTestCaseNames(module.Safety)
                          if name != 'test_node_target_and_identity_guard')
result = unittest.TextTestRunner(verbosity=2).run(suite)
if not result.wasSuccessful(): raise SystemExit(1)
units = sorted(str(file) for file in (root / 'runtime/systemd').iterdir() if file.suffix in ('.service', '.timer'))
subprocess.run(['systemd-analyze', 'verify', *units], check=True)
subprocess.run(['systemd-analyze', 'calendar', '*-*-* 03:00:00 UTC'], check=True)
print(json.dumps({'opsSha256': expected, 'pythonAndBashSyntax': 'passed', 'linuxSyntheticTests': result.testsRun,
                  'linuxSkipped': len(result.skipped), 'systemdUnitsVerified': len(units),
                  'hostNodeCases': 'not-executed-host-node-absent', 'databaseOperations': 0, 'serviceStarts': 0}))
