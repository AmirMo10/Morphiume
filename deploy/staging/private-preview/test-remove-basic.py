"""Pure template and mutation rejection tests; never calls main/network."""
import ast
import importlib.util
from pathlib import Path
import unittest

BASE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('basic_removal',BASE/'remove-basic.py')
module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)


class BasicRemoval(unittest.TestCase):
    def setUp(self): self.before=module.before_site('0123456789ab.htpasswd')

    def test_exact_frozen_generator(self):
        source=BASE.parent/'runtime/preview.py'
        tree=ast.parse(source.read_bytes())
        selected=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='nginx_site')
        # Supply an already validated inventory; this test compares exact rendering.
        values={'re':module.re,'validate_inventory':lambda _:None,'UPGRADE_MAP':module.MAP,'AUTH_ROOT':module.AUTH_ROOT}
        exec(compile(ast.Module([selected],type_ignores=[]),str(source),'exec'),values)
        self.assertEqual(self.before,values['nginx_site']({'clientCidrs':['192.168.240.46/32']},'0123456789ab.htpasswd').encode())

    def test_only_two_auth_directives_change(self):
        after,path=module.reviewed_change(self.before)
        self.assertIn(b'auth_basic off;',after); self.assertNotIn(b'auth_basic_user_file',after)
        self.assertEqual(path,module.AUTH_ROOT/'0123456789ab.htpasswd')
        self.assertIn(b'allow 192.168.240.46/32;\n  deny all;',after)
        self.assertIn(b'satisfy all;',after)
        self.assertIn(b'listen [::]:80 default_server;',after)
        self.assertIn(b'if ($host != "192.168.240.51") { return 404; }',after)
        self.assertIn(b'proxy_set_header Authorization "";',after)

    def test_reject_unknown_or_already_changed_site(self):
        cases=[self.before.replace(b'/32;',b'/24;'),self.before.replace(b'satisfy all;',b'satisfy any;'),
            self.before.replace(b'  deny all;',b''),self.before.replace(b'return 404;',b'return 200;'),
            self.before.replace(b'[::]:80',b'[::]:8080'),self.before.replace(b'192.168.240.46',b'192.168.240.51'),
            self.before.replace(b'proxy_set_header Authorization "";',b'proxy_set_header Authorization $http_authorization;'),
            self.before+b'location /admin { allow all; }\n',self.before.replace(b'auth_basic "Morphiume protected staging";',b'auth_basic off;'),
            self.before.replace(b'127.0.0.1:3001',b'0.0.0.0:3001'),self.before.replace(b'0123456789ab.htpasswd',b'../other')]
        for value in cases:
            with self.subTest(value=value[:32]):
                with self.assertRaises(ValueError): module.reviewed_change(value)
        with self.assertRaises(ValueError): module.reviewed_change(module.reviewed_change(self.before)[0])


if __name__=='__main__': unittest.main()
