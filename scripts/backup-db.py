#!/usr/bin/env python3
"""Create a private production dump and verify it in an isolated local Postgres."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import time
from datetime import datetime, timezone
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]


def run(args, *, env=None, stdin=None, stdout=subprocess.PIPE):
    result = subprocess.run(args, env=env, stdin=stdin, stdout=stdout,
                            stderr=subprocess.PIPE, text=False)
    if result.returncode:
        # Command arguments contain no credentials; never print the connection URL.
        raise RuntimeError(result.stderr.decode(errors='replace'))
    return result.stdout.decode().strip() if result.stdout else ''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify', action='store_true', help='Restore into a temporary local container')
    parser.add_argument('--runtime', default='docker', choices=['podman', 'docker'])
    args = parser.parse_args()
    os.umask(0o077)
    config = ROOT / 'apps/api/.env.backup.local'
    values = dict(line.split('=', 1) for line in config.read_text().splitlines()
                  if line.strip() and not line.lstrip().startswith('#') and '=' in line)
    url = urlsplit(values.get('PROD_DATABASE_URL', '').strip().strip('\"').strip("'"))
    if url.scheme not in ('postgres', 'postgresql') or not url.hostname or not url.password:
        raise RuntimeError('Completa PROD_DATABASE_URL en apps/api/.env.backup.local')
    env = os.environ.copy()
    env.update(PGHOST=url.hostname, PGPORT=str(url.port or 5432),
               PGUSER=unquote(url.username or 'postgres'), PGPASSWORD=unquote(url.password),
               PGDATABASE=unquote(url.path.lstrip('/')), PGSSLMODE='require', PGCONNECT_TIMEOUT='30')
    pg_env = [item for key in ('PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE',
                              'PGSSLMODE', 'PGCONNECT_TIMEOUT') for item in ('--env', key)]
    runtime = args.runtime
    probe_image = 'docker.io/library/postgres:16-alpine'
    probe = [runtime, 'run', '--rm', *pg_env, probe_image, 'psql', '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1']
    version = run([*probe, '-c', 'SHOW server_version_num'], env=env)
    major = int(version) // 10000
    if not 14 <= major <= 18:
        raise RuntimeError(f'Versión de PostgreSQL no contemplada: {major}')
    image = f'docker.io/library/postgres:{major}-alpine'
    now = datetime.now(timezone.utc)
    folder = ROOT / 'backups' / now.strftime('%Y-%m-%dT%H%M%SZ')
    folder.mkdir(parents=True, mode=0o700)
    dump = folder / 'production.dump'
    partial = folder / 'production.dump.partial'
    print(f'Producción: PostgreSQL {major}. Creando respaldo privado...', flush=True)
    try:
        with partial.open('xb') as output:
            run([runtime, 'run', '--rm', *pg_env, image, 'pg_dump', '--format=custom',
                 '--no-owner', '--no-privileges', '--lock-wait-timeout=30000'], env=env, stdout=output)
    except Exception:
        print('El archivo .partial está incompleto; no usarlo como respaldo.', flush=True)
        raise
    partial.rename(dump)
    checksum = hashlib.sha256()
    with dump.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            checksum.update(chunk)
    digest = checksum.hexdigest()
    metadata = {'createdAtUtc': now.isoformat(), 'postgresMajor': major,
                'bytes': dump.stat().st_size, 'sha256': digest, 'restoreVerified': False}
    meta = folder / 'metadata.json'
    meta.write_text(json.dumps(metadata, indent=2) + '\n')
    print(f'Respaldo creado: {dump.relative_to(ROOT)} ({dump.stat().st_size:,} bytes)', flush=True)
    if not args.verify:
        print('Pendiente verificar la restauración. Ejecuta con --verify para comprobar el ciclo completo.')
        return
    container = 'auleka-backup-check-' + secrets.token_hex(6)
    local_env = os.environ.copy()
    local_env['POSTGRES_PASSWORD'] = secrets.token_urlsafe(32)
    started = False
    try:
        run([runtime, 'run', '-d', '--name', container, '--env', 'POSTGRES_PASSWORD',
             '--env', 'POSTGRES_DB=backup_verify', image], env=local_env)
        started = True
        for _ in range(60):
            ready = subprocess.run([runtime, 'exec', container, 'pg_isready', '-U', 'postgres',
                                    '-d', 'backup_verify'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if ready.returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError('PostgreSQL local no quedó listo a tiempo')
        print('Restaurando en un contenedor temporal sin puertos públicos...', flush=True)
        with dump.open('rb') as source:
            run([runtime, 'exec', '-i', container, 'pg_restore', '--exit-on-error', '--no-owner',
                 '--no-privileges', '-U', 'postgres', '-d', 'backup_verify'], stdin=source)
        sql = "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'"
        tables = run([runtime, 'exec', container, 'psql', '-X', '-A', '-t', '-U', 'postgres',
                      '-d', 'backup_verify', '-v', 'ON_ERROR_STOP=1', '-c', sql])
        counts = run([runtime, 'exec', container, 'psql', '-X', '-A', '-t', '-U', 'postgres',
                      '-d', 'backup_verify', '-v', 'ON_ERROR_STOP=1', '-c',
                      "SELECT 'institutions', count(*) FROM institutions UNION ALL SELECT 'users', count(*) FROM users"])
        metadata.update(restoreVerified=True, restoredTables=int(tables),
                        restoredCounts=dict((name, int(count)) for name, count in
                                            (line.split('|') for line in counts.splitlines())))
        meta.write_text(json.dumps(metadata, indent=2) + '\n')
        print(f'Restauración comprobada: {tables} tablas. Conteos: {counts.replace(chr(10), "; ")}', flush=True)
        print('El respaldo contiene datos reales y no está anonimizado; conservarlo con acceso restringido.')
    finally:
        if started:
            run([runtime, 'rm', '-f', container])


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError) as error:
        print(f'ERROR: {error}')
        raise SystemExit(1)
