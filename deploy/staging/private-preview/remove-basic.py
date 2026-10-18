#!/usr/bin/env python3
"""Remove only Basic auth from the exact previously accepted private-IP site.

Default is unexecuted. Root supplies actual previous site/config and self hashes.
No app/container/DB/firewall/timer/credential change. Client acceptance is separate.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess

ROOT = Path('/srv/morphiume/staging/runtime')
SITE = Path('/etc/nginx/sites-available/morphiume')
ENABLED = Path('/etc/nginx/sites-enabled/morphiume')
AUTH_ROOT = Path('/etc/nginx/morphiume-staging-preview')
HASH = re.compile('[a-f0-9]{64}')
UUID = re.compile('[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}')
MAP = 'map $http_upgrade $morphiume_connection_upgrade { default upgrade; "" close; }\n'


def need(value):
    if not value: raise ValueError('private_preview_basic_removal_guard')


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def before_site(credential):
    """Exact frozen Ops68 template with exactly the one authorized /32."""
    need(isinstance(credential,str) and re.fullmatch(r'[a-f0-9]{12}\.htpasswd',credential))
    return (MAP + 'server { listen 80 default_server; listen [::]:80 default_server; server_name _; return 404; }\n'
        'server {\n listen 192.168.240.51:80 default_server; server_name 192.168.240.51;\n'
        ' if ($host != "192.168.240.51") { return 404; }\n server_tokens off; access_log off;\n'
        ' client_max_body_size 5m;\n location / {\n  satisfy all;\n  allow 192.168.240.46/32;\n  deny all;\n'
        '  auth_basic "Morphiume protected staging";\n  auth_basic_user_file '+(AUTH_ROOT/credential).as_posix()+';\n'
        '  proxy_pass http://127.0.0.1:3001;\n  proxy_http_version 1.1;\n'
        '  proxy_set_header Host 192.168.240.51;\n  proxy_set_header X-Real-IP $remote_addr;\n'
        '  proxy_set_header X-Forwarded-For $remote_addr;\n  proxy_set_header X-Forwarded-Proto http;\n'
        '  proxy_set_header X-Forwarded-Host 192.168.240.51;\n  proxy_set_header Forwarded "";\n'
        '  proxy_set_header X-Forwarded-Port 80;\n  proxy_set_header X-Forwarded-Prefix "";\n'
        '  proxy_set_header Authorization "";\n  proxy_set_header Upgrade $http_upgrade;\n'
        '  proxy_set_header Connection $morphiume_connection_upgrade;\n'
        '  proxy_connect_timeout 5s; proxy_read_timeout 60s;\n }\n}\n').encode()


def reviewed_change(previous):
    match = re.search(rb'auth_basic_user_file /etc/nginx/morphiume-staging-preview/([a-f0-9]{12}\.htpasswd);',previous)
    need(match is not None)
    credential = match.group(1).decode()
    need(previous == before_site(credential))
    old = ('  auth_basic "Morphiume protected staging";\n  auth_basic_user_file '+(AUTH_ROOT/credential).as_posix()+';\n').encode()
    need(previous.count(old)==1)
    current = previous.replace(old,b'  auth_basic off;\n')
    # The sole transformation is confined to two auth directives at that location.
    need(current.replace(b'  auth_basic off;\n',old)==previous)
    return current, AUTH_ROOT/credential


def exact(path):
    path=Path(path)
    need(path.is_absolute() and path.resolve()==path and not any(p.is_symlink() for p in (path,*path.parents)))
    return path


def metadata(path,mode,uid=0,gid=0,directory=False):
    path=exact(path); info=path.lstat()
    need(info.st_uid==uid and info.st_gid==gid and stat.S_IMODE(info.st_mode)==mode)
    need(stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode) and info.st_nlink==1 and info.st_size<=4*1024**2)
    return path


def run(command):
    return subprocess.run(command,check=True,capture_output=True,timeout=30,env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','LANG':'C.UTF-8'}).stdout


def syncdir(path):
    fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY)
    try: os.fsync(fd)
    finally: os.close(fd)


def create(path,body,mode):
    exact(path); need(not path.exists() and not path.is_symlink())
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
    try:
        os.fchmod(fd,mode)
        with os.fdopen(fd,'wb',closefd=False) as output:
            output.write(body); output.flush(); os.fsync(output.fileno())
    finally: os.close(fd)
    syncdir(path.parent)


def stamp(directory,phase,values):
    body=(json.dumps({'mode':'private-preview-basic-removal','phase':phase,
        'observedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),**values},sort_keys=True)+'\n').encode()
    create(directory/(phase+'.json'),body,0o600)
    return sha(body)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true'); parser.add_argument('--operation-id')
    parser.add_argument('--expected-site-sha256'); parser.add_argument('--expected-nginx-config-sha256'); parser.add_argument('--self-sha256')
    args=parser.parse_args()
    if not args.apply: return {'mode':'unexecuted-basic-removal-plan','serverMutation':False}
    import grp
    need(os.name=='posix' and os.getuid()==0 and UUID.fullmatch(args.operation_id or ''))
    for value in (args.expected_site_sha256,args.expected_nginx_config_sha256,args.self_sha256): need(isinstance(value,str) and HASH.fullmatch(value))
    own=metadata(Path(__file__),0o644); need(sha(own.read_bytes())==args.self_sha256)
    # Independent of any future application image/CI identity.
    need(own==Path('/etc/morphiume-staging-runtime/private-preview-tools')/args.self_sha256/'remove-basic.py')
    metadata(own.parent,0o700,directory=True)
    previous=metadata(SITE,0o644).read_bytes(); need(sha(previous)==args.expected_site_sha256)
    need(ENABLED.is_symlink() and ENABLED.resolve()==SITE and ENABLED.lstat().st_uid==0)
    current,authfile=reviewed_change(previous)
    group=grp.getgrnam('www-data').gr_gid
    metadata(AUTH_ROOT,0o750,gid=group,directory=True)
    auth=metadata(authfile,0o640,gid=group); info=auth.lstat()
    auth_before={'sha256':sha(auth.read_bytes()),'device':info.st_dev,'inode':info.st_ino,'mtimeNs':info.st_mtime_ns,'bytes':info.st_size}
    need(sha(run(['nginx','-T']))==args.expected_nginx_config_sha256)
    run(['nginx','-t'])
    parent=metadata(ROOT/'metrics',0o700,directory=True)
    directory=exact(parent/('private-preview-basic-'+args.operation_id))
    need(not directory.exists()); directory.mkdir(mode=0o700); os.chmod(directory,0o700); syncdir(parent)
    create(directory/'before-site.conf',previous,0o600)
    create(directory/'after-site.conf',current,0o600)
    before={'operationId':args.operation_id,'selfSha256':args.self_sha256,'beforeSiteSha256':sha(previous),
        'afterSiteSha256':sha(current),'beforeNginxConfigSha256':args.expected_nginx_config_sha256,
        'authorizedClientCidrs':['192.168.240.46/32'],'unknownHostStatus':404,'ipv6Policy':'deny-all',
        'authfilePreserved':auth_before,'applicationMutation':False,'clientAcceptance':'pending'}
    stamp(directory,'01-before-replace',before)
    try:
        need(metadata(SITE,0o644).read_bytes()==previous)
        temporary=SITE.with_name('morphiume.private-preview-'+args.operation_id+'.new')
        create(temporary,current,0o644); os.replace(temporary,SITE); syncdir(SITE.parent)
        stamp(directory,'02-site-replaced',before)
        run(['nginx','-t']); run(['systemctl','reload','nginx'])
        need(metadata(SITE,0o644).read_bytes()==current)
        now=metadata(authfile,0o640,gid=group).lstat()
        auth_after={'sha256':sha(authfile.read_bytes()),'device':now.st_dev,'inode':now.st_ino,'mtimeNs':now.st_mtime_ns,'bytes':now.st_size}
        need(auth_after==auth_before)
        final=before|{'mode':'private-preview-basic-removed-client-acceptance-pending','nginxReloadExitCode':0,
            'afterNginxConfigSha256':sha(run(['nginx','-T'])),'completedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat()}
        final_sha=stamp(directory,'03-reloaded',final)
        return {'mode':final['mode'],'operationId':args.operation_id,'evidenceRoot':str(directory),'evidenceSha256':final_sha,
            'beforeSiteSha256':sha(previous),'afterSiteSha256':sha(current),'nginxReloadExitCode':0,
            'applicationMutation':False,'authfileUnchanged':True,'clientAcceptance':'pending'}
    except Exception:
        stamp(directory,'failed-preserved',{'operationId':args.operation_id,'automaticRetry':False,'automaticRollback':False})
        raise


if __name__=='__main__':
    try: print(json.dumps(main()))
    except Exception:
        print(json.dumps({'mode':'basic-removal-gated-or-failed','privateStatePreserved':True,'automaticRetry':False}))
        raise SystemExit(1) from None
