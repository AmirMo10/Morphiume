"""Guarded staging origin transition; default plan, explicit accepted dispatch only.

No migration, seed, role/financial/schema rollback, image pull or source mutation.
Native evidence comes from independent QA; readiness never promotes acceptance.
"""
import argparse
import datetime
import hashlib
import ipaddress
import json
import math
import os
import re
import secrets
import subprocess
import urllib.request
from pathlib import Path

import backup
import contract as c
import upgrade

SITE = Path('/etc/nginx/sites-available/morphiume')
ENABLED = Path('/etc/nginx/sites-enabled/morphiume')
AUTH_ROOT = Path('/etc/nginx/morphiume-staging-preview')
STATE_NAME = 'preview-transition.json'
SNAPSHOTS = ('app.json', 'worker.json', 'migration.json', 'deploy.env', 'deployed-release.json', 'active-profile.json')
BASELINE_CHECKS = {'nativeLogin', 'adminMfa', 'newT25', 'paymentReceiptDedup', 'stockReservation', 'shipmentTracking', 'mediaHashes'}
RESTORE_CHECKS = {'nativeLogin', 'ownedOrder', 'paymentReceiptDedup', 'stockReservation', 'shipmentTracking', 'mediaHashes'}
NATIVE_CHECKS = {'nativeLogin', 'adminMfa', 'csrf', 'cookies', 'ownedOrder', 'paymentReceiptDedup', 'newT25', 'mediaHashes', 'perimeter', 'headers'}
INVENTORY_CHECKS = {'interfacesInspected', 'ipv4ExposureInspected', 'ipv6ExposureInspected', 'firewallDockerInspected',
                    'authorizedClientVerified', 'unauthorizedClientVerified', 'sshManagementPreserved',
                    'noAlternateAppRoute', 'transportBoundaryApproved', 'timersSuspended', 'nginxWorkerAccessReviewed',
                    'insecureOriginPrerequisitesReviewed'}
UPGRADE_MAP = 'map $http_upgrade $morphiume_connection_upgrade { default upgrade; "" close; }\n'


def utc():
    return datetime.datetime.now(datetime.timezone.utc)


def timestamp(value):
    if not isinstance(value, str): raise ValueError('Actual UTC observation timestamp is required')
    parsed = datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None or parsed.utcoffset() != datetime.timedelta(0): raise ValueError('Evidence timestamp must be UTC')
    return parsed


def checks(value, expected):
    if not isinstance(value, dict) or set(value) != expected or any(item is not True for item in value.values()):
        raise ValueError('Actual complete acceptance/inventory checks are required')


def same_release(value, report):
    if not isinstance(value, dict) or any(value.get(key) != report[key] for key in c.RELEASE_KEYS):
        raise ValueError('Evidence differs from the explicitly accepted image/source')


def validate_baselines(baseline, restored, report, old):
    for item in (baseline, restored):
        same_release(item, report); c.match_mapping(item, old)
        accepted = timestamp(item.get('acceptedUtc'))
        if accepted > utc(): raise ValueError('Future acceptance cannot establish an executed baseline')
    if baseline.get('origin') != c.ORIGINS['ssh-localhost'] or baseline.get('database') != c.DATABASE or baseline.get('accessProfileSha256') != c.canonical_hash(old):
        raise ValueError('Retained baseline must identify the actual SSH3100 runtime/profile')
    checks(baseline.get('checks'), BASELINE_CHECKS)
    if not re.fullmatch('[a-f0-9]{64}', str(baseline.get('fixtureManifestSha256', ''))): raise ValueError('Retained actual fixture fingerprint is required')
    if restored.get('origin') != 'http://localhost:3101' or restored.get('workerStarted') is not False or restored.get('fixtureManifestSha256') != baseline['fixtureManifestSha256']:
        raise ValueError('Independent restore must identify the same retained fixture at3101 without a worker')
    checks(restored.get('checks'), RESTORE_CHECKS)
    for key in ('observedRtoSeconds', 'observedRecoveryPointGapSeconds'):
        if type(restored.get(key)) not in (int, float) or not math.isfinite(restored[key]) or restored[key] < 0:
            raise ValueError('Actual finite recovery timing is required')


