"""One-shot PostgreSQL backup: restore check, age encryption, verified S3 upload."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
from datetime import datetime, timezone
from urllib.parse import parse_qs, unquote, urlsplit
from urllib.request import Request, urlopen
import uuid

import boto3
from botocore.config import Config


class BackupError(Exception):
    pass


def log(event, **fields):
    print(json.dumps({'event': event, **fields}), flush=True)


def required(name):
    value = os.environ.get(name, '').strip()
    if not value:
        raise BackupError(f'Falta {name}')
    return value


def https_url(value, name):
    parsed = urlsplit(value)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise BackupError(f'{name} debe ser una URL HTTPS sin credenciales ni parámetros')
    return value.rstrip('/')


def database_env(url):
    parsed = urlsplit(url)
    if parsed.scheme not in ('postgres', 'postgresql') or not parsed.hostname or not parsed.username or not parsed.path.strip('/'):
        raise BackupError('BACKUP_DATABASE_URL no es una conexión PostgreSQL válida')
    mode = os.environ.get('BACKUP_PGSSLMODE') or parse_qs(parsed.query).get('sslmode', ['require'])[0]
    if mode not in ('require', 'verify-ca', 'verify-full'):
        raise BackupError('La conexión de origen debe usar TLS')
    # Start from a minimal environment: do not inherit PGOPTIONS/PGSERVICE, AWS keys, etc.
    return {
        'PATH': os.environ.get('PATH', ''),
        'PGHOST': parsed.hostname, 'PGPORT': str(parsed.port or 5432),
        'PGUSER': unquote(parsed.username), 'PGPASSWORD': unquote(parsed.password or ''),
        'PGDATABASE': unquote(parsed.path.lstrip('/')), 'PGSSLMODE': mode,
        'PGCONNECT_TIMEOUT': '30',
        'PGOPTIONS': '-c default_transaction_read_only=on',
    }


def command(args, *, env=None, timeout=900):
    try:
        result = subprocess.run(args, env=env, capture_output=True, timeout=timeout, check=False)
    except subprocess.TimeoutExpired:
        raise BackupError(f'Tiempo agotado en {Path(args[0]).name}') from None
    if result.returncode:
        # Database errors can contain row values; do not send stderr or URLs to logs/alerts.
        raise BackupError(f'Falló {Path(args[0]).name} (código {result.returncode})')
    return result.stdout.decode().strip()


def sha256(path):
    checksum = hashlib.sha256()
    with path.open('rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            checksum.update(block)
    return checksum.hexdigest()


def psql(sql, env):
    return command(['psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql], env=env, timeout=60)


def verify_restore(dump, folder, timeout):
    """Restore ONLY to an isolated local cluster, without any production PG variables."""
    cluster = folder / 'verify'
    socket = folder / 'socket'
    socket.mkdir(mode=0o700)
    # Explicit local values; the production connection is never accepted by this function.
    env = {'PATH': os.environ.get('PATH', ''), 'PGHOST': str(socket),
           'PGPORT': '55432', 'PGUSER': 'postgres', 'PGDATABASE': 'postgres',
           'PGSSLMODE': 'disable', 'PGCONNECT_TIMEOUT': '10'}
    command(['initdb', '-D', str(cluster), '--username=postgres', '--auth-local=trust',
             '--auth-host=reject', '--encoding=UTF8', '--no-locale'], env=env, timeout=60)
    try:
        command(['pg_ctl', '-D', str(cluster), '-l', str(folder / 'postgres.log'),
                 '-w', '-t', '30', '-o', f"-h '' -k {socket} -p 55432", 'start'], env=env, timeout=45)
        command(['pg_restore', '--exit-on-error', '--no-owner', '--no-privileges',
                 '--dbname=postgres', str(dump)], env=env, timeout=timeout)
        tables = int(psql("SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'", env))
        counts = psql("SELECT 'institutions', count(*) FROM institutions UNION ALL SELECT 'users', count(*) FROM users", env)
        return {'tables': tables, 'counts': dict((name, int(count)) for name, count in
                                                (line.split('|') for line in counts.splitlines()))}
    finally:
        # The directory is freshly created for this invocation; never stop a shared server.
        if (cluster / 'postmaster.pid').exists():
            command(['pg_ctl', '-D', str(cluster), '-w', '-t', '30', '-m', 'immediate', 'stop'], env=env, timeout=45)


def publish(client, bucket, prefix, encrypted, manifest):
    key = f'{prefix}/production.dump.age'
    checksum = sha256(encrypted)
    client.upload_file(str(encrypted), bucket, key, ExtraArgs={
        'ContentType': 'application/octet-stream', 'Metadata': {'sha256': checksum},
    })
    # Read back the entire encrypted object; multipart ETags are not file checksums.
    response = client.get_object(Bucket=bucket, Key=key)
    digest = hashlib.sha256()
    length = 0
    body = response['Body']
    try:
        for block in body.iter_chunks(chunk_size=1024 * 1024):
            digest.update(block)
            length += len(block)
    finally:
        body.close()
    if digest.hexdigest() != checksum or length != encrypted.stat().st_size:
        raise BackupError('El objeto remoto no coincide con el respaldo cifrado')
    manifest.update(encryptedSha256=checksum, encryptedBytes=length,
                    uploadedObject=key, uploadVerified=True)
    # A manifest is the completion marker; partial/failed uploads never get one.
    client.put_object(Bucket=bucket, Key=f'{prefix}/manifest.json',
                      Body=json.dumps(manifest, indent=2).encode(), ContentType='application/json')


def backup():
    os.umask(0o077)
    source = database_env(required('BACKUP_DATABASE_URL'))
    endpoint = https_url(required('BACKUP_S3_ENDPOINT'), 'BACKUP_S3_ENDPOINT')
    bucket = required('BACKUP_S3_BUCKET')
    recipient = required('BACKUP_AGE_RECIPIENT')
    if not re.fullmatch(r'age1[0-9a-z]{58}', recipient):
        raise BackupError('BACKUP_AGE_RECIPIENT debe ser una clave pública age X25519')
    prefix = os.environ.get('BACKUP_S3_PREFIX', 'auleka/production/postgres').strip('/')
    if not prefix or not re.fullmatch(r'[A-Za-z0-9/_-]+', prefix):
        raise BackupError('BACKUP_S3_PREFIX no es válido')
    timeout = int(os.environ.get('BACKUP_COMMAND_TIMEOUT', '900'))
    if not 30 <= timeout <= 3600:
        raise BackupError('BACKUP_COMMAND_TIMEOUT debe estar entre 30 y 3600 segundos')
    client = boto3.client('s3', endpoint_url=endpoint,
                          region_name=os.environ.get('BACKUP_S3_REGION', 'auto'),
                          aws_access_key_id=required('BACKUP_S3_ACCESS_KEY_ID'),
                          aws_secret_access_key=required('BACKUP_S3_SECRET_ACCESS_KEY'),
                          config=Config(connect_timeout=10, read_timeout=60,
                                        retries={'mode': 'standard', 'total_max_attempts': 3},
                                        request_checksum_calculation='when_required',
                                        response_checksum_validation='when_required'))
    now = datetime.now(timezone.utc)
    run_id = now.strftime('%Y-%m-%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:12]
    prefix = f'{prefix}/{run_id}'
    log('backup_started', runId=run_id)
    with tempfile.TemporaryDirectory(prefix='auleka-backup-') as directory:
        folder = Path(directory)
        dump = folder / 'production.dump'
        version = int(psql('SHOW server_version_num', source)) // 10000
        client_version = command(['pg_dump', '--version'], timeout=10)
        if f' {version}.' not in client_version:
            raise BackupError('La versión de pg_dump debe coincidir con el servidor')
        command(['pg_dump', '--format=custom', '--no-owner', '--no-privileges',
                 '--lock-wait-timeout=30000', '--file', str(dump)], env=source, timeout=timeout)
        restored = verify_restore(dump, folder, timeout)
        log('restore_verified', runId=run_id, tables=restored['tables'])
        encrypted = folder / 'production.dump.age'
        command(['age', '--recipient', recipient, '--output', str(encrypted), str(dump)], timeout=timeout)
        manifest = {'formatVersion': 1, 'runId': run_id, 'createdAtUtc': now.isoformat(),
                    'postgresMajor': version, 'dumpBytes': dump.stat().st_size,
                    'dumpSha256': sha256(dump), 'restoreVerified': True,
                    'restored': restored, 'ageRecipient': recipient}
        publish(client, bucket, prefix, encrypted, manifest)
    log('backup_completed', runId=run_id, manifest=f'{prefix}/manifest.json')
    return manifest


def ping(base, suffix=''):
    if not base:
        return
    base = https_url(base, 'BACKUP_HEALTHCHECK_URL')
    try:
        with urlopen(Request(base + suffix, data=b'', method='POST'), timeout=10) as response:
            if response.status != 200:
                raise BackupError('El monitor no confirmó la señal')
    except Exception:
        raise BackupError('No se pudo notificar al monitor de respaldos') from None


def main():
    monitor = os.environ.get('BACKUP_HEALTHCHECK_URL', '').strip()
    try:
        # A monitor outage must not prevent creating a backup.
        try:
            ping(monitor, '/start')
        except BackupError:
            log('monitor_start_failed')
        if not monitor:
            log('monitor_not_configured')
        backup()
        ping(monitor)
        return 0
    except Exception as error:
        # Boto/subprocess exceptions may expose endpoints or credentials; only controlled messages.
        log('backup_failed', reason=str(error) if isinstance(error, BackupError) else type(error).__name__)
        try:
            ping(monitor, '/fail')
        except BackupError:
            log('monitor_failure_notification_failed')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
