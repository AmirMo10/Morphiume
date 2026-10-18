#!/usr/bin/env python3
"""Versioned private-preview image/access transition; plan is the default.

No SSH, image pull/build, seed, migration, schema reset or old-restore restart.
The reviewed private request and self hash are explicit external trust inputs.
Frozen Ops68 and the previously accepted tools are verified before import.
"""
import argparse
import ast
import datetime
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys
import types
import urllib.request

ROOT = Path('/srv/morphiume/staging/runtime')
CONFIG = Path('/etc/morphiume-staging-runtime')
SITE = Path('/etc/nginx/sites-available/morphiume')
OPS = '68bc527a9c34ccefef72bb4427288da47c75c3a584e7cb140ecfc3c3fbdad6a3'
PREVIOUS = {
    'sourceCommit': '7feb4fe8e8254e917c53f9654b315ee7ef3fada1',
    'testedPlatformConfig': 'sha256:7fd5086681dbfe2fc7690eafc308a18e7f1a8f8e081262ccc8a909f8bb5cbaab',
    'candidateManifestDigest': 'sha256:6db2e24e987fdf76e427f55ad574fcee1dedf6b52408b28a5f317a894f4dfde5',
    'archiveSha256': 'ef221159cc6b65483e8f0beac855f2c34a0455010e4488af4161b43983158971',
    'opsSha256': OPS,
    'runtimeImageId': 'sha256:f7723802ca524cb16c63988f08220ef14c32f2be136aeaa73f7bbc8720df09df',
    'engineProofSha256': '0cea9d9123eb41f0f43b7646bc2cfec87fe56d2b710694f189051cf69fcd8e7c',
}
PREVIOUS_PROFILE = '89a1a439774490e966830bbd82f7cbbd412a7f58627c0c054a58ad30432f71d7'
OLD_INVENTORY = 'c18bfd192caa3026dc27e942dfbe0ce294a51063b79ed8d2fd255c07712b2d10'
FOURTH_ACCEPTANCE = '8c7b52128a723d7b27f419ca0485a42a63dc24459696f1ac0551dd7d7af45993'
LEGACY = {'redesign-isolated-restore.py': 'a1afdc162db1e809ad092373a5d35d36a5c6a56c9ba31f84fdea435c5db38e61',
          'redesign-preserved-upgrade.py': 'e7056b62396fd931ed117c62c8d5f3b7eea00c0fd7daedb6ee88c43422419069',
          'remove-basic.py':'bc17faf3973b968d1daa572a385b1c7bb7ffe29430dbfe79c14e3ffa8bea13a1'}
BASIC_EVIDENCE = ROOT/'metrics/private-preview-basic-d708ca74-6d0b-45a3-a925-65a36ef53b4d/03-reloaded.json'
BASIC_EVIDENCE_SHA = 'e6c78fe3b7d1ed02ececf919885b6400e9ab64ffa510c682776dcafffc1b468e'
OPS_FILES = ('verify-release.py', 'runtime/contract.py', 'runtime/prepare.py', 'runtime/deploy.py',
    'runtime/backup.py', 'runtime/compose.yaml', 'runtime/db-target.mjs', 'runtime/restore.py',
    'runtime/compose.restore.yaml', 'runtime/restore-init.sh', 'runtime/health.py',
    'runtime/monitor.py', 'runtime/scheduled.py', 'runtime/upgrade.py', 'runtime/preview.py',
    'runtime/operator-config.mjs', 'runtime/engine_image.py',
    'runtime/systemd/morphiume-runtime-backup.service', 'runtime/systemd/morphiume-runtime-backup.timer',
    'runtime/systemd/morphiume-runtime-health.service', 'runtime/systemd/morphiume-runtime-health.timer')
CONFIG_FILES = ('app.json', 'worker.json', 'migration.json', 'db_owner_password', 'db_app_password', 'backup-recipients.txt')
UNITS = tuple('morphiume-runtime-' + action + '.' + kind for action in ('health', 'backup') for kind in ('timer', 'service'))
CAPABILITY = ROOT / 'media/.private-preview-access/config.json'
STATE = CONFIG / 'private-preview-transition.json'
CHECKS = {'nativeLogin', 'ownedOrder', 'paymentReceiptDedup', 'stockReservation', 'shipmentTracking', 'mediaHashes'}
REVIEW_CHECKS = {'basicNotRequired', 'adminLoginNotRequired', 'serverOnlyReviewAuthority', 'csrf',
    'permissions', 'productCreateUi', 'productPublishUi', 'checkoutCreated', 'mockPaymentVerified',
    'inventorySingleCommit', 'callbackReplayStable', 'shipmentTracking', 'foreignOrderDenied',
    'mediaHashes', 'perimeter', 'ownerUnchanged', 'reviewRejectedOutsidePrivateStaging'}
HASH = re.compile('[a-f0-9]{64}')
UUID = re.compile('[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}')


def need(value, code='private_preview_guard_rejected'):
    if not value: raise ValueError(code)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def encode(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n').encode()


def parse(raw):
    def pairs(values):
        result = {}
        for key, value in values:
            need(key not in result, 'duplicate_json_key'); result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=pairs, parse_constant=lambda _: need(False, 'nonfinite_json'))


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def exact(path):
    path = Path(path)
    need(path.is_absolute() and path.resolve() == path and not any(p.is_symlink() for p in (path, *path.parents)), 'unexpected_path')
    return path


def metadata(path, uid=0, mode=0o600, directory=False):
    path = exact(path); info = path.lstat()
    need(info.st_uid == info.st_gid == uid and stat.S_IMODE(info.st_mode) == mode, 'file_owner_or_mode')
    need(stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode) and info.st_nlink == 1 and info.st_size <= 16*1024**2, 'file_type_or_links')
    return path