def validate_inventory(value):
    keys = {'version', 'targetOrigin', 'ipv6Policy', 'basicAuth', 'clientCidrs', 'checks', 'observedUtc',
            'nginxConfigSha256', 'siteSha256', 'addressesSha256', 'routesSha256', 'listenersSha256', 'firewallSha256'}
    if not isinstance(value, dict) or set(value) != keys or type(value.get('version')) is not int or value['version'] != 1 or value.get('targetOrigin') != c.ORIGINS['private-ip'] or value.get('ipv6Policy') != 'deny-all' or value.get('basicAuth') is not True:
        raise ValueError('Exact approved private-IP network/Basic-auth inventory is required')
    checks(value['checks'], INVENTORY_CHECKS)
    age = (utc() - timestamp(value['observedUtc'])).total_seconds()
    if not 0 <= age <= 3600: raise ValueError('Network inventory must be an actual observation within one hour')
    for key in ('nginxConfigSha256', 'siteSha256', 'addressesSha256', 'routesSha256', 'listenersSha256', 'firewallSha256'):
        if not re.fullmatch('[a-f0-9]{64}', str(value[key])): raise ValueError('Inventory must bind actual configuration/exposure observations')
    cidrs = value['clientCidrs']
    if not isinstance(cidrs, list) or not 1 <= len(cidrs) <= 8 or len(set(cidrs)) != len(cidrs): raise ValueError('Use a finite explicit authorized-client inventory')
    ranges = [ipaddress.ip_network(item) for item in ('10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16')]
    for item in cidrs:
        if not isinstance(item, str): raise ValueError('Invalid client CIDR')
        network = ipaddress.ip_network(item, strict=True)
        if network.version != 4 or str(network) != item or network.prefixlen < 24 or not any(network.subnet_of(parent) for parent in ranges):
            raise ValueError('Only narrow approved private IPv4 client CIDRs are permitted')
    return value


def validate_dispatch(dispatch, report, old, inventory_hash):
    c.match_mapping(dispatch, report)
    keys = set(c.RELEASE_KEYS) | {'opsSha256', 'runtimeImageId', 'engineProofSha256', 'action', 'oldProfileSha256', 'inventorySha256', 'sharedDatabaseWindowReleased', 'expiresUtc'}
    if set(dispatch) != keys or dispatch.get('action') != 'activate-private-ip' or dispatch.get('sharedDatabaseWindowReleased') is not True or dispatch.get('opsSha256') != report['opsSha256'] or dispatch.get('oldProfileSha256') != c.canonical_hash(old) or dispatch.get('inventorySha256') != inventory_hash:
        raise ValueError('Explicit root accepted-identity/profile/network dispatch is required')
    remaining = (timestamp(dispatch['expiresUtc']) - utc()).total_seconds()
    if not 0 < remaining <= 3600: raise ValueError('Preview dispatch needs a finite current expiry within one hour')


def evidence_file(path, expected_hash, kind):
    path = c.exact_path(Path(path))
    if kind in ('baseline', 'acceptance'):
        if path != c.ROOT / 'metrics' / ('preview-' + kind + '.json'): raise ValueError('Use the exact runtime preview evidence path')
    elif kind == 'restore':
        import restore
        restore.validate_restore_path(path.parent)
        if path.name != 'recovery-accepted.json': raise ValueError('Use the exact isolated restore acceptance file')
    elif path != c.CONFIG / ('preview-' + kind + '.json'):
        raise ValueError('Use the exact protected inventory/dispatch path')
    data = c.private_file(path).read_bytes()
    if len(data) > 1024 ** 2 or not re.fullmatch('[a-f0-9]{64}', expected_hash) or hashlib.sha256(data).hexdigest() != expected_hash:
        raise ValueError('Private evidence does not match the explicit trusted hash')
    return json.loads(data)


def validate_transition(old, report, previous_ops, previous_profile, partial):
    c.validate_profile(old); c.validate_identity(report)
    if partial: raise ValueError('Partial preview/upgrade state requires explicit rollback or recovery')
    if old['profile'] != 'ssh-localhost' or any(old[key] != report[key] for key in c.RELEASE_KEYS) or old['opsSha256'] != previous_ops or c.canonical_hash(old) != previous_profile:
        raise ValueError('Only the explicit retained SSH3100 release/profile can transition')
    if any(old[key] != report[key] for key in ('runtimeImageId', 'engineProofSha256')):
        raise ValueError('An origin-only transition cannot change the proven engine mapping')


