#!/bin/sh
# Инициализация кластера PostgreSQL (если пусто) и запуск в foreground.
set -e

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  echo "[pg] initdb в $PGDATA (супер-роль: $POSTGRES_USER)"
  mkdir -p "$PGDATA" /var/run/postgresql
  chown -R postgres:postgres "$PGDATA" /var/run/postgresql
  chmod 700 "$PGDATA"
  PWFILE=$(mktemp)
  echo "$POSTGRES_PASSWORD" > "$PWFILE"
  chown postgres:postgres "$PWFILE"
  su -s /bin/sh postgres -c \
    "initdb -D '$PGDATA' -U $POSTGRES_USER --auth-local=trust --auth-host=scram-sha-256 --pwfile=$PWFILE -E UTF8"
  rm -f "$PWFILE"
else
  mkdir -p /var/run/postgresql
  chown -R postgres:postgres /var/run/postgresql
fi

# Только локальный интерфейс — снаружи контейнера PostgreSQL не торчит
exec su -s /bin/sh postgres -c \
  "exec postgres -D '$PGDATA' -c listen_addresses=127.0.0.1 -c port=5432"
