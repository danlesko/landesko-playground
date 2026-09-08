#!/bin/sh
# Brings the e2e database stack up and leaves it PROVEN ready, not merely started.
#
# Three things here are deliberate, and the first two were wrong in the first draft:
#
#   1. It tears the stack down with its volume first. Postgres only runs
#      /docker-entrypoint-initdb.d when it creates the data directory, so a stack
#      that is already up ignores changed migrations, a changed seed and the
#      control-plane row -- silently, and the tests then fail against yesterday's
#      fixtures. Starting clean costs a few seconds and removes the whole class.
#
#   2. Readiness is a real query, not a proxy of one. `--wait` only covers the
#      postgres healthcheck; the proxy and TLS containers merely have to be
#      "running", and the CA file appearing proves Caddy minted a CA rather than that
#      anything can be queried. So this ends by running `SELECT 1` through the exact
#      public endpoint the app uses, with the CA it will use, and fails if that never
#      succeeds.
#
#   3. The CA is extracted before that probe can pass, because the probe needs it.
#      Caddy mints on demand, so the loop nudges it with a request first.
set -eu
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo=$(CDPATH= cd -- "$here/../.." && pwd)
compose="docker compose -f $here/compose.yaml"
ca="$here/.caddy-root.crt"

$compose down -v >/dev/null 2>&1 || true
$compose up -d --wait

# Caddy writes its CA lazily, so poll rather than assume, nudging it into issuing.
i=0
while [ "$i" -lt 60 ]; do
	if $compose exec -T tls test -f /data/caddy/pki/authorities/local/root.crt 2>/dev/null; then
		break
	fi
	curl -sk -o /dev/null --max-time 2 https://api.localtest.me/sql || true
	i=$((i + 1))
	sleep 1
done

$compose exec -T tls cat /data/caddy/pki/authorities/local/root.crt >"$ca" || true
if [ ! -s "$ca" ]; then
	echo "e2e/db/up.sh: Caddy's root CA never appeared; every query would fail as a bare 'fetch failed'" >&2
	exit 1
fi

# From the repo root, so `@vercel/postgres` resolves however this script was invoked.
cd "$repo"

# The readiness gate. Queries through api.localtest.me:443 -> caddy -> proxy ->
# postgres, exactly as the app will, and reads a seeded row so a working connection
# to an UNSEEDED database does not count as ready either.
i=0
while [ "$i" -lt 60 ]; do
	if NODE_EXTRA_CA_CERTS="$ca" \
		POSTGRES_URL="postgres://postgres:postgres@db-pooler.localtest.me:5432/main" \
		node --input-type=module -e '
      const { sql } = await import("@vercel/postgres");
      const r = await sql`SELECT count(*)::int AS n FROM blogs`;
      if (r.rows[0].n < 1) throw new Error("no seeded rows");
    ' >/dev/null 2>&1; then
		echo "e2e database ready. Run the suite with:"
		echo "  E2E_DATABASE=1 pnpm test:e2e"
		exit 0
	fi
	i=$((i + 1))
	sleep 1
done

echo "e2e/db/up.sh: the stack came up but a query never succeeded. Logs:" >&2
$compose logs --no-color >&2
exit 1