def raw(path, expected=None, uid=0, mode=0o600):
    value = metadata(path, uid, mode).read_bytes()
    if expected is not None: need(isinstance(expected, str) and HASH.fullmatch(expected) and sha(value) == expected, 'raw_file_hash')
    return value


def sync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try: os.fsync(fd)
    finally: os.close(fd)


def write_new(path, value, mode=0o600):
    path = exact(path); metadata(path.parent, mode=0o700, directory=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    try:
        os.fchmod(fd, mode)
        with os.fdopen(fd, 'wb', closefd=False) as output:
            output.write(value); output.flush(); os.fsync(output.fileno())
    finally: os.close(fd)
    sync_directory(path.parent)


def replace_private(path, value):
    metadata(path); temporary = path.with_name(path.name + '.new')
    write_new(temporary, value); os.replace(temporary, path); sync_directory(path.parent)


def file_view(path, uid=0, mode=0o600, directory=False):
    path = metadata(path, uid, mode, directory); info = path.lstat()
    value = {'path':str(path), 'uid':info.st_uid, 'gid':info.st_gid, 'mode':oct(stat.S_IMODE(info.st_mode)),
             'device':info.st_dev, 'inode':info.st_ino}
    if not directory: value |= {'bytes':info.st_size, 'sha256':sha(path.read_bytes())}
    return value


def protected_code_parent(parent):
    metadata(parent,mode=0o700,directory=True)
    for path in parent.parents:
        info=path.lstat()
        need(stat.S_ISDIR(info.st_mode) and info.st_uid==0 and not stat.S_IMODE(info.st_mode)&0o022,'writable_code_ancestor')


def validate_request(value):
    keys = {'formatVersion', 'mode', 'operationId', 'candidate', 'candidateProfileSha256', 'capabilitySha256',
            'oldInventory', 'fourthAcceptance', 'baselineSha256', 'nativeEvidence', 'restoreEvidence', 'sharedDatabaseWindowReleased'}
    need(type(value) is dict and set(value) == keys and type(value['formatVersion']) is int and value['formatVersion'] == 1)
    need(value['mode'] == 'private-preview-image-only-transition' and value['sharedDatabaseWindowReleased'] is True)
    need(isinstance(value['operationId'], str) and UUID.fullmatch(value['operationId']))
    candidate = value['candidate']
    need(type(candidate) is dict and set(candidate) == set(PREVIOUS) and candidate['opsSha256'] == OPS)
    need(isinstance(candidate['sourceCommit'], str) and re.fullmatch('[a-f0-9]{40}', candidate['sourceCommit']) and candidate['sourceCommit'] != PREVIOUS['sourceCommit'])
    for key in ('testedPlatformConfig', 'candidateManifestDigest', 'runtimeImageId'):
        need(isinstance(candidate[key], str) and re.fullmatch('sha256:[a-f0-9]{64}', candidate[key]))
    need(candidate['testedPlatformConfig'] != PREVIOUS['testedPlatformConfig'] and candidate['runtimeImageId'] != PREVIOUS['runtimeImageId'])
    for key in ('archiveSha256', 'engineProofSha256'): need(isinstance(candidate[key], str) and HASH.fullmatch(candidate[key]))
    for key in ('candidateProfileSha256', 'capabilitySha256'):
        need(value[key] is None or isinstance(value[key], str) and HASH.fullmatch(value[key]))
    need(value['baselineSha256'] is None or isinstance(value['baselineSha256'], str) and HASH.fullmatch(value['baselineSha256']))
    for key, expected in (('oldInventory', OLD_INVENTORY), ('fourthAcceptance', FOURTH_ACCEPTANCE)):
        ref = value[key]; need(type(ref) is dict and set(ref) == {'path', 'sha256'} and ref['sha256'] == expected)
        path = PurePosixPath(ref['path']); need(path.is_absolute() and path.is_relative_to(PurePosixPath(ROOT.as_posix())) and '..' not in path.parts)
        need(path.name == ('old-restore-inventory.json' if key == 'oldInventory' else 'recovery-accepted.json'))
    need(PurePosixPath(value['oldInventory']['path']) == PurePosixPath(ROOT.as_posix())/'preservation/c7d9bd5c-46b4-4709-bff6-9d0f5c0531f3/old-restore-inventory.json')
    for key in ('nativeEvidence', 'restoreEvidence'):
        ref = value[key]; need(type(ref) is dict and set(ref) == {'path','sha256'})
        need(ref['sha256'] is None or isinstance(ref['sha256'], str) and HASH.fullmatch(ref['sha256']))
        if key == 'restoreEvidence' and ref['path'] is None:
            need(ref['sha256'] is None); continue
        path = PurePosixPath(ref['path']); need(path.is_absolute() and '..' not in path.parts)
        if key == 'nativeEvidence': need(path == PurePosixPath(CONFIG.as_posix())/('private-preview-native-'+candidate['sourceCommit']+'.json'))
        else: need(path.parent.parent == PurePosixPath(ROOT.as_posix())/'restore' and path.name == 'recovery-accepted.json' and re.fullmatch(r'morphiume-runtime-restore-[0-9]{8}t[0-9]{6}z-[a-f0-9]{6}', path.parent.name))
    return value


def load_request(args):
    need(os.name == 'posix' and os.getuid() == 0 and HASH.fullmatch(args.self_sha256 or '') and HASH.fullmatch(args.request_sha256 or ''))
    request = validate_request(parse(raw(args.request, args.request_sha256)))
    path = Path(__file__); parent = ROOT/'releases'/request['candidate']['sourceCommit']/'tools'/args.self_sha256
    protected_code_parent(parent)
    need(path == parent/'private-preview-control.py' and sha(raw(path, mode=0o644)) == args.self_sha256, 'self_source_binding')
    sys.dont_write_bytecode = True
    return request, parent


def import_frozen(request, parent, verify_archives=True):
    modules = {}
    for name, digest in LEGACY.items():
        path = parent/name; body = raw(path, digest, mode=0o644)
        module = types.ModuleType('private_preview_'+name.replace('-', '_')); module.__file__ = str(path)
        exec(compile(body, str(path), 'exec'), module.__dict__); modules[name] = module
    g = modules['redesign-isolated-restore.py']; preservation = modules['redesign-preserved-upgrade.py']
    preservation.validate_restore_storage_policy(g); preservation.validate_restore_acceptance_policy(g)
    bundle = ROOT/'releases'/request['candidate']['sourceCommit']/'ops-bundles'/OPS/'ops'
    metadata(bundle, mode=0o700, directory=True); g.verify_ops(bundle)
    sources = {name:raw(bundle/name, mode=0o644).replace(b'\r\n', b'\n') for name in OPS_FILES}
    need(sha(json.dumps({n:sha(v) for n,v in sources.items()},sort_keys=True,separators=(',',':')).encode()) == OPS)
    for name in ('contract','backup','health','restore'):
        need(name not in sys.modules, 'unexpected_module_cache')
        path = bundle/'runtime'/(name+'.py'); module = types.ModuleType(name); module.__file__ = str(path)
        sys.modules[name] = module; exec(compile(sources['runtime/'+name+'.py'],str(path),'exec'),module.__dict__); modules[name] = module
    c = modules['contract']; need(c.ops_digest() == OPS)
    if verify_archives:
        for identity in (PREVIOUS, request['candidate']): c.match_mapping(identity,c.archived_image(identity))
    # Only these byte-verified pure template functions are needed from preview.py.
    tree = ast.parse(sources['runtime/preview.py']); names = {'maintenance_site'}
    functions = [n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names]
    need({n.name for n in functions} == names)
    mapping = next(n.value for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='UPGRADE_MAP' for t in n.targets))
    templates = {'re':re,'AUTH_ROOT':Path('/etc/nginx/morphiume-staging-preview'),'UPGRADE_MAP':ast.literal_eval(mapping)}
    exec(compile(ast.Module(functions,type_ignores=[]),'frozen-preview-templates','exec'),templates)
    templates['reviewed_change'] = modules['remove-basic.py'].reviewed_change
    return c, modules['backup'], modules['health'], g, preservation, templates


