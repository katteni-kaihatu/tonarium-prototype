#!/usr/bin/env python3
"""Publish one independently built client/platform without replacing other assets."""
import argparse
import base64
import hashlib
import json
import os
import re
from pathlib import Path
import subprocess
import tempfile

NOTES = 'Electron nightlies are published independently for each platform.\n\nThis release belongs to one immutable source commit. Missing platforms have not completed successfully.\nEach *.build.json records the source commit, workflow run and checksums.\nElectron usage: docs/electron.md.\n'
COMPAT_NOTES = 'Compatibility update feed for Tonarium Electron.\n\nNew installers and archives are published in nightly-<full commit SHA> releases.\nOnly updater YAML and checksums are refreshed here. Existing legacy assets are retained.\nEach platform feed advances independently after its commit release upload succeeds.\n'

def gh(*args, check=True):
    return subprocess.run(['gh', *args], check=check, capture_output=True, text=True)


def electron_assets(directory, runtime):
    import yaml
    channel = 'nightly-linux.yml' if runtime == 'linux-x64' else 'nightly.yml'
    info = yaml.safe_load((directory / channel).read_text())
    version = info.get('version', '')
    if not re.fullmatch(r'\d+\.\d+\.\d+-nightly\.\d+\.\d+', version):
        raise RuntimeError('Invalid Electron nightly version')
    platform = 'linux' if runtime == 'linux-x64' else 'win'
    prefix = f'Tonarium-Electron-{version}-{platform}-'
    names = sorted(file.name for file in directory.iterdir() if file.name.startswith(prefix)
                   and file.name.endswith(('.AppImage', '.tar.gz', '.zip', '.exe', '.blockmap')))
    expected = ['.AppImage', '.tar.gz'] if platform == 'linux' else ['-setup.exe', '.zip']
    if not all(any(name.endswith(extension) for name in names) for extension in expected):
        raise RuntimeError('Missing Electron nightly archives')
    entries = info.get('files', [])
    if not entries:
        raise RuntimeError('Missing updater files')
    for entry in entries:
        name = entry.get('url')
        if name not in names:
            raise RuntimeError('Updater metadata references an unexpected artifact')
        with (directory / name).open('rb') as stream:
            digest = base64.b64encode(hashlib.file_digest(stream, 'sha512').digest()).decode()
        if entry.get('sha512') != digest:
            raise RuntimeError('Updater SHA-512 mismatch')
    installer_suffix = '.AppImage' if platform == 'linux' else '-setup.exe'
    if not any(entry['url'].endswith(installer_suffix) for entry in entries):
        raise RuntimeError('Missing updater installer reference')
    if info.get('path') and info['path'] not in [entry['url'] for entry in entries]:
        raise RuntimeError('Invalid updater legacy path')
    return names + [channel], channel


def publish(component, runtime, directory):
    directory = Path(directory).resolve()
    sha = os.environ['GITHUB_SHA']
    repo = os.environ['GH_REPO']
    if os.environ['GITHUB_REF'] != 'refs/heads/main':
        raise RuntimeError('Nightly publishing is restricted to main')

    def current():
        return gh('api', f'repos/{repo}/git/ref/heads/main', '--jq', '.object.sha').stdout.strip() == sha

    names, channel = electron_assets(directory, runtime)
    assets = []
    hashes = {}
    for name in names:
        file = directory / name
        if not file.is_file() or file.stat().st_size == 0:
            raise RuntimeError(f'Missing or empty build output: {name}')
        with file.open('rb') as stream:
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        checksum = directory / (name + '.sha256')
        if checksum.read_text().split() != [digest, name]:
            raise RuntimeError(f'Invalid checksum: {name}')
        hashes[name] = digest
        assets.extend([str(file), str(checksum)])

    if not re.fullmatch(r'[0-9a-f]{40}', sha):
        raise RuntimeError('Expected a full lowercase commit SHA')
    tag = f'nightly-{sha}'
    release_url = f'https://github.com/{repo}/releases/tag/{tag}'
    with tempfile.TemporaryDirectory(prefix='tonarium-nightly-') as temporary:
        temporary = Path(temporary)

        def ensure_release(name, body, title):
            notes = temporary / (name + '.notes.txt')
            notes.write_bytes(body.encode('utf-8'))
            if gh('release', 'view', name, check=False).returncode:
                created = gh('release', 'create', name, '--target', sha,
                             '--title', title, '--notes-file', str(notes),
                             '--prerelease', '--latest=false', check=False)
                if created.returncode:
                    gh('release', 'view', name)
            return notes

        ensure_release(tag, NOTES, f'Tonarium nightly {sha[:12]}')
        # タグは移動させず、既存タグと作成競合で別コミットに結び付いていないか確認する。
        actual = gh('api', f'repos/{repo}/commits/{tag}', '--jq', '.sha').stdout.strip()
        if actual != sha:
            raise RuntimeError('Commit release tag points to a different commit')
        channel_assets = []
        if channel:
            import yaml
            info = yaml.safe_load((directory / channel).read_text(encoding='utf-8'))
            base = f'https://github.com/{repo}/releases/download/{tag}/'
            for entry in info['files']:
                entry['url'] = base + entry['url']
            if info.get('path'):
                info['path'] = base + info['path']
            info['releaseUrl'] = release_url
            transformed = temporary / channel
            transformed.write_bytes(yaml.safe_dump(info, sort_keys=False).encode('utf-8'))
            digest = hashlib.sha256(transformed.read_bytes()).hexdigest()
            checksum = temporary / (channel + '.sha256')
            checksum.write_bytes(f'{digest}  {channel}\n'.encode('utf-8'))
            hashes[channel] = digest
            assets = [asset for asset in assets if Path(asset).name not in (channel, channel + '.sha256')]
            channel_assets = [str(transformed), str(checksum)]
        gh('release', 'upload', tag, *assets, '--clobber')
        if channel_assets:
            gh('release', 'upload', tag, *channel_assets, '--clobber')
        metadata = temporary / f'Tonarium-{component.capitalize()}-nightly-{runtime}.build.json'
        metadata.write_bytes((json.dumps({
            'channel': 'nightly', 'component': component, 'runtime': runtime,
            'commit': sha, 'run': os.environ['GITHUB_RUN_ID'],
            'runAttempt': os.environ.get('GITHUB_RUN_ATTEMPT', '1'),
            'runUrl': f'https://github.com/{repo}/actions/runs/{os.environ["GITHUB_RUN_ID"]}',
            'sha256': hashes,
        }, indent=2) + '\n').encode('utf-8'))
        gh('release', 'upload', tag, str(metadata), '--clobber')
        if channel_assets and current():
            notes = ensure_release('nightly', COMPAT_NOTES, 'Tonarium Electron update feed')
            if not current():
                print('Main changed while preparing compatibility feed; leaving it unchanged.')
                return
            gh('release', 'edit', 'nightly', '--title', 'Tonarium Electron update feed',
               '--notes-file', str(notes), '--prerelease', '--latest=false')
            gh('release', 'upload', 'nightly', *channel_assets, '--clobber')
    print(f'Published {component} {runtime} from {sha}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('component', choices=['electron'])
    parser.add_argument('runtime', choices=['linux-x64', 'win-x64'])
    parser.add_argument('directory')
    args = parser.parse_args()
    publish(args.component, args.runtime, args.directory)
