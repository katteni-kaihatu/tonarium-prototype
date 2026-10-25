"""Offline release safety checks; never access GitHub or upload real assets."""
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('publish_nightly', Path(__file__).with_name('publish-nightly.py'))
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)
SHA = 'a' * 40
ENV = {'GITHUB_SHA': SHA, 'GH_REPO': 'example/tonarium', 'GITHUB_REF': 'refs/heads/main',
       'GITHUB_RUN_ID': '123', 'GITHUB_RUN_ATTEMPT': '2'}
NAMES = {
    ('electron', 'linux-x64'): ['Tonarium-Electron-0.0.9-nightly.12.1-linux-x64.tar.gz',
                                'Tonarium-Electron-0.0.9-nightly.12.1-linux-x86_64.AppImage'],
    ('electron', 'win-x64'): ['Tonarium-Electron-0.0.9-nightly.12.1-win-x64.zip', 'Tonarium-Electron-0.0.9-nightly.12.1-win-x64-setup.exe', 'Tonarium-Electron-0.0.9-nightly.12.1-win-x64-setup.exe.blockmap'],
}


class FakeGitHub:
    def __init__(self, *, exists=True, create_fails=False, competitor=False,
                 currents=None, upload_fails=False, tag_fails=False):
        self.exists = exists
        self.releases = set()
        self.create_fails = create_fails
        self.competitor = competitor
        self.currents = list(currents or [SHA])
        self.upload_fails = upload_fails
        self.tag_fails = tag_fails
        self.calls = []
        self.records = []
        self.uploaded = {}

    def __call__(self, *args, check=True):
        self.calls.append(args)
        code, stdout = 0, ''
        if args[:2] == ('api', 'repos/example/tonarium/git/ref/heads/main'):
            stdout = self.currents.pop(0) if len(self.currents) > 1 else self.currents[0]
        elif args[:2] == ('release', 'view'):
            code = 0 if self.exists or args[2] in self.releases else 1
        elif args[:2] == ('release', 'create'):
            # Creation must not upload any archive or checksum.
            assert not any(arg.endswith(('.zip', '.tar.gz', '.AppImage', '.sha256')) for arg in args)
            notes = Path(args[args.index('--notes-file') + 1]).read_text()
            assert ('immutable source commit' in notes if args[2] != 'nightly' else 'Compatibility update feed' in notes)
            code = int(self.create_fails)
            if not self.create_fails or self.competitor:
                self.releases.add(args[2])
        elif args[:2] == ('api', f'repos/example/tonarium/commits/nightly-{SHA}'):
            stdout = 'b' * 40 if self.tag_fails else SHA
        elif 'PATCH' in args:
            raise AssertionError('Tags must never be moved')
        elif args[:2] == ('release', 'upload'):
            paths = [Path(arg) for arg in args[3:] if not arg.startswith('--')]
            assert all(path.is_file() for path in paths)
            self.uploaded.update(((args[2], path.name), path.read_bytes()) for path in paths)
            if any(path.name.endswith('.build.json') for path in paths):
                self.records.extend((path.name, json.loads(path.read_text())) for path in paths)
            else:
                code = int(self.upload_fails)
        result = subprocess.CompletedProcess(args, code, stdout, 'simulated API error' if code else '')
        if code and check:
            raise subprocess.CalledProcessError(code, args, output=stdout, stderr=result.stderr)
        return result

    def uploads(self):
        return [args for args in self.calls if args[:2] == ('release', 'upload')]


class PublishTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.environment = patch.dict(os.environ, ENV)
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def files(self, component='electron', runtime='linux-x64'):
        hashes = {}
        for name in NAMES[component, runtime]:
            content = ('test archive ' + name).encode()
            (self.directory / name).write_bytes(content)
            digest = hashlib.sha256(content).hexdigest()
            (self.directory / (name + '.sha256')).write_text(f'{digest}  {name}\n')
            hashes[name] = digest
        if component == 'electron':
            installer = next(name for name in hashes if name.endswith(('.AppImage', '.exe')))
            metadata = {
                'version': '0.0.9-nightly.12.1', 'path': installer,
                'files': [{'url': installer, 'sha512': base64.b64encode(hashlib.sha512((self.directory / installer).read_bytes()).digest()).decode()}],
            }
            channel = 'nightly-linux.yml' if runtime == 'linux-x64' else 'nightly.yml'
            content = json.dumps(metadata).encode()
            (self.directory / channel).write_bytes(content)
            digest = hashlib.sha256(content).hexdigest()
            (self.directory / (channel + '.sha256')).write_text(f'{digest}  {channel}\n')
            hashes[channel] = digest
        return hashes

    def publish(self, fake, component='electron', runtime='linux-x64'):
        with patch.object(publisher, 'gh', fake):
            publisher.publish(component, runtime, self.directory)

    def test_existing_release_and_metadata_for_both_platforms(self):
        uploaded_names = set()
        for component, runtime in NAMES:
            with self.subTest(component=component, runtime=runtime):
                hashes = self.files(component, runtime)
                fake = FakeGitHub()
                self.publish(fake, component, runtime)
                self.assertEqual(len(fake.uploads()), 4)
                self.assertFalse(any(args[:2] == ('release', 'create') for args in fake.calls))
                name, record = fake.records[0]
                if component == 'electron':
                    channel = 'nightly-linux.yml' if runtime == 'linux-x64' else 'nightly.yml'
                    hashes[channel] = hashlib.sha256(fake.uploaded['nightly', channel]).hexdigest()
                self.assertEqual(name, f'Tonarium-{component.capitalize()}-nightly-{runtime}.build.json')
                self.assertEqual(record, {
                    'channel': 'nightly', 'component': component, 'runtime': runtime,
                    'commit': SHA, 'run': '123', 'runAttempt': '2',
                    'runUrl': 'https://github.com/example/tonarium/actions/runs/123', 'sha256': hashes,
                })
                names = {Path(arg).name for args in fake.uploads() for arg in args[3:] if arg != '--clobber'}
                expected = set(hashes) | {item + '.sha256' for item in hashes} | {name}
                self.assertEqual(names, expected)
                self.assertFalse(uploaded_names & names)
                uploaded_names.update(names)
                self.assertFalse(any('delete' in args for args in fake.calls))

    def test_initial_release_creation(self):
        self.files()
        fake = FakeGitHub(exists=False)
        self.publish(fake)
        self.assertEqual(len(fake.records), 1)
        self.assertEqual(sum(args[:2] == ('release', 'create') for args in fake.calls), 2)

    def test_electron_feed_uploaded_only_after_installers(self):
        self.files('electron', 'win-x64')
        fake = FakeGitHub()
        self.publish(fake, 'electron', 'win-x64')
        self.assertTrue(any(arg.endswith('-setup.exe') for arg in fake.uploads()[0]))
        self.assertFalse(any(arg.endswith('.yml') for arg in fake.uploads()[0]))
        self.assertTrue(any(arg.endswith('nightly.yml') for arg in fake.uploads()[1]))

    def test_electron_invalid_sha512_rejected_before_upload(self):
        self.files('electron', 'linux-x64')
        name = NAMES['electron', 'linux-x64'][1]
        (self.directory / name).write_bytes(b'changed artifact')
        fake = FakeGitHub()
        with self.assertRaisesRegex(RuntimeError, 'SHA-512'):
            self.publish(fake, 'electron', 'linux-x64')
        self.assertFalse(fake.uploads())

    def test_failed_installer_upload_leaves_feed_unchanged(self):
        self.files('electron', 'linux-x64')
        fake = FakeGitHub(upload_fails=True)
        with self.assertRaises(subprocess.CalledProcessError):
            self.publish(fake, 'electron', 'linux-x64')
        self.assertEqual(len(fake.uploads()), 1)
        self.assertFalse(any(arg.endswith('.yml') for arg in fake.uploads()[0]))

    def test_creation_race_accepts_other_successful_creator(self):
        self.files()
        fake = FakeGitHub(exists=False, create_fails=True, competitor=True)
        self.publish(fake)
        self.assertEqual(len(fake.records), 1)

    def test_real_creation_failure_is_not_swallowed(self):
        self.files()
        fake = FakeGitHub(exists=False, create_fails=True)
        with self.assertRaises(subprocess.CalledProcessError):
            self.publish(fake)
        self.assertFalse(fake.uploads())

    def test_obsolete_build_keeps_commit_assets_without_alias_mutations(self):
        self.files('electron', 'linux-x64')
        fake = FakeGitHub(currents=['b' * 40])
        self.publish(fake, 'electron', 'linux-x64')
        self.assertEqual(len(fake.uploads()), 3)
        self.assertTrue(all(call[2] == f'nightly-{SHA}' for call in fake.uploads()))
        self.assertFalse(any(call[:3] in [('release', 'view', 'nightly'), ('release', 'edit', 'nightly')] for call in fake.calls))

    def test_main_changes_while_preparing_compatibility_release(self):
        self.files('electron', 'linux-x64')
        fake = FakeGitHub(currents=[SHA, 'b' * 40])
        self.publish(fake, 'electron', 'linux-x64')
        self.assertEqual(len(fake.uploads()), 3)
        self.assertTrue(all(call[2] == f'nightly-{SHA}' for call in fake.uploads()))

    def test_invalid_checksum_prevents_release_mutations(self):
        self.files()
        next(self.directory.glob('*.sha256')).write_text('incorrect checksum\n')
        fake = FakeGitHub()
        with self.assertRaisesRegex(RuntimeError, 'Invalid checksum'):
            self.publish(fake)
        self.assertEqual(len(fake.calls), 0)

    def test_upload_failure_preserves_previous_completion_record(self):
        self.files()
        fake = FakeGitHub(upload_fails=True)
        with self.assertRaises(subprocess.CalledProcessError):
            self.publish(fake)
        self.assertEqual(len(fake.uploads()), 1)
        self.assertFalse(fake.records)

    def test_mismatched_existing_tag_is_rejected(self):
        self.files()
        fake = FakeGitHub(tag_fails=True)
        with self.assertRaisesRegex(RuntimeError, 'different commit'):
            self.publish(fake)
        self.assertFalse(fake.uploads())

    def test_compatibility_feed_has_absolute_urls_and_exact_checksums(self):
        import yaml
        for runtime in ['linux-x64', 'win-x64']:
            self.files('electron', runtime)
            fake = FakeGitHub()
            self.publish(fake, 'electron', runtime)
            channel = 'nightly-linux.yml' if runtime == 'linux-x64' else 'nightly.yml'
            raw = fake.uploaded['nightly', channel]
            info = yaml.safe_load(raw)
            self.assertEqual(info['releaseUrl'], f'https://github.com/example/tonarium/releases/tag/nightly-{SHA}')
            self.assertTrue(info['path'].startswith(f'https://github.com/example/tonarium/releases/download/nightly-{SHA}/'))
            self.assertEqual(info['path'], info['files'][0]['url'])
            self.assertEqual(raw, fake.uploaded[f'nightly-{SHA}', channel])
            self.assertEqual(fake.uploaded['nightly', channel + '.sha256'].decode().split(), [hashlib.sha256(raw).hexdigest(), channel])
            self.assertEqual({name for tag, name in fake.uploaded if tag == 'nightly'}, {channel, channel + '.sha256'})

    def test_both_release_creation_races_accept_matching_competitors(self):
        self.files('electron', 'linux-x64')
        fake = FakeGitHub(exists=False, create_fails=True, competitor=True)
        self.publish(fake, 'electron', 'linux-x64')
        self.assertEqual({call[2] for call in fake.calls if call[:2] == ('release', 'create')}, {f'nightly-{SHA}', 'nightly'})
        self.assertEqual(len(fake.uploads()), 4)

    def test_commit_completion_record_failure_cannot_advance_alias(self):
        self.files('electron', 'linux-x64')
        fake = FakeGitHub()
        def reject_record(*args, **kwargs):
            if args[:2] == ('release', 'upload') and any(arg.endswith('.build.json') for arg in args):
                raise subprocess.CalledProcessError(1, args)
            return fake(*args, **kwargs)
        with patch.object(publisher, 'gh', reject_record):
            with self.assertRaises(subprocess.CalledProcessError):
                publisher.publish('electron', 'linux-x64', self.directory)
        self.assertTrue(all(call[2] != 'nightly' for call in fake.calls if call[0] == 'release'))

    def test_original_local_metadata_is_not_rewritten(self):
        self.files('electron', 'win-x64')
        previous = (self.directory / 'nightly.yml').read_bytes()
        self.publish(FakeGitHub(), 'electron', 'win-x64')
        self.assertEqual((self.directory / 'nightly.yml').read_bytes(), previous)

    def test_non_main_ref_is_rejected(self):
        with patch.dict(os.environ, {'GITHUB_REF': 'refs/heads/feature'}):
            with self.assertRaisesRegex(RuntimeError, 'restricted to main'):
                self.publish(FakeGitHub())