def capability(request):
    metadata(CAPABILITY.parent, uid=1001, mode=0o700, directory=True)
    need(0 < CAPABILITY.stat().st_size <= 4096)
    return file_view(CAPABILITY, uid=1001) | {'sha256':sha(raw(CAPABILITY,request['capabilitySha256'],uid=1001))}


def all_restore_items(c):
    ids = c.run(['docker','ps','--all','--no-trunc','--filter','label=morphiume.restore.scope=runtime','--format','{{.ID}}']).splitlines()
    need(len(set(ids)) == len(ids) and all(HASH.fullmatch(i) for i in ids))
    values = parse(c.run(['docker','inspect',*ids])) if ids else []
    need({i['Id'] for i in values} == set(ids)); return values


def fourth_storage(root):
    # Actual read-only 2026-10-18 capture5d069c9b: creation0750 was reduced by umask077.
    # This is a separate accepted pair; never generalize or chmod the prior three.
    return [file_view(root/'postgres',999,0o700,True),file_view(root/'media',1001,0o700,True)]


def fourth_pair(c,g,request,items):
    ref = request['fourthAcceptance']; accepted_raw = raw(ref['path'],FOURTH_ACCEPTANCE); a = parse(accepted_raw)
    c.match_mapping(a,PREVIOUS); need(a['accessProfileSha256'] == PREVIOUS_PROFILE)
    need(a['mode'] == 'native-business-restore-accepted' and a['workerStarted'] is False and a['suiteRetry'] == 0)
    need(type(a['checks']) is dict and set(a['checks']) == CHECKS and all(v is True for v in a['checks'].values()))
    root = Path(a['restoreRoot']); project = a['restoreProject']
    need(root == Path(ref['path']).parent and root.parent == ROOT/'restore' and root.name == project)
    need(re.fullmatch(r'morphiume-runtime-restore-[0-9]{8}t[0-9]{6}z-[a-f0-9]{6}',project))
    metadata(root,mode=0o700,directory=True)
    files = {'app.json':1001,'restore.env':0,'db_bootstrap_password':999,'db_owner_password':999,'db_app_password':999,
        'recovery-start.json':0,'recovery-journal.json':0,'recovery-ready.json':0,'recovery-accepted.json':0,'business-acceptance-result.json':0}
    need({p.name for p in root.iterdir()} == set(files)|{'postgres','media'})
    file_views = {name:file_view(root/name,uid=uid) for name,uid in files.items()}
    links = {'app.json':'restoreConfigRawSha256','recovery-start.json':'restoreStartSha256',
             'recovery-journal.json':'restoreJournalSha256','recovery-ready.json':'restoreReadySha256',
             'business-acceptance-result.json':'rawResultSha256'}
    for name,key in links.items(): need(file_views[name]['sha256'] == a[key])
    app = parse(raw(root/'app.json',uid=1001)); need(c.canonical_hash(app) == a['restoreConfigCanonicalSha256'] == a['restoreConfigSha256'])
    need(a['readyRecordSha256'] == a['restoreReadySha256'] and a['journalSha256'] == a['restoreJournalSha256'])
    ready = parse(raw(root/'recovery-ready.json')); journal = parse(raw(root/'recovery-journal.json'))
    need(journal['phase']=='ready' and journal['workerStarted'] is False and journal['automaticResume'] is False and journal['businessAcceptance']=='pending')
    c.match_mapping(journal['release'],PREVIOUS)
    for record in (ready,journal):
        need(record['project']==project and record['root']==str(root) and record['workerStarted'] is False)
        need(record['toolSha256']==LEGACY['redesign-isolated-restore.py'] and record['toolSourceCommit']=='404132f330625f91d4a06a97d86031b53540d4a9')
    need(journal['readyRecordSha256']==a['restoreReadySha256'] and journal['oldInventorySha256']==OLD_INVENTORY)
    for name,expected in journal['configSha256'].items(): need(name in files and file_views[name]['sha256']==expected)
    g.exact_history(journal['restoredHistory'])
    need(a['oldPairJournalDigest'] == c.canonical_hash(journal['oldPairBefore']))
    selected = [i for i in items if i['Config']['Labels'].get('com.docker.compose.project')==project]
    need(len(selected)==2)
    views = sorted([g.container_view(i) for i in selected],key=lambda i:i['service']); by = {i['service']:i for i in views}
    need(set(by)=={'app','db'} and by['app']['imageId']==PREVIOUS['runtimeImageId'] and by['app']['sourceCommit']==PREVIOUS['sourceCommit'])
    need(by['app']['user']=='1001:1001' and by['db']['user']=='999:999')
    need(next(i for i in selected if i['Id']==by['db']['id'])['Config']['Image']==c.PG_IMAGE)
    for row in views:
        need(row['state']['Status']=='exited' and row['state']['Running'] is False and row['state']['Paused'] is False and row['state']['Restarting'] is False)
        need(row['state']['ExitCode'] in ((0,143) if row['service']=='app' else (0,)))
        need(row['networks']==sorted([project+'_restore']+([project+'_edge'] if row['service']=='app' else [])))
        need(row['portBindings']==({'3000/tcp':[{'HostIp':'127.0.0.1','HostPort':'3002'}]} if row['service']=='app' else {}))
        destination,storage = ('/app/media','media') if row['service']=='app' else ('/var/lib/postgresql','postgres')
        need(any(m['Type']=='bind' and m['Source']==str(root/storage) and m['Destination']==destination and m['RW'] is True for m in row['mounts']))
        for mount in row['mounts']:
            if mount['Type']=='bind': need(Path(mount['Source']).is_relative_to(root) or Path(mount['Source']).is_relative_to(ROOT/'releases'/PREVIOUS['sourceCommit']))
    need(all(i['State'].get('OOMKilled') is False for i in selected))
    return {'project':project,'root':file_view(root,mode=0o700,directory=True), 'files':file_views,'containers':views,
        'storage':fourth_storage(root),
        'media':g.media_snapshot(c,None,root/'media')}


