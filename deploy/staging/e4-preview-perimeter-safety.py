"""Pure configuration counterexamples; no server, network or DB actions."""
import datetime
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest

spec = importlib.util.spec_from_file_location('perimeter', Path(__file__).with_name('e4-preview-perimeter.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def request():
    return {'action': 'stage-closed-private-ip-perimeter', 'clientCidrs': ['192.168.240.2/32'],
        'siteSha256': 'a' * 64, 'expiresUtc': (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=10)).isoformat()}


class Perimeter(unittest.TestCase):
    def test_plan_needs_no_server_paths(self):
        self.assertFalse(m.main(SimpleNamespace(apply=False))['serverMutation'])

    def test_exact_observed_client_can_be_prepared(self):
        value = request()
        self.assertEqual(m.validate_request(value), value)

    def test_ranges_loops_server_public_and_injection_rejected(self):
        for cidr in ['192.168.240.0/24', '127.0.0.1/32', '192.168.240.51/32', '8.8.8.8/32', '::1/128', '192.168.240.2/32; allow all;']:
            value = request()
            value['clientCidrs'] = [cidr]
            with self.subTest(cidr=cidr), self.assertRaises(ValueError):
                m.validate_request(value)

    def test_client_set_empty_duplicate_and_wide_rejected(self):
        for cidrs in [[], ['192.168.240.2/32'] * 2, ['192.168.240.2/32', '192.168.240.3/32', '192.168.240.4/32']]:
            value = request()
            value['clientCidrs'] = cidrs
            with self.assertRaises(ValueError):
                m.validate_request(value)

    def test_expiry_past_far_and_naive_rejected(self):
        for expiry in ['2020-01-01T00:00:00Z', '2099-01-01T00:00:00Z', '2099-01-01T00:00:00']:
            value = request()
            value['expiresUtc'] = expiry
            with self.assertRaises(ValueError):
                m.validate_request(value)

    def test_unknown_action_hash_or_field_rejected(self):
        for key, item in [('action', 'activate'), ('siteSha256', 'x'), ('extra', True)]:
            value = request()
            value[key] = item
            with self.assertRaises(ValueError):
                m.validate_request(value)

    def test_all_routes_share_two_access_gates_and_closed_upstream(self):
        text = m.candidate(request()['clientCidrs'], '012345abcdef.htpasswd')
        self.assertEqual(text.count('location /'), 1)
        self.assertIn('satisfy all;', text)
        self.assertIn('allow 192.168.240.2/32;', text)
        self.assertIn('deny all;', text)
        self.assertIn('auth_basic_user_file ', text)
        self.assertIn('proxy_pass http://127.0.0.1:3000;', text)
        for forbidden in ('3001', 'return 200', 'healthz', 'alias ', 'satisfy any', 'allow all'):
            self.assertNotIn(forbidden, text)

    def test_default_ipv6_unknown_host_do_not_reach_upstream(self):
        text = m.candidate(request()['clientCidrs'], '012345abcdef.htpasswd')
        default = text.split('server {')[1]
        self.assertIn('listen [::]:80 default_server;', default)
        self.assertIn('return 404;', default)
        self.assertNotIn('proxy_pass', default)
        self.assertIn('if ($host != "192.168.240.51") { return 404; }', text)

    def test_hash_path_traversal_rejected(self):
        for name in ('../a.htpasswd', 'a.htpasswd', '012345abcdef.htpasswd;allow all;'):
            with self.assertRaises(ValueError):
                m.candidate(request()['clientCidrs'], name)


if __name__ == '__main__':
    unittest.main(verbosity=2)