class WorkflowTests(unittest.TestCase):
    def test_electron_uses_platform_runners_for_installers(self):
        workflow = self.workflow('electron-nightly.yml')
        electron = workflow['jobs']['electron']
        self.assertEqual(electron['runs-on'], '${{ matrix.os }}')
        runners = {entry['runtime']: entry['os'] for entry in electron['strategy']['matrix']['include']}
        self.assertEqual(runners, {'linux-x64': 'ubuntu-24.04', 'win-x64': 'windows-2025'})


    def workflow(self, name):
        try:
            import yaml
        except ImportError:
            self.skipTest('Workflow checks require PyYAML')
        return yaml.load((ROOT / '.github/workflows' / name).read_text(), Loader=yaml.BaseLoader)

    def test_both_builds_are_independent_with_distinct_writer_locks(self):
        try:
            import yaml
        except ImportError:
            self.skipTest('Optional local workflow structure check requires PyYAML')
        workflow = yaml.load((ROOT / '.github/workflows/electron-nightly.yml').read_text(), Loader=yaml.BaseLoader)
        self.assertNotIn('concurrency', workflow)
        jobs = workflow['jobs']
        self.assertEqual(set(jobs), {'electron'})
        combinations, locks, artifacts = set(), set(), set()
        for component, job in jobs.items():
            if component not in {'electron'}:
                continue
            self.assertNotIn('needs', job)
            self.assertEqual(job['strategy']['fail-fast'], 'false')
            self.assertEqual(job['concurrency']['cancel-in-progress'], 'false')
            self.assertEqual(job['permissions']['contents'], 'write')
            self.assertIn('publish-nightly.py ' + component, job['steps'][-1]['run'])
            artifact = next(step['with']['name'] for step in job['steps'] if 'upload-artifact@' in step.get('uses', ''))
            for entry in job['strategy']['matrix']['include']:
                runtime = entry['runtime']
                combinations.add((component, runtime))
                locks.add(job['concurrency']['group'].replace('${{ matrix.runtime }}', runtime))
                artifacts.add(artifact.replace('${{ matrix.runtime }}', runtime))
        self.assertEqual(combinations, set(NAMES))
        self.assertEqual(len(locks), 2)
        self.assertEqual(len(artifacts), 2)


if __name__ == '__main__':
    unittest.main()