def transition_configs(configs):
    result = {file: dict(value) for file, value in configs.items()}
    for file in ('app.json', 'worker.json'):
        c.validate_config(configs[file], c.APP)
        result[file]['APP_BASE_URL'] = c.ORIGINS['private-ip']
        c.validate_config(result[file], c.APP, profile='private-ip')
    c.validate_config(result['migration.json'], c.OWNER, migration=True)
    return result


def maintenance_site():
    return (UPGRADE_MAP + '# Closed preview: no upstream, no data, no credential or origin bypass.\n'
            'server { listen 80 default_server; listen [::]:80 default_server; server_name _;\n'
            ' server_tokens off; access_log off; return 503; }\n')


def nginx_site(inventory, credential_name):
    validate_inventory(inventory)
    if not re.fullmatch(r'[a-f0-9]{12}\.htpasswd', credential_name): raise ValueError('Unexpected preview password-file name')
    rules = ''.join('  allow ' + item + ';\n' for item in inventory['clientCidrs'])
    # All application routes share one access phase. No health/static return
    # executes before auth/access. Other interfaces/hosts/IPv6 serve no app.
    return (UPGRADE_MAP + 'server { listen 80 default_server; listen [::]:80 default_server; server_name _; return 404; }\n'
            'server {\n listen 192.168.240.51:80 default_server; server_name 192.168.240.51;\n'
            ' if ($host != "192.168.240.51") { return 404; }\n server_tokens off; access_log off;\n'
            ' client_max_body_size 5m;\n location / {\n  satisfy all;\n' + rules + '  deny all;\n'
            '  auth_basic "Morphiume protected staging";\n  auth_basic_user_file ' + (AUTH_ROOT / credential_name).as_posix() + ';\n'
            '  proxy_pass http://127.0.0.1:3001;\n  proxy_http_version 1.1;\n'
            '  proxy_set_header Host 192.168.240.51;\n  proxy_set_header X-Real-IP $remote_addr;\n'
            '  proxy_set_header X-Forwarded-For $remote_addr;\n  proxy_set_header X-Forwarded-Proto http;\n'
            '  proxy_set_header X-Forwarded-Host 192.168.240.51;\n  proxy_set_header Forwarded "";\n'
            '  proxy_set_header X-Forwarded-Port 80;\n  proxy_set_header X-Forwarded-Prefix "";\n'
            '  proxy_set_header Authorization "";\n  proxy_set_header Upgrade $http_upgrade;\n'
            '  proxy_set_header Connection $morphiume_connection_upgrade;\n'
            '  proxy_connect_timeout 5s; proxy_read_timeout 60s;\n }\n}\n')


def public_site():
    c.exact_path(SITE)
    metadata = SITE.stat()
    if not SITE.is_file() or metadata.st_uid != 0 or metadata.st_mode & 0o022 or metadata.st_size > 1024 ** 2:
        raise ValueError('Exact reviewed Nginx site must be root-owned and not writable by others')
    # The provisioned enabled link is the only intentional symlink accepted.
    c.exact_path(ENABLED.parent)
    if not ENABLED.is_symlink() or os.readlink(ENABLED) != str(SITE): raise ValueError('Exact installed site link changed')


def observe_inventory(inventory):
    public_site()
    if hashlib.sha256(SITE.read_bytes()).hexdigest() != inventory['siteSha256']: raise ValueError('Current site differs from approved inventory')
    operations = {'nginxConfigSha256': ['nginx', '-T'], 'addressesSha256': ['ip', '-j', 'address'],
                  'routesSha256': ['ip', '-j', 'route'], 'listenersSha256': ['ss', '-lntH'], 'firewallSha256': ['ufw', 'status', 'verbose']}
    for key, command in operations.items():
        if hashlib.sha256(c.run(command).encode()).hexdigest() != inventory[key]: raise ValueError('Actual exposure/configuration inventory changed')


