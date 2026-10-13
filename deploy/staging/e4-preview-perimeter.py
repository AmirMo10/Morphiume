#!/usr/bin/env python3
"""Stage only an authenticated, CIDR-restricted CLOSED upstream on the private IP.

Root installs published bytes and supplies a byte-bound private request. This does
not change the application origin, start containers, create acceptance or touch DB.
"""
import argparse
import datetime
import fcntl
import grp
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import subprocess

SOURCE = 'e4bed691dc938a9c0f79022696d24f063ad97724'
PROFILE = '67f77b1636d0ae2b9b81df9e46f4a3c93087b01e0d4e6fdaa730b2604e60dd96'
ROOT = Path('/srv/morphiume/staging/runtime/releases') / SOURCE
SITE = Path('/etc/nginx/sites-available/morphiume')
AUTH = Path('/etc/nginx/morphiume-staging-preview')
CONFIG = Path('/etc/morphiume-staging-runtime')


def need(value):
    if not value:
        raise ValueError('Closed preview perimeter guard failed')


def sha(value):
    return hashlib.sha256(value).hexdigest()


def checked(path, mode, directory=False, gid=0):
    path = Path(path)
    need(path.is_absolute() and path.resolve() == path)
    for parent in path.parents:
        info = parent.lstat()
        need(parent.is_dir() and not parent.is_symlink() and info.st_uid == 0 and not info.st_mode & 0o022)
    info = path.lstat()
    need(not path.is_symlink() and info.st_uid == 0 and info.st_gid == gid and info.st_mode & 0o777 == mode)
    need(path.is_dir() if directory else path.is_file() and info.st_nlink == 1 and 0 < info.st_size <= 1048576)
    return path


