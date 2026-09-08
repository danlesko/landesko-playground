#!/bin/sh
# Brings the e2e database stack up and leaves Node able to trust it.
#
# Two steps, and the second is the one that is easy to forget: Caddy mints its own
# CA for `tls internal`, so until that root is on disk where NODE_EXTRA_CA_CERTS can
# point at it, every query fails with a bare `fetch failed` and nothing explaining
# why. Extracting it is what lets the suite run with TLS verification ON rather than
# switching it off wholesale.
set -eu
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

docker compose -f "$here/compose.yaml" up -d --wait

# --wait covers the healthcheck on postgres, but Caddy writes its CA lazily on
# first use, so poll for the file rather than assuming it is there.
i=0
while [ "$i" -lt 60 ]; do
	if docker compose -f "$here/compose.yaml" exec -T tls test -f /data/caddy/pki/authorities/local/root.crt 2>/dev/null; then
		break
	fi
	# Nudge Caddy into issuing, since it mints on demand.
	curl -sk -o /dev/null --max-time 2 https://api.localtest.me/sql || true
	i=$((i + 1))
	sleep 1
done

docker compose -f "$here/compose.yaml" exec -T tls \
	cat /data/caddy/pki/authorities/local/root.crt > "$here/.caddy-root.crt"

if [ ! -s "$here/.caddy-root.crt" ]; then
	echo "e2e/db/up.sh: Caddy's root CA never appeared; TLS would fail as 'fetch failed'" >&2
	exit 1
fi

echo "e2e database ready. Run the suite with:"
echo "  E2E_DATABASE=1 pnpm test:e2e"