def atomic_private(path, value, uid=0, gid=0):
    temporary = path.with_name(path.name + '.new')
    c.write_private(temporary, value, uid=uid, gid=gid)
    if path.exists(): c.private_file(path, uid=uid)
    os.replace(temporary, path)


def rollback_private(path, value, uid=0, gid=0):
    # Do not delete a failed forward-transition .new file. Retain it for audit
    # and use a separate exact rollback temporary; unknown collisions fail shut.
    temporary = path.with_name(path.name + '.rollback-new')
    c.write_private(temporary, value, uid=uid, gid=gid)
    if path.exists(): c.private_file(path, uid=uid)
    os.replace(temporary, path)


def replace_site(value):
    public_site()
    temporary = SITE.with_name('morphiume.preview-new')
    c.write_private(temporary, value)
    temporary.chmod(0o644)
    os.replace(temporary, SITE)
    c.run(['nginx', '-t']); c.run(['systemctl', 'reload', 'nginx'])


def save_state(state):
    atomic_private(c.CONFIG / STATE_NAME, json.dumps(state, indent=2) + '\n')


def credentials(transaction):
    # Called only after accepted apply gates/writer stop/verified backup.
    # www-data must traverse this separate exact directory, NOT private CONFIG.
    import grp
    group = grp.getgrnam('www-data').gr_gid
    c.exact_path(AUTH_ROOT)
    if not AUTH_ROOT.exists(): AUTH_ROOT.mkdir(mode=0o750); os.chown(AUTH_ROOT, 0, group)
    metadata = AUTH_ROOT.stat()
    if not AUTH_ROOT.is_dir() or metadata.st_uid != 0 or metadata.st_gid != group or metadata.st_mode & 0o777 != 0o750:
        raise ValueError('Nginx hash directory must be exact root:www-data0750')
    username = 'preview-' + transaction.name.rsplit('-', 1)[1]
    password = secrets.token_hex(32)
    hashed = c.run(['openssl', 'passwd', '-6', '-stdin'], input_text=password + '\n')
    if not re.fullmatch(r'\$6\$[A-Za-z0-9./]+\$[A-Za-z0-9./]{86}', hashed): raise ValueError('Unexpected private password hash')
    filename = transaction.name.rsplit('-', 1)[1] + '.htpasswd'
    path = c.exact_path(AUTH_ROOT / filename)
    c.write_private(path, username + ':' + hashed + '\n', gid=group); path.chmod(0o640)
    c.write_private(transaction / 'preview-credentials.json', json.dumps({'username': username, 'password': password}) + '\n')
    return filename


def transaction_path(path):
    path = c.exact_path(Path(path))
    if path.parent != c.ROOT / 'metrics' or not re.fullmatch(r'preview-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}', path.name):
        raise ValueError('Unexpected preview snapshot transaction path')
    return c.private_directory(path)


def readiness(report):
    upgrade.validate_writers(upgrade.runtime_containers(), report)
    with urllib.request.urlopen('http://127.0.0.1:3001/api/health/ready', timeout=5) as response:
        if response.status != 200: raise ValueError('Private-profile DB readiness failed')


def lease_units(state):
    transaction = Path(state['transaction'])
    if not re.fullmatch(r'preview-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}', transaction.name): raise ValueError('Unexpected finite lease identity')
    name = 'morphiume-runtime-preview-' + transaction.name.rsplit('-', 1)[1]
    record = c.validate_profile(state['candidate'])
    command = ('/usr/bin/python3 ' + record['opsRoot'] + '/runtime/preview.py expire --source ' + record['sourceCommit'] +
               ' --config-id ' + record['testedPlatformConfig'] + ' --manifest-digest ' + record['candidateManifestDigest'] +
               ' --archive-sha256 ' + record['archiveSha256'] + ' --ops-sha256 ' + record['opsSha256'] + ' --apply')
    deadline = timestamp(state['acceptanceDeadlineUtc']).strftime('%Y-%m-%d %H:%M:%S UTC')
    service = '[Unit]\nDescription=Morphiume finite protected preview lease\n[Service]\nType=oneshot\nUser=root\nUMask=0077\nExecStart=' + command + '\nTimeoutStartSec=120\n'
    timer = '[Unit]\nDescription=Morphiume preview acceptance deadline\n[Timer]\nOnCalendar=' + deadline + '\nPersistent=true\nAccuracySec=1s\nUnit=' + name + '.service\n[Install]\nWantedBy=timers.target\n'
    return name, service, timer