def four_pairs(c,g,request,extra_project=None):
    old = parse(raw(request['oldInventory']['path'],OLD_INVENTORY)); g.inventories_shape(old)
    items = all_restore_items(c); need(len(items)==(10 if extra_project else 8))
    # Preserve every original validator; only the versioned aggregate count is new.
    original = sorted([row for record in old['pairs'] for row in g.old_pair(c,record,items)],key=lambda i:i['id'])
    fourth = fourth_pair(c,g,request,items)
    ids = {i['id'] for i in original+fourth['containers']}; need(len(ids)==8)
    extras = [i for i in items if i['Id'] not in ids]
    need(not extras if extra_project is None else len(extras)==2 and all(i['Config']['Labels'].get('com.docker.compose.project')==extra_project for i in extras))
    need(not c.run(['ss','-H','-ltn','sport = :3002']))
    return {'originalThree':original,'fourth':fourth}


def manager(c,unit):
    keys = ('Id','LoadState','ActiveState','UnitFileState','DropInPaths','FragmentPath')
    if unit.endswith('.service'): keys += ('Result','ExecMainStatus','InvocationID')
    value = dict(line.split('=',1) for line in c.run(['systemctl','show',unit,'--property='+','.join(keys)]).splitlines())
    need(set(value)==set(keys) and value['Id']==unit and value['LoadState']=='loaded')
    return value


def schedule_files():
    paths=[]
    for unit in UNITS:
        path=Path('/etc/systemd/system')/unit; paths.append(path)
        directory=path.with_name(path.name+'.d')
        if directory.exists():
            metadata(directory,mode=0o700,directory=True)
            for child in directory.iterdir(): need(child.name.endswith('.conf')); paths.append(child)
    return {str(p):file_view(p,mode=0o644) for p in sorted(paths)}


def site_versions(templates):
    evidence=parse(raw(BASIC_EVIDENCE,BASIC_EVIDENCE_SHA))
    need(evidence['mode']=='private-preview-basic-removed-client-acceptance-pending' and evidence['nginxReloadExitCode']==0)
    need(evidence['authorizedClientCidrs']==['192.168.240.46/32'] and evidence['ipv6Policy']=='deny-all')
    previous=raw(BASIC_EVIDENCE.parent/'before-site.conf',evidence['beforeSiteSha256'])
    reviewed,authfile=templates['reviewed_change'](previous)
    need(raw(BASIC_EVIDENCE.parent/'after-site.conf',evidence['afterSiteSha256'])==reviewed)
    need(raw(SITE,mode=0o644)==reviewed)
    need(sha(subprocess.run(['nginx','-T'],check=True,capture_output=True,timeout=30).stdout)==evidence['afterNginxConfigSha256'])
    enabled=Path('/etc/nginx/sites-enabled/morphiume')
    need(enabled.is_symlink() and enabled.resolve()==SITE and enabled.lstat().st_uid==0)
    import grp
    info=exact(authfile).lstat(); parent=exact(authfile.parent).lstat(); group=grp.getgrnam('www-data').gr_gid
    need(info.st_uid==parent.st_uid==0 and info.st_gid==parent.st_gid==group and stat.S_IMODE(info.st_mode)==0o640 and stat.S_IMODE(parent.st_mode)==0o750)
    need(stat.S_ISREG(info.st_mode) and info.st_nlink==1 and stat.S_ISDIR(parent.st_mode))
    need({'sha256':sha(authfile.read_bytes()),'device':info.st_dev,'inode':info.st_ino,'mtimeNs':info.st_mtime_ns,'bytes':info.st_size}==evidence['authfilePreserved'])
    # Default unknown-Host/IPv6 404 stays byte-identical during maintenance too.
    closed=reviewed.replace(b'  proxy_pass http://127.0.0.1:3001;',b'  return 503;')
    need(closed!=reviewed and b'proxy_pass' not in closed)
    return reviewed,reviewed,closed,authfile


