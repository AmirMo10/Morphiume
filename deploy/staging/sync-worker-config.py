"""Add required worker-only config without rotating any existing secret."""
import json
import os
import secrets
from pathlib import Path

root = Path('/etc/morphiume-staging')
path = root / 'worker.json'
worker = json.loads(path.read_text())
app = json.loads((root / 'app.json').read_text())
worker.setdefault('APP_BASE_URL', app['APP_BASE_URL'])
worker.setdefault('MEDIA_ROOT', app['MEDIA_ROOT'])
for key in ('AUTH_SECRET', 'ADMIN_AUTH_SECRET', 'MOCK_CONTROL_SECRET'):
    worker.setdefault(key, secrets.token_hex(32))
temporary = root / 'worker.json.updated'
with temporary.open('x', encoding='utf-8') as output:
    json.dump(worker, output)
os.chown(temporary, 1001, 1001)
os.chmod(temporary, 0o600)
os.replace(temporary, path)
print('Worker configuration completed; existing values preserved.')