def install_lease(state):
    transaction_path(state['transaction'])
    name, service, timer = lease_units(state)
    for suffix, contents in (('.service', service), ('.timer', timer)):
        path = c.exact_path(Path('/etc/systemd/system') / (name + suffix))
        # Exact fresh names only; no previous unit overwritten or cleaned.
        c.write_private(path, contents); path.chmod(0o644)
    c.run(['systemd-analyze', 'verify', '/etc/systemd/system/' + name + '.service', '/etc/systemd/system/' + name + '.timer'])
    c.run(['systemctl', 'daemon-reload']); c.run(['systemctl', 'enable', '--now', name + '.timer'])
    state['leaseUnit'] = name + '.timer'


def activate(args):
    report = c.verify_release(args)
    with c.lock():
        old = c.active_profile(required=True)
        partial = any((c.CONFIG / name).exists() for name in (STATE_NAME, STATE_NAME + '.new', 'upgrading.json', 'upgrading.json.new', 'deploy.candidate.env', 'active-profile.json.new'))
        validate_transition(old, report, args.previous_ops_sha256, args.previous_profile_sha256, partial)
        deployed = json.loads(c.private_file(c.CONFIG / 'deployed-release.json').read_text())
        previous_report = c.archived_image(old)
        c.match_mapping(old, previous_report); c.match_mapping(deployed, previous_report)
        if deployed.get('opsSha256') != old['opsSha256'] or deployed.get('accessProfileSha256') != c.canonical_hash(old): raise ValueError('Current deployed record/profile mismatch')
        configs = c.load_configs()
        baseline = evidence_file(args.baseline, args.baseline_sha256, 'baseline')
        restored = evidence_file(args.restore_evidence, args.restore_sha256, 'restore')
        inventory = validate_inventory(evidence_file(c.CONFIG / 'preview-inventory.json', args.inventory_sha256, 'inventory'))
        dispatch = evidence_file(c.CONFIG / 'preview-dispatch.json', args.dispatch_sha256, 'dispatch')
        validate_baselines(baseline, restored, report, old); validate_dispatch(dispatch, report, old, args.inventory_sha256)
        observe_inventory(inventory)
        c.db_container(); upgrade.validate_writers(upgrade.runtime_containers(), previous_report)
        if c.private_file(c.CONFIG / 'deploy.env').read_text() != c.compose_environment(c.runtime_image(previous_report), Path(old['opsRoot']), old):
            raise ValueError('Current Compose env/profile mismatch')
        next_configs = transition_configs(configs)
        next_ops = c.preserve_ops_bundle(report['sourceCommit'])
        candidate = c.make_profile(report, 'private-ip', next_configs)
        transaction = c.exact_path(c.ROOT / 'metrics' / (utc().strftime('preview-%Y%m%dT%H%M%SZ-') + secrets.token_hex(6)))
        transaction.mkdir(mode=0o700)
        snapshot_hashes = {}
        for name in SNAPSHOTS:
            value = c.private_file(c.CONFIG / name, uid=1001 if name in ('app.json', 'worker.json', 'migration.json') else 0).read_text()
            c.write_private(transaction / name, value); snapshot_hashes[name] = hashlib.sha256(value.encode()).hexdigest()
        site = SITE.read_text(); c.write_private(transaction / 'nginx-site.conf', site)
        snapshot_hashes['nginx-site.conf'] = hashlib.sha256(site.encode()).hexdigest()
        state = {'phase': 'prepared', 'transaction': str(transaction), 'previous': old, 'candidate': candidate,
                 'snapshotSha256': snapshot_hashes, 'startedUtc': utc().isoformat(), 'inventorySha256': args.inventory_sha256,
                 'dispatchSha256': args.dispatch_sha256, 'dataRollback': False, 'nativeAcceptance': 'pending'}
        c.write_private(c.CONFIG / STATE_NAME, json.dumps(state, indent=2) + '\n')
        old_command = c.compose(c.runtime_image(previous_report), ops_root=old['opsRoot'])
        command = c.compose(c.runtime_image(report), ops_root=next_ops)
        try:
            # No candidate may serve before the protected canonical selection.
            c.run(old_command + ['stop', '--timeout', '30', 'app', 'worker'], timeout=75)
            replace_site(maintenance_site()); state['phase'] = 'closed-writers-stopped'; save_state(state)
            result = backup.create_backup(previous_report)
            upgrade.verified_backup(result['directory'], previous_report)
            state['backupDirectory'] = result['directory']; state['phase'] = 'backup-verified'; save_state(state)
            filename = credentials(transaction)
            state['passwordFile'] = filename
            c.preserve_profile(candidate)
            # Selection is durable FIRST. A partial JSON write fails closed;
            # no writer can start with a mixed/missing profile.
            c.select_profile(candidate); state['phase'] = 'canonical-profile-selected'; save_state(state)
            for name, value in next_configs.items():
                atomic_private(c.CONFIG / name, json.dumps(value) + '\n', uid=1001, gid=1001)
            atomic_private(c.CONFIG / 'deploy.env', c.compose_environment(c.runtime_image(report), next_ops, candidate))
            c.load_configs()
            promoted = dict(deployed, opsSha256=report['opsSha256'], runtimeImageId=c.runtime_image(report), engineProofSha256=report['engineProofSha256'], accessProfileSha256=c.canonical_hash(candidate), nativePreviewAcceptance='pending')
            atomic_private(c.CONFIG / 'deployed-release.json', json.dumps(promoted, indent=2) + '\n')
            c.run(command + ['config', '--quiet'])
            c.run(command + ['up', '-d', '--force-recreate', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '120', 'app', 'worker'], timeout=150)
            readiness(report)
            state['acceptanceDeadlineUtc'] = (utc() + datetime.timedelta(minutes=20)).isoformat()
            state['phase'] = 'native-acceptance-pending'; save_state(state)
            # Persistent calendar lease survives reboot/missed deadlines.
            # It never follows a checkout or puts secrets in unit arguments.
            install_lease(state)
            replace_site(nginx_site(inventory, filename))
            state['nginxConfigSha256'] = hashlib.sha256(c.run(['nginx', '-T']).encode()).hexdigest()
            save_state(state)
            return {'mode': 'private-preview-ready-native-acceptance-pending', 'origin': candidate['origin'],
                    'accessProfileSha256': c.canonical_hash(candidate), 'credentialsFile': str(transaction / 'preview-credentials.json'), 'dataRollback': False}
        except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
            close_failed(state, command)
            raise ValueError('Preview failed; closed/stopped partial state requires explicit config-only rollback') from None