def config_files():
    return {name:file_view(CONFIG/name,1001 if name.endswith('.json') else 0) for name in CONFIG_FILES}


def writers(c):
    ids=c.run(['docker','ps','--all','--no-trunc','--filter','label=com.docker.compose.project='+c.PROJECT,'--format','{{.ID}}']).splitlines()
    return parse(c.run(['docker','inspect',*ids])) if ids else []


def ready():
    with urllib.request.urlopen('http://127.0.0.1:3001/api/health/ready',timeout=8) as response: need(response.status==200)


def observe(c,g,preservation,templates,request):
    c.assert_boundaries(); c.db_container(); configs=c.load_configs()
    need(c.run(['git','-C','/opt/morphiume','rev-parse','HEAD'])==request['candidate']['sourceCommit'] and not c.run(['git','-C','/opt/morphiume','status','--porcelain']),'candidate_prepare_checkout_not_ready')
    profile=c.active_profile(required=True); c.match_mapping(profile,PREVIOUS)
    need(c.canonical_hash(profile)==PREVIOUS_PROFILE)
    deployed=parse(raw(CONFIG/'deployed-release.json')); c.match_mapping(deployed,PREVIOUS)
    need(deployed['accessProfileSha256']==PREVIOUS_PROFILE and deployed.get('nativeFixtureAcceptance')=='accepted')
    old_bundle=c.resolve_ops_bundle(PREVIOUS['sourceCommit'],OPS)
    need(raw(CONFIG/'deploy.env').decode()==c.compose_environment(PREVIOUS['runtimeImageId'],old_bundle,profile))
    c.validate_app_containers(writers(c),PREVIOUS); ready()
    need(not STATE.exists() and not STATE.is_symlink(),'existing_review_transition_requires_recovery')
    for name in ('upgrading.json','deploy.candidate.env','deployed-release.json.new','active-profile.json.new'): need(not (CONFIG/name).exists())
    old_journal=parse(raw(CONFIG/'redesign-upgrade.json')); need(old_journal['phase']=='committed')
    next_profile=c.make_profile(request['candidate'],'private-ip',configs)
    if request['candidateProfileSha256'] is not None: need(c.canonical_hash(next_profile)==request['candidateProfileSha256'])
    need(request['capabilitySha256'] is None and not CAPABILITY.exists() and not CAPABILITY.parent.exists(),'unexpected_preexisting_review_capability')
    old_site,new_site,closed_site,authfile=site_versions(templates)
    states={unit:manager(c,unit) for unit in UNITS}
    for unit,value in states.items():
        need(value['ActiveState']=='inactive' and value['UnitFileState']=='enabled' if unit.endswith('.timer') else value['ActiveState']=='inactive' and value['Result']=='success' and value['ExecMainStatus']=='0')
    baseline={'previous':PREVIOUS,'previousProfile':PREVIOUS_PROFILE,'candidate':request['candidate'],
        'candidateProfile':c.canonical_hash(next_profile),'configFiles':config_files(),'capabilityAbsent':True,
        'deploymentFiles':{name:file_view(CONFIG/name) for name in ('deployed-release.json','active-profile.json','deploy.env','redesign-upgrade.json','schedule-approved.json','schedule-dispatch.lock')},
        'site':file_view(SITE,mode=0o644),'authfile':{'sha256':sha(authfile.read_bytes()),'uid':authfile.stat().st_uid,'gid':authfile.stat().st_gid,'mode':oct(stat.S_IMODE(authfile.stat().st_mode))},
        'scheduleFiles':schedule_files(),'releaseLock':file_view(ROOT.parent/'deploy.lock'),'units':states,'fourPairs':four_pairs(c,g,request),
        'media':g.media_snapshot(c,None,ROOT/'media')}
    # Candidate schema probe is networkless, no config/DB mount or credentials.
    return baseline,(profile,next_profile,old_bundle,old_site,new_site,closed_site)


def prior_ops_unchanged(baseline):
    need(file_view(CONFIG/'redesign-upgrade.json')==baseline['deploymentFiles']['redesign-upgrade.json'])
    for name in ('schedule-approved.json','schedule-dispatch.lock'):
        need(file_view(CONFIG/name)==baseline['deploymentFiles'][name])
    need(schedule_files()==baseline['scheduleFiles'] and file_view(ROOT.parent/'deploy.lock')==baseline['releaseLock'])


def journal(state,phase):
    state['phase']=phase; state['stages'].append({'phase':phase,'utc':utc()})
    body=encode(state)
    if STATE.exists(): replace_private(STATE,body)
    else: write_new(STATE,body)
    snapshot=Path(state['evidenceRoot'])/(str(len(state['stages'])).zfill(2)+'-'+phase+'.json')
    write_new(snapshot,body)


def change_site(c,value):
    metadata(SITE,mode=0o644); temporary=SITE.with_name(SITE.name+'.private-preview-new')
    # Nginx site parent is public root755 rather than the private evidence parent.
    exact(temporary); need(not temporary.exists() and not temporary.is_symlink())
    fd=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o644)
    try:
        os.fchmod(fd,0o644)
        with os.fdopen(fd,'wb',closefd=False) as output: output.write(value); output.flush(); os.fsync(output.fileno())
    finally: os.close(fd)
    os.replace(temporary,SITE); sync_directory(SITE.parent)
    c.run(['nginx','-t']); c.run(['systemctl','reload','nginx'])


