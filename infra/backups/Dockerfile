FROM postgres:18-alpine AS base
RUN apk add --no-cache python3 py3-boto3 age ca-certificates
WORKDIR /app
COPY backup.py /app/backup.py
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
USER postgres
ENTRYPOINT ["python3", "/app/backup.py"]

FROM base AS test
COPY test_backup.py /app/test_backup.py
RUN python3 -m unittest -v test_backup

FROM base AS production