def close_failed(state, command):
    # Always attempt BOTH protection and writer stop; a failed reload cannot
    # leave the app reachable if writer stop succeeds. Never restore DB/state.
    errors = []
    try: replace_site(maintenance_site())
    except (OSError, ValueError, subprocess.SubprocessError): errors.append('proxy-close-failed')
    try: c.run(command + ['stop', '--timeout', '30', 'app', 'worker'], timeout=75)
    except (OSError, ValueError, subprocess.SubprocessError): errors.append('writer-stop-failed')
    state |= {'failedAfterPhase': state['phase'], 'phase': 'failed-closed-recovery-required', 'recoveryFailures': errors}
    try: save_state(state)
    except (OSError, ValueError): pass


def read_state(report):
    state = json.loads(c.private_file(c.CONFIG / STATE_NAME).read_text())
    c.validate_profile(state['candidate']); c.validate_profile(state['previous'])
    same_release(state['candidate'], report)
    c.match_mapping(state['candidate'], report)
    transaction_path(state['transaction'])
    if state.get('dataRollback') is not False: raise ValueError('Only config/proxy recovery is permitted')
    return state


def validate_native(value, state):
    c.match_mapping(value, state['candidate'])
    if value.get('origin') != c.ORIGINS['private-ip'] or value.get('accessProfileSha256') != c.canonical_hash(state['candidate']) or value.get('noUnexpectedBusinessMutation') is not True:
        raise ValueError('Actual native evidence must match this canonical preview/profile')
    accepted = timestamp(value.get('acceptedUtc'))
    if not timestamp(state['startedUtc']) <= accepted <= utc() <= timestamp(state['acceptanceDeadlineUtc']): raise ValueError('Finite preview acceptance window expired or evidence time is invalid')
    engines = value.get('engines')
    if not isinstance(engines, list) or len(engines) != 3 or {item.get('engine') for item in engines if isinstance(item, dict)} != {'chromium', 'firefox', 'webkit'}:
        raise ValueError('Actual three-engine preview acceptance is required')
    for item in engines:
        checks(item.get('checks'), NATIVE_CHECKS)
        if any(type(item.get(key)) is not int or item[key] != 0 for key in ('unexpected', 'skipped', 'testRetries')):
            raise ValueError('Skipped/flaky/unexpected preview acceptance cannot promote the profile')