def backup_verified(c,backup,identity):
    result=backup.create_backup(identity); directory=Path(result['directory'])
    need(directory.parent==ROOT/'backups' and re.fullmatch(r'[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}',directory.name))
    body=raw(directory/'backup-manifest.json'); manifest=parse(body); c.match_mapping(manifest,identity)
    need(set(manifest['ciphertextSha256'])=={'database.dump.age','media.tar.gz.age'})
    for name,digest in manifest['ciphertextSha256'].items():
        with metadata(directory/name).open('rb') as stream: need(hashlib.file_digest(stream,'sha256').hexdigest()==digest)
    return {'directory':str(directory),'manifestSha256':sha(body),'ciphertextSha256':manifest['ciphertextSha256']}


def existing_auth(c,preservation):
    """Digest all pre-existing identities/credentials; no raw values leave SQL."""
    user_ids='SELECT id FROM public."user" WHERE email <> \'private-preview@morphiume.invalid\''
    predicates={name:'t.user_id IN ('+user_ids+')' for name in ('account','role_membership','session','two_factor')}
    predicates['user']='t.email <> \'private-preview@morphiume.invalid\''
    predicates['admin_grant']='t.session_id IN (SELECT s.id FROM public.session s WHERE s.user_id IN ('+user_ids+'))'
    result={}
    for table,predicate in predicates.items():
        query="SELECT jsonb_build_object('count',count(*),'sha256',encode(sha256(convert_to(coalesce(string_agg(h,'' ORDER BY h),''),'UTF8')),'hex')) FROM (SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS h FROM public.\""+table+'" t WHERE '+predicate+' LIMIT 100001) bounded'
        value=preservation.sql(c,query)
        need(type(value) is dict and set(value)=={'count','sha256'} and type(value['count']) is int and 0<=value['count']<=100000 and HASH.fullmatch(value['sha256']))
        result[table]=value
    return result


def compare_operator_delta(before,after):
    permitted={'user','account','role_membership','session','two_factor','verification','auth_rate_limit','admin_grant'}
    need(set(before)==set(after)=={'identity','history','rows','catalog','sequences'})
    need(all(before[key]==after[key] for key in ('identity','history','catalog','sequences')))
    need(set(before['rows'])==set(after['rows']) and len(before['rows'])==53)
    need(all(before['rows'][key]==after['rows'][key] for key in before['rows'] if key not in permitted),'unexpected_non_auth_operator_delta')
    for table in ('user','account','role_membership','two_factor'):
        need(after['rows'][table]['count']==before['rows'][table]['count']+1,'unexpected_preview_principal_count')
    return {'permittedAuthTables':sorted(permitted),'allOtherTablesUnchanged':True,
            'intendedSyntheticOperatorCreated':True,'migrationOrRoleDefinitionChange':False}


def operator(c,command,action):
    need(action in ('enable','disable','status'))
    args=command+['exec','-T','app','node','/app/deploy/staging/runtime.mjs','node','--conditions=react-server','/app/runtime/private-preview-operator.mjs',action]
    return parse(c.run(args,timeout=90))