def run(args, text=None):
    result = subprocess.run(args, input=text, text=True, capture_output=True, timeout=20,
        env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8'})
    need(result.returncode == 0 and len(result.stdout) <= 1048576 and len(result.stderr) <= 65536)
    return result.stdout.strip()


def write(path, value, mode=0o600, gid=0):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    with os.fdopen(fd, 'wb') as stream:
        os.fchown(stream.fileno(), 0, gid)
        stream.write(value if isinstance(value, bytes) else value.encode())
        stream.flush()
        os.fsync(stream.fileno())


def validate_request(value):
    need(type(value) is dict and set(value) == {'action', 'clientCidrs', 'siteSha256', 'expiresUtc'})
    need(value['action'] == 'stage-closed-private-ip-perimeter')
    need(isinstance(value['siteSha256'], str) and re.fullmatch('[a-f0-9]{64}', value['siteSha256']))
    expiry = datetime.datetime.fromisoformat(value['expiresUtc'].replace('Z', '+00:00'))
    need(expiry.tzinfo is not None and expiry.utcoffset() == datetime.timedelta(0))
    need(0 < (expiry - datetime.datetime.now(datetime.timezone.utc)).total_seconds() <= 3600)
    cidrs = value['clientCidrs']
    need(type(cidrs) is list and 1 <= len(cidrs) <= 2 and len(set(cidrs)) == len(cidrs))
    ranges = [ipaddress.ip_network(x) for x in ('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16')]
    for item in cidrs:
        network = ipaddress.ip_network(item, strict=True)
        need(network.version == 4 and network.prefixlen == 32 and str(network) == item)
        need(any(network.subnet_of(r) for r in ranges) and str(network.network_address) != '192.168.240.51')
    return value


def candidate(cidrs, name):
    need(re.fullmatch('[a-f0-9]{12}\\.htpasswd', name))
    rules = ''.join('  allow ' + item + ';\n' for item in cidrs)
    return ('map $http_upgrade $morphiume_connection_upgrade { default upgrade; "" close; }\n'
        'server { listen 80 default_server; listen [::]:80 default_server; server_name _; return 404; }\n'
        'server { listen 192.168.240.51:80 default_server; server_name 192.168.240.51;\n'
        ' if ($host != "192.168.240.51") { return 404; }\n server_tokens off; access_log off;\n'
        ' location / { satisfy all;\n' + rules + '  deny all;\n'
        '  auth_basic "Morphiume closed staging perimeter";\n'
        '  auth_basic_user_file ' + str(AUTH / name) + ';\n'
        # The absent legacy port is intentional. No app is exposed in this stage.
        '  proxy_pass http://127.0.0.1:3000;\n  proxy_set_header Authorization "";\n'
        '  proxy_connect_timeout 1s; proxy_read_timeout 2s;\n }\n}\n')


def main(args):
    if not args.apply:
        return {'mode': 'prepared-closed-perimeter', 'applicationExposed': False, 'serverMutation': False}
    need(os.getuid() == 0 and re.fullmatch('[a-f0-9]{64}', args.tool_sha256 or ''))
    parent = ROOT / 'tools' / args.tool_sha256
    checked(parent, 0o700, True)
    tool = checked(Path(__file__), 0o644)
    need(tool == parent / 'e4-preview-perimeter.py' and sha(tool.read_bytes()) == args.tool_sha256)
    request = checked(args.request, 0o600)
    need(request.parent == parent and request.name == 'closed-perimeter-request.json')
    raw = request.read_bytes()
    need(sha(raw) == args.request_sha256)
    value = validate_request(json.loads(raw))
    os.umask(0o077)
    lock = Path('/srv/morphiume/staging/deploy.lock')
    need(lock.resolve() == lock and not lock.is_symlink() and lock.stat().st_uid == 0)
    with lock.open('r+') as lease:
        fcntl.flock(lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
        pointer = json.loads(checked(CONFIG / 'active-profile.json', 0o600).read_bytes())
        need(pointer['profileSha256'] == PROFILE)
        need(not (CONFIG / 'preview-transition.json').exists())
        need(run(['git', '-C', '/opt/morphiume', 'rev-parse', 'HEAD']) == SOURCE)
        need(run(['git', '-C', '/opt/morphiume', 'status', '--porcelain']) == '')
        prior = checked(SITE, 0o644).read_bytes()
        need(sha(prior) == value['siteSha256'])
        enabled = Path('/etc/nginx/sites-enabled/morphiume')
        need(enabled.is_symlink() and os.readlink(enabled) == str(SITE))
        need(list(enabled.parent.iterdir()) == [enabled])
        listeners = run(['ss', '-lntH'])
        need(not any(line.split()[3].endswith(':3000') for line in listeners.splitlines()))
        client = ipaddress.ip_address(os.environ.get('SSH_CONNECTION', '').split()[0])
        need(any(client in ipaddress.ip_network(item) for item in value['clientCidrs']))
        identity = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ-') + secrets.token_hex(6)
        transaction = ROOT / ('perimeter-preflight-' + identity)
        transaction.mkdir(mode=0o700)
        write(transaction / 'previous-site.conf', prior)
        write(transaction / 'request.json', raw)
        gid = grp.getgrnam('www-data').gr_gid
        if not AUTH.exists():
            AUTH.mkdir(mode=0o750)
            os.chown(AUTH, 0, gid)
            AUTH.chmod(0o750)
        checked(AUTH, 0o750, True, gid)
        username, password = 'preflight-' + identity[-12:], secrets.token_hex(32)
        hashed = run(['openssl', 'passwd', '-6', '-stdin'], password + '\n')
        need(re.fullmatch(r'\$6\$[A-Za-z0-9./]+\$[A-Za-z0-9./]{86}', hashed))
        name = identity[-12:] + '.htpasswd'
        write(AUTH / name, username + ':' + hashed + '\n', 0o640, gid)
        (AUTH / name).chmod(0o640)
        run(['runuser', '-u', 'www-data', '--', 'test', '-r', str(AUTH / name)])
        write(transaction / 'credentials.json', json.dumps({'username': username, 'password': password}) + '\n')
        site = candidate(value['clientCidrs'], name)
        write(transaction / 'candidate-site.conf', site)
        temporary = SITE.with_name('morphiume.e4-perimeter-new')
        write(temporary, site, 0o644)
        temporary.chmod(0o644)
        os.replace(temporary, SITE)
        try:
            run(['nginx', '-t'])
            run(['systemctl', 'reload', 'nginx'])
        except (OSError, ValueError, subprocess.SubprocessError):
            rollback = SITE.with_name('morphiume.e4-perimeter-rollback-new')
            write(rollback, prior, 0o644)
            rollback.chmod(0o644)
            os.replace(rollback, SITE)
            run(['nginx', '-t'])
            run(['systemctl', 'reload', 'nginx'])
            write(transaction / 'failed.json', json.dumps({'mode': 'configuration-restored', 'applicationExposed': False}))
            raise
        report = {'mode': 'closed-private-ip-perimeter-staged', 'transaction': str(transaction),
            'siteSha256': sha(site.encode()), 'previousSiteSha256': sha(prior), 'clientCount': len(value['clientCidrs']),
            'nginxWorkerCanReadHash': True, 'applicationExposed': False, 'databaseMutation': False,
            'observedUtc': datetime.datetime.now(datetime.timezone.utc).isoformat()}
        write(transaction / 'staged.json', json.dumps(report) + '\n')
        return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--tool-sha256')
    parser.add_argument('--request', type=Path)
    parser.add_argument('--request-sha256')
    try:
        print(json.dumps(main(parser.parse_args())))
    except (OSError, ValueError, KeyError, TypeError, IndexError, subprocess.SubprocessError):
        print('Closed perimeter preparation failed; inspect private state before any next action.')
        raise SystemExit(1) from None