def accept(args):
    report = c.verify_release(args)
    with c.lock():
        state = read_state(report)
        command = c.compose(c.runtime_image(report), ops_root=state['candidate']['opsRoot'])
        if state['phase'] != 'native-acceptance-pending': raise ValueError('Only pending actual preview can be accepted')
        try:
            value = evidence_file(args.acceptance, args.acceptance_sha256, 'acceptance'); validate_native(value, state)
            if c.active_profile(required=True) != state['candidate']: raise ValueError('Active preview changed before acceptance')
            c.load_configs(); readiness(report)
            if hashlib.sha256(c.run(['nginx', '-T']).encode()).hexdigest() != state['nginxConfigSha256']: raise ValueError('Protected proxy changed after preview')
            state |= {'phase': 'accepted', 'acceptedUtc': value['acceptedUtc'], 'nativeAcceptance': 'accepted', 'acceptanceSha256': args.acceptance_sha256}
            save_state(state)
            deployed = json.loads(c.private_file(c.CONFIG / 'deployed-release.json').read_text())
            c.match_mapping(deployed, report)
            atomic_private(c.CONFIG / 'deployed-release.json', json.dumps(deployed | {'nativePreviewAcceptance': 'accepted'}, indent=2) + '\n')
            c.write_private(transaction_path(state['transaction']) / 'transition-accepted.json', json.dumps(state, indent=2) + '\n')
            return {'mode': 'private-preview-accepted', 'origin': c.ORIGINS['private-ip'], 'dataRollback': False}
        except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
            close_failed(state, command)
            raise ValueError('Preview acceptance failed; preview withdrawn, no data rollback') from None