def swap(c,backup,g,preservation,templates,request,request_sha256):
    baseline,context=observe(c,g,preservation,templates,request)
    need(request['baselineSha256'] is not None and sha(encode(baseline))==request['baselineSha256'],'current_baseline_changed')
    need(request['candidateProfileSha256'] is not None)
    profile,next_profile,old_bundle,old_site,new_site,closed_site=context
    evidence=ROOT/'metrics'/('private-preview-transition-'+request['operationId'])
    need(not evidence.exists()); evidence.mkdir(mode=0o700); metadata(evidence,mode=0o700,directory=True)
    state={'formatVersion':1,'mode':'private-preview-image-only-transition','operationId':request['operationId'],
        'evidenceRoot':str(evidence),'previous':PREVIOUS,'candidate':request['candidate'],'requestSha256':request_sha256,
        'previousProfileSha256':PREVIOUS_PROFILE,'candidateProfileSha256':request['candidateProfileSha256'],
        'baselineSha256':request['baselineSha256'],'stages':[],'automaticRollback':False,'migrationInvoked':False,'seedInvoked':False}
    for name in ('deployed-release.json','active-profile.json','deploy.env'): write_new(evidence/name,raw(CONFIG/name))
    write_new(evidence/'previous-site.conf',old_site); write_new(evidence/'new-site.conf',new_site); write_new(evidence/'baseline.json',encode(baseline))
    journal(state,'prepared-after-root-candidate-load')
    try:
        need(all(manager(c,u)['ActiveState']=='inactive' for u in UNITS))
        change_site(c,closed_site); journal(state,'site-closed')
        with c.lock():
            preservation.candidate_migrations(c,{'candidate':request['candidate'],'migrationManifestSha256':g.MIGRATIONS_SHA256})
            old_command=c.compose(PREVIOUS['runtimeImageId'],ops_root=old_bundle)
            next_command=c.compose(request['candidate']['runtimeImageId'],env_file=CONFIG/'deploy.candidate.env',ops_root=c.OPS_ROOT)
            c.run(old_command+['config','--quiet']); c.preserve_profile(next_profile)
            write_new(CONFIG/'deploy.candidate.env',c.compose_environment(request['candidate']['runtimeImageId'],c.OPS_ROOT,next_profile).encode())
            c.run(next_command+['config','--quiet']); journal(state,'before-writer-stop')
            c.run(old_command+['stop','--timeout','30','app','worker'],timeout=75)
            c.validate_app_containers(writers(c),PREVIOUS,running=False); journal(state,'writers-stopped')
            state['preUpgradeBackup']=backup_verified(c,backup,PREVIOUS); journal(state,'fresh-backup-verified')
            before=preservation.capture_database(c,g); write_new(evidence/'database-before.json',encode(before))
            c.select_profile(next_profile); journal(state,'candidate-profile-selected')
            c.run(next_command+['up','-d','--no-build','--pull','never','--wait','--wait-timeout','180','app','worker'],timeout=210)
            c.validate_app_containers(writers(c),request['candidate']); ready()
            after=preservation.capture_database(c,g); preservation.compare_database(before,after)
            write_new(evidence/'database-after.json',encode(after))
            need(config_files()==baseline['configFiles'] and not CAPABILITY.exists())
            need(four_pairs(c,g,request)==baseline['fourPairs'] and g.media_snapshot(c,None,ROOT/'media')==baseline['media'])
            prior_ops_unchanged(baseline)
            auth_before=existing_auth(c,preservation)
            deployed=request['candidate']|{'project':c.PROJECT,'database':c.DATABASE,'accessProfileSha256':request['candidateProfileSha256'],
                'deployedUtc':utc(),'previousSourceCommit':PREVIOUS['sourceCommit'],'preMigrationBackup':state['preUpgradeBackup']['directory'],
                'privatePreviewAcceptance':'pending','migrationInvoked':False,'seedInvoked':False}
            replace_private(CONFIG/'deployed-release.json',encode(deployed))
            metadata(CONFIG/'deploy.env'); os.replace(CONFIG/'deploy.candidate.env',CONFIG/'deploy.env'); sync_directory(CONFIG)
            journal(state,'image-ready-data-preserved')
            new_command=c.compose(request['candidate']['runtimeImageId'],ops_root=c.OPS_ROOT)
            journal(state,'before-review-operator-enable')
            result=operator(c,new_command,'enable')
            need(result=={'enabled':True,'sharedPreviewOperator':True,'nativeSessionVerified':True,'ownerUnchanged':True})
            state['capability']=capability(request)
            enabled_after=preservation.capture_database(c,g)
            state['operatorDelta']=compare_operator_delta(after,enabled_after)
            need(existing_auth(c,preservation)==auth_before,'preexisting_identity_changed')
            write_new(evidence/'database-after-operator.json',encode(enabled_after))
            need(g.media_snapshot(c,None,ROOT/'media')==baseline['media']|{'.private-preview-access/config.json':{'sha256':state['capability']['sha256'],'bytes':state['capability']['bytes']}})
            need(four_pairs(c,g,request)==baseline['fourPairs'] and config_files()==baseline['configFiles'])
            prior_ops_unchanged(baseline)
            journal(state,'review-authority-enabled')
            change_site(c,new_site); ready(); journal(state,'review-preview-native-acceptance-pending')
        return {'mode':state['phase'],'sourceCommit':request['candidate']['sourceCommit'],'profileSha256':request['candidateProfileSha256'],
            'operationId':request['operationId'],'journalSha256':sha(raw(STATE)),'oldRestorePairsPreserved':4,'timersResumed':False}
    except Exception:
        state['failedAfterPhase']=state.get('phase')
        journal(state,'failed-preserved'); raise


def validate_native(value,request,cap_sha):
    need(type(value) is dict and value.get('mode')=='private-preview-native-accepted')
    need(all(value.get(k)==v for k,v in request['candidate'].items()))
    need(value.get('accessProfileSha256')==request['candidateProfileSha256'] and value.get('capabilitySha256')==cap_sha)
    need(value.get('origin')=='http://192.168.240.51' and value.get('clientCidrs')==['192.168.240.46/32'])
    need(type(value.get('checks')) is dict and set(value['checks'])==REVIEW_CHECKS and all(v is True for v in value['checks'].values()))
    need(type(value.get('commandExitCode')) is int and value['commandExitCode']==0 and type(value.get('invocationCount')) is int and value['invocationCount']==1 and value.get('automaticRetry') is False)
    accepted=datetime.datetime.fromisoformat(value['acceptedUtc'].replace('Z','+00:00'))
    need(accepted.tzinfo is not None and accepted.utcoffset()==datetime.timedelta(0) and accepted<=datetime.datetime.now(datetime.timezone.utc))
    return value


def accepted_state(request,expected_sha):
    need(isinstance(expected_sha,str) and HASH.fullmatch(expected_sha))
    state=parse(raw(STATE,expected_sha))
    need(state['operationId']==request['operationId'] and state['candidate']==request['candidate'] and state['candidateProfileSha256']==request['candidateProfileSha256'])
    need(state['evidenceRoot']==str(ROOT/'metrics'/('private-preview-transition-'+request['operationId'])))
    return state


def accept_native(c,g,request,expected_state_sha):
    state=accepted_state(request,expected_state_sha)
    need(state['phase']=='review-preview-native-acceptance-pending')
    native=parse(raw(request['nativeEvidence']['path'],request['nativeEvidence']['sha256']))
    validate_native(native,request,state['capability']['sha256'])
    with c.lock():
        c.assert_boundaries(); c.load_configs(); c.db_container(); profile=c.active_profile(required=True)
        c.match_mapping(profile,request['candidate']); need(c.canonical_hash(profile)==request['candidateProfileSha256'])
        deployed=parse(raw(CONFIG/'deployed-release.json')); c.match_mapping(deployed,request['candidate'])
        need(datetime.datetime.fromisoformat(deployed['deployedUtc'])<=datetime.datetime.fromisoformat(native['acceptedUtc'].replace('Z','+00:00')))
        need(deployed.get('privatePreviewAcceptance')=='pending' and capability(request)==state['capability'])
        c.validate_app_containers(writers(c),request['candidate']); ready()
        baseline=parse(raw(Path(state['evidenceRoot'])/'baseline.json',state['baselineSha256']))
        need(four_pairs(c,g,request)==baseline['fourPairs'] and config_files()==baseline['configFiles'])
        need(raw(SITE,mode=0o644)==raw(Path(state['evidenceRoot'])/'new-site.conf'))
        need(all(manager(c,u)['ActiveState']=='inactive' for u in UNITS))
        deployed|={'privatePreviewAcceptance':'accepted','privatePreviewNativeEvidenceSha256':request['nativeEvidence']['sha256'],
                   'privatePreviewCapabilitySha256':state['capability']['sha256']}
        replace_private(CONFIG/'deployed-release.json',encode(deployed))
        state['nativeEvidence']=request['nativeEvidence']; journal(state,'native-accepted-recovery-schedule-pending')
        return {'mode':state['phase'],'journalSha256':sha(raw(STATE)),'sourceCommit':request['candidate']['sourceCommit'],
                'nativeEvidenceSha256':request['nativeEvidence']['sha256'],'timersResumed':False}


