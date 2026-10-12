"""Preserve only the three audited ops files before an authorized fast-forward."""
import argparse
import hashlib
import json
import re
import subprocess
import uuid
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('commit')
parser.add_argument('--apply', action='store_true')
args = parser.parse_args()
if not re.fullmatch(r'[a-f0-9]{40}', args.commit):
    raise SystemExit('Provide the exact verified source commit.')
repo = Path('/opt/morphiume')
approved = {
    'deploy/staging/prepare.sh': '181afa537d12cc455bd55a56df9f0895e82e2434d597ef320860b758b4c09dfa',
    'deploy/staging/initdb.sh': '1b13f4f69306bb9843fca0a6e1ed6a2ff3d5e0c0630cbdd0daf06d358340bc7c',
    'deploy/staging/compose.db.yaml': 'fcb08d5bbdaf04fdc5909e46fa5403a781f1618114115f54e3480fd46f88bcec',
}

def git(*arguments):
    return subprocess.check_output(['git','-C',str(repo),*arguments])

subprocess.run(['git','-C',str(repo),'merge-base','--is-ancestor','HEAD',args.commit], check=True)
if git('diff','--name-only') or git('diff','--cached','--name-only'):
    raise SystemExit('Tracked server checkout changes require review.')
untracked = set(git('ls-files','--others','--exclude-standard').decode().splitlines())
if untracked - set(approved):
    raise SystemExit('Unknown untracked server work must be preserved/reviewed separately.')
manifest = {'targetCommit': args.commit, 'files': {}}
for relative in sorted(untracked):
    source = repo/relative
    if source.is_symlink() or not source.is_file() or not source.resolve().is_relative_to(repo):
        raise SystemExit('Unexpected staging file type/path.')
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    if digest != approved[relative]:
        raise SystemExit('Audited staging file changed; stop for review.')
    published = git('show',f'{args.commit}:{relative}')
    manifest['files'][relative] = {'auditedSha256':digest,'publishedSha256':hashlib.sha256(published).hexdigest()}
print(json.dumps(manifest))
if args.apply:
    handoff = Path('/srv/morphiume/staging/checkout-handoff')/uuid.uuid4().hex
    handoff.mkdir(parents=True,mode=0o700)
    for relative in sorted(untracked):
        destination = handoff/relative
        destination.parent.mkdir(parents=True,mode=0o700,exist_ok=True)
        (repo/relative).rename(destination)
    (handoff/'manifest.json').write_text(json.dumps(manifest,indent=2))
    subprocess.run(['git','-C',str(repo),'merge','--ff-only',args.commit],check=True)
    if git('rev-parse','HEAD').decode().strip() != args.commit:
        raise SystemExit('Fast-forward did not reach the verified source commit.')
    print(f'Audited originals retained under {handoff}; verified checkout ready.')