def rollback(args):
    report = c.verify_release(args)
    with c.lock():
        state = read_state(report)
        if state['phase'] == 'rolled-back': raise ValueError('Completed rollback is not replayable')
        if args.previous_ops_sha256 != state['previous']['opsSha256'] or args.previous_profile_sha256 != c.canonical_hash(state['previous']): raise ValueError('Explicit rollback profile identities differ')
        if c.active_profile(required=True) not in (state['previous'], state['candidate']):
            raise ValueError('Rollback cannot overwrite a subsequent release/access profile')
        same_release(json.loads(c.private_file(c.CONFIG / 'deployed-release.json').read_text()), report)
        transaction = transaction_path(state['transaction'])
        # Verify EVERY protected snapshot before any replacement/restart.
        saved = {}
        if set(state['snapshotSha256']) != set(SNAPSHOTS) | {'nginx-site.conf'}: raise ValueError('Incomplete rollback snapshot')
        for name, expected in state['snapshotSha256'].items():
            value = c.private_file(transaction / name).read_bytes()
            if hashlib.sha256(value).hexdigest() != expected: raise ValueError('Rollback snapshot changed')
            saved[name] = value.decode()
        if json.loads(saved['active-profile.json']) != {'profilePath': str(c.profile_path(state['previous'])), 'profileSha256': c.canonical_hash(state['previous'])}:
            raise ValueError('Rollback pointer differs from explicit previous profile')
        c.read_profile(c.profile_path(state['previous']), args.previous_profile_sha256)
        previous_report = c.archived_image(state['previous'])
        c.match_mapping(state['previous'], previous_report)
        # Snapshot site is retained for manual review; rollback uses CLOSED
        # site rather than inadvertently reviving an unprotected old route.
        command = c.compose(c.runtime_image(report), ops_root=state['candidate']['opsRoot'])
        try:
            replace_site(maintenance_site())
            c.run(command + ['stop', '--timeout', '30', 'app', 'worker'], timeout=75)
            state['phase'] = 'rollback-closed'; save_state(state)
            for name in SNAPSHOTS:
                rollback_private(c.CONFIG / name, saved[name], uid=1001 if name in ('app.json', 'worker.json', 'migration.json') else 0,
                               gid=1001 if name in ('app.json', 'worker.json', 'migration.json') else 0)
            c.load_configs()
            old = state['previous']
            old_command = c.compose(c.runtime_image(previous_report), ops_root=old['opsRoot'])
            c.run(old_command + ['config', '--quiet'])
            c.run(old_command + ['up', '-d', '--force-recreate', '--no-build', '--pull', 'never', '--wait', '--wait-timeout', '120', 'app', 'worker'], timeout=150)
            readiness(previous_report)
            state |= {'phase': 'rolled-back', 'completedUtc': utc().isoformat(), 'nativeRollbackAcceptance': 'pending'}; save_state(state)
            c.write_private(transaction / 'rollback-result.json', json.dumps(state, indent=2) + '\n')
            return {'mode': 'ssh-profile-restored-native-acceptance-pending', 'origin': c.ORIGINS['ssh-localhost'], 'previewClosed': True, 'dataRollback': False}
        except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
            close_failed(state, command)
            raise ValueError('Config-only rollback failed; preview closed/state retained') from None


def expire(args):
    # A protective lease never queries/migrates PG or follows a newer checkout.
    # It is bound to the exact frozen Ops source and current transition record.
    c.assert_boundaries()
    if c.ops_digest() != args.ops_sha256 or c.OPS_ROOT != c.bundle_path(args.source, args.ops_sha256):
        raise ValueError('Lease must execute the exact frozen candidate bundle')
    report = {'sourceCommit': args.source, 'testedPlatformConfig': args.config_id, 'candidateManifestDigest': args.manifest_digest,
              'archiveSha256': args.archive_sha256, 'opsSha256': args.ops_sha256}
    c.validate_identity(report)
    report = c.archived_image(report)
    with c.lock():
        state = read_state(report)
        if state['phase'] in ('accepted', 'rolled-back'):
            return {'mode': 'lease-completed-no-op', 'serverMutation': False}
        if state['phase'] != 'native-acceptance-pending':
            raise ValueError('Unexpected preview lease state; review protected state')
        if c.active_profile(required=True) != state['candidate']: raise ValueError('Lease cannot stop another active profile')
        command = c.compose(c.runtime_image(report), ops_root=state['candidate']['opsRoot'])
        close_failed(state, command)
        return {'mode': 'expired-preview-withdrawn', 'recoveryFailures': state['recoveryFailures'], 'dataRollback': False}


def main(args):
    if not args.apply:
        return {'mode': 'unexecuted-plan', 'action': args.action, 'targetOrigin': c.ORIGINS['private-ip'], 'serverMutation': False, 'credentialsGenerated': False, 'dataRollback': False}
    return {'activate': activate, 'accept': accept, 'rollback': rollback, 'expire': expire}[args.action](args)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('activate', 'accept', 'rollback', 'expire'))
    c.release_arguments(parser)
    parser.add_argument('--previous-ops-sha256'); parser.add_argument('--previous-profile-sha256')
    parser.add_argument('--baseline', type=Path); parser.add_argument('--baseline-sha256')
    parser.add_argument('--restore-evidence', type=Path); parser.add_argument('--restore-sha256')
    parser.add_argument('--inventory-sha256'); parser.add_argument('--dispatch-sha256')
    parser.add_argument('--acceptance', type=Path); parser.add_argument('--acceptance-sha256')
    args = parser.parse_args()
    try: print(json.dumps(main(args)))
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        print('Preview operation stopped. Preserve protected state; no financial/schema reset or automatic data rollback is attempted.')
        raise SystemExit(1) from None