def rollback(c,g,templates,request,expected_state_sha):
    state=accepted_state(request,expected_state_sha)
    need(state['phase'] in ('review-preview-native-acceptance-pending','native-accepted-recovery-schedule-pending','failed-preserved'))
    need(any(s['phase']=='image-ready-data-preserved' for s in state['stages']))
    evidence=Path(state['evidenceRoot']); baseline=parse(raw(evidence/'baseline.json',state['baselineSha256']))
    need(all(manager(c,u)['ActiveState']=='inactive' for u in UNITS))
    need(config_files()==baseline['configFiles'] and four_pairs(c,g,request)==baseline['fourPairs'])
    current_site=raw(SITE,mode=0o644); new_site=raw(evidence/'new-site.conf')
    closed=new_site.replace(b'  proxy_pass http://127.0.0.1:3001;',b'  return 503;')
    need(current_site in (new_site,closed))
    with c.lock():
        deployed=parse(raw(CONFIG/'deployed-release.json')); c.match_mapping(deployed,request['candidate'])
        c.validate_app_containers(writers(c),request['candidate'])
        journal(state,'explicit-rollback-before-close'); change_site(c,closed)
        command=c.compose(request['candidate']['runtimeImageId'],ops_root=c.OPS_ROOT)
        if CAPABILITY.exists():
            need(operator(c,command,'status')=={'enabled':True})
            need(operator(c,command,'disable')=={'enabled':False,'previewSessionsRevoked':True})
        need(not CAPABILITY.exists(),'review_capability_still_active')
        journal(state,'explicit-rollback-review-authority-disabled')
        c.run(command+['stop','--timeout','30','app','worker'],timeout=75)
        c.validate_app_containers(writers(c),request['candidate'],running=False)
        previous_profile=c.read_profile(parse(raw(evidence/'active-profile.json'))['profilePath'],PREVIOUS_PROFILE)
        c.match_mapping(previous_profile,PREVIOUS); c.select_profile(previous_profile)
        replace_private(CONFIG/'deploy.env',raw(evidence/'deploy.env'))
        replace_private(CONFIG/'deployed-release.json',raw(evidence/'deployed-release.json'))
        old_command=c.compose(PREVIOUS['runtimeImageId'],ops_root=Path(previous_profile['opsRoot']))
        c.run(old_command+['up','-d','--no-build','--pull','never','--wait','--wait-timeout','180','app','worker'],timeout=210)
        c.validate_app_containers(writers(c),PREVIOUS); ready()
        need(four_pairs(c,g,request)==baseline['fourPairs'] and config_files()==baseline['configFiles'])
        change_site(c,raw(evidence/'previous-site.conf')); ready()
        journal(state,'explicit-rollback-image-restored-timers-paused')
        return {'mode':state['phase'],'dataRollback':False,'oldRestorePairsPreserved':4,'timersResumed':False,
            'reviewAuthorityDisabled':True,'journalSha256':sha(raw(STATE))}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=('plan','observe','swap','accept-native','rollback'),nargs='?',default='plan')
    parser.add_argument('--request'); parser.add_argument('--request-sha256'); parser.add_argument('--self-sha256'); parser.add_argument('--apply',action='store_true'); parser.add_argument('--expected-state-sha256')
    args=parser.parse_args()
    if args.action=='plan' or args.action in ('swap','accept-native','rollback') and not args.apply:
        return {'mode':'unexecuted-private-preview-plan','serverMutation':False,'oldRestorePairs':4,'migrationInvoked':False,'seedInvoked':False}
    need(not args.apply if args.action=='observe' else args.apply)
    request,parent=load_request(args); c,backup,health,g,preservation,templates=import_frozen(request,parent)
    if args.action=='observe':
        baseline,_=observe(c,g,preservation,templates,request)
        return {'mode':'read-only-private-preview-preflight','baseline':baseline,'baselineSha256':sha(encode(baseline)),
            'candidateSqlProbeInvoked':False,'serverMutation':False}
    if args.action=='swap': return swap(c,backup,g,preservation,templates,request,args.request_sha256)
    if args.action=='accept-native': return accept_native(c,g,request,args.expected_state_sha256)
    return rollback(c,g,templates,request,args.expected_state_sha256)


if __name__=='__main__':
    try: print(json.dumps(main()))
    except Exception as error:
        frames=[]; cursor=error.__traceback__
        while cursor is not None:
            frames.append({'file':Path(cursor.tb_frame.f_code.co_filename).name,'function':cursor.tb_frame.f_code.co_name,'line':cursor.tb_lineno})
            cursor=cursor.tb_next
        print(json.dumps({'mode':'private-preview-gated-or-failed','privateStatePreserved':True,'automaticRetry':False,'automaticRollback':False,
            'failureType':type(error).__name__,'failureFrames':frames[-3:]}))
        raise SystemExit(1) from None
