import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import backup


class Body(io.BytesIO):
    def iter_chunks(self, chunk_size):
        while block := self.read(chunk_size):
            yield block


class MemoryS3:
    def __init__(self, corrupt=False):
        self.objects = {}
        self.corrupt = corrupt

    def upload_file(self, filename, bucket, key, **_kwargs):
        self.objects[key] = Path(filename).read_bytes()

    def get_object(self, *, Bucket, Key):
        data = self.objects[Key]
        return {'Body': Body(data + b'corrupt' if self.corrupt else data)}

    def put_object(self, *, Bucket, Key, Body, **_kwargs):
        self.objects[Key] = Body


class ConfigurationTests(unittest.TestCase):
    def test_source_credentials_are_decoded_and_never_inherit_pg_overrides(self):
        with patch.dict(os.environ, {'PGHOST': 'wrong', 'PGOPTIONS': 'wrong', 'BACKUP_PGSSLMODE': 'require'}):
            env = backup.database_env('postgresql://user:p%40ss@db.example:5433/railway')
        self.assertEqual(env['PGPASSWORD'], 'p@ss')
        self.assertEqual(env['PGHOST'], 'db.example')
        self.assertEqual(env['PGOPTIONS'], '-c default_transaction_read_only=on')
        self.assertNotIn('BACKUP_DATABASE_URL', env)

    def test_unencrypted_source_or_storage_is_rejected(self):
        with patch.dict(os.environ, {'BACKUP_PGSSLMODE': 'disable'}):
            with self.assertRaises(backup.BackupError):
                backup.database_env('postgresql://user:secret@db.example/db')
        for url in ('http://r2.example', 'https://user:secret@r2.example', 'https://r2.example?token=secret'):
            with self.assertRaises(backup.BackupError):
                backup.https_url(url, 'endpoint')

    def test_corrupted_upload_has_no_success_manifest(self):
        s3 = MemoryS3(corrupt=True)
        with tempfile.TemporaryDirectory() as folder:
            encrypted = Path(folder) / 'dump.age'
            encrypted.write_bytes(b'encrypted-data')
            with self.assertRaises(backup.BackupError):
                backup.publish(s3, 'bucket', 'production/run', encrypted, {})
        self.assertFalse(any(key.endswith('manifest.json') for key in s3.objects))

    def test_failure_logs_do_not_expose_sdk_secrets_and_notify_monitor(self):
        with patch.dict(os.environ, {'BACKUP_HEALTHCHECK_URL': 'https://hc-ping.com/test'}), \
             patch('backup.backup', side_effect=RuntimeError('postgresql://secret')), \
             patch('backup.ping') as ping, patch('backup.log') as log:
            self.assertEqual(backup.main(), 1)
        self.assertNotIn('postgresql://secret', str(log.call_args_list))
        ping.assert_any_call('https://hc-ping.com/test', '/fail')

    def test_missing_start_ping_does_not_prevent_backup(self):
        with patch.dict(os.environ, {'BACKUP_HEALTHCHECK_URL': 'https://hc-ping.com/test'}), \
             patch('backup.backup') as perform, \
             patch('backup.ping', side_effect=[backup.BackupError('offline'), None]), \
             patch('backup.log'):
            self.assertEqual(backup.main(), 0)
        perform.assert_called_once()


class RoundTripTests(unittest.TestCase):
    """Actual PostgreSQL 18 dump/restore + age encrypt/decrypt, without production data."""

    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='backup-test-')
        cls.folder = Path(cls.temp.name)
        cls.cluster = cls.folder / 'source'
        cls.socket = cls.folder / 'socket'
        cls.socket.mkdir()
        cls.env = {'PATH': os.environ['PATH'], 'PGHOST': str(cls.socket), 'PGPORT': '55433',
                   'PGDATABASE': 'postgres', 'PGUSER': 'postgres', 'PGSSLMODE': 'disable'}
        backup.command(['initdb', '-D', str(cls.cluster), '--username=postgres',
                        '--auth-local=trust', '--auth-host=reject', '--no-locale'], env=cls.env)
        backup.command(['pg_ctl', '-D', str(cls.cluster), '-l', str(cls.folder / 'postgres.log'),
                        '-w', '-o', f"-h '' -k {cls.socket} -p 55433", 'start'], env=cls.env)
        backup.psql('CREATE TABLE institutions(id integer PRIMARY KEY); '
                    'CREATE TABLE users(id integer PRIMARY KEY, institution_id integer REFERENCES institutions); '
                    'INSERT INTO institutions VALUES (1), (2); '
                    'INSERT INTO users VALUES (1,1), (2,1), (3,2);', cls.env)
        cls.identity = cls.folder / 'identity.txt'
        backup.command(['age-keygen', '-o', str(cls.identity)])
        cls.recipient = backup.command(['age-keygen', '-y', str(cls.identity)])

    @classmethod
    def tearDownClass(cls):
        backup.command(['pg_ctl', '-D', str(cls.cluster), '-w', '-m', 'immediate', 'stop'], env=cls.env)
        cls.temp.cleanup()

    def settings(self):
        return patch.dict(os.environ, {
            'BACKUP_DATABASE_URL': 'postgresql://fixture:fixture@localhost/fixture',
            'BACKUP_S3_ENDPOINT': 'https://r2.example', 'BACKUP_S3_BUCKET': 'backups',
            'BACKUP_S3_ACCESS_KEY_ID': 'fixture', 'BACKUP_S3_SECRET_ACCESS_KEY': 'fixture',
            'BACKUP_AGE_RECIPIENT': self.recipient,
        })

    def test_dump_restore_encrypt_upload_download_decrypt(self):
        storage = MemoryS3()
        with self.settings(), patch('backup.database_env', return_value=self.env), \
             patch('backup.boto3.client', return_value=storage):
            manifest = backup.backup()
        self.assertTrue(manifest['restoreVerified'])
        self.assertTrue(manifest['uploadVerified'])
        self.assertEqual(manifest['restored']['counts'], {'institutions': 2, 'users': 3})
        manifest_key = manifest['uploadedObject'].rsplit('/', 1)[0] + '/manifest.json'
        self.assertEqual(json.loads(storage.objects[manifest_key]), manifest)
        encrypted = self.folder / 'roundtrip.age'
        encrypted.write_bytes(storage.objects[manifest['uploadedObject']])
        decrypted = self.folder / 'roundtrip.dump'
        backup.command(['age', '--decrypt', '--identity', str(self.identity),
                        '--output', str(decrypted), str(encrypted)])
        self.assertEqual(backup.sha256(decrypted), manifest['dumpSha256'])
        with tempfile.TemporaryDirectory() as directory:
            restored = backup.verify_restore(decrypted, Path(directory), 60)
        self.assertEqual(restored['counts'], {'institutions': 2, 'users': 3})
        # Verify that the source fixture is still intact after both restorations.
        self.assertEqual(backup.psql('SELECT count(*) FROM users', self.env), '3')

    def test_failed_restore_never_uploads(self):
        storage = MemoryS3()
        with self.settings(), patch('backup.database_env', return_value=self.env), \
             patch('backup.boto3.client', return_value=storage), \
             patch('backup.verify_restore', side_effect=backup.BackupError('restore failed')):
            with self.assertRaises(backup.BackupError):
                backup.backup()
        self.assertEqual(storage.objects, {})


if __name__ == '__main__':
    unittest.main()
