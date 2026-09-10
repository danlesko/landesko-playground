#!/bin/sh
# Applied once, when the postgres volume is first created.
#
# A single script rather than several .sql files, because
# `/docker-entrypoint-initdb.d` runs its contents in ALPHABETICAL order and the
# ordering here is not alphabetical: the control plane is independent, the
# migrations have to run 0001..0004, and the seed needs the table the migrations
# create. Explicit sequencing is worth one file.
set -eu

psql() { command psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --no-psqlrc -v ON_ERROR_STOP=1 "$@"; }

echo "init: mock control plane"
# What Neon's proxy consults to resolve a hostname to a compute. In mock mode it
# reads this table out of the very database it is fronting, keyed on the FIRST LABEL
# of the requested host -- so `db-pooler.localtest.me` looks up `db-pooler`.
#
# `allowed_ips` must be a parseable CIDR. Two wrong answers, both found the hard
# way: '' fails with "mocked ip pattern should be correct: invalid IP address
# syntax" and a 502, and NULL fails with "Failed to read password: a Postgres value
# was NULL" and a 500. Neither error names the column.
#
# Expect ONE benign line in the postgres log shortly after startup:
#   ERROR: relation "endpoints" already exists
# That is the proxy running its own setup, which retries rather than using IF NOT
# EXISTS. It is reported against the proxy's connection, the proxy itself logs no
# error, and queries work. Creating the table here anyway is not avoidable by
# reordering: the row has to exist before the proxy's first request, and the proxy
# only starts after this script has finished.
psql <<'SQL'
CREATE SCHEMA IF NOT EXISTS neon_control_plane;
CREATE TABLE neon_control_plane.endpoints (
  endpoint_id VARCHAR(255) PRIMARY KEY,
  allowed_ips VARCHAR(255) NOT NULL
);
INSERT INTO neon_control_plane.endpoints (endpoint_id, allowed_ips)
VALUES ('db-pooler', '0.0.0.0/0');
SQL

echo "init: applying this repo's migrations"
# Mounted from ../../migrations, applied in filename order. Not a copy of the
# schema: the same files that document production. If one of them stops applying,
# this stack fails to come up and CI says so, which is strictly more than the
# migrations directory was doing before.
for f in /migrations/*.sql; do
	echo "init:   $(basename "$f")"
	psql --file "$f"
done

echo "init: seeding fixtures"
# Fixed ids and a fixed date, because the tests assert on them.
#
# The date is deliberately old. `BlogBodyAbbr` renders a relative string ("3 hours
# ago") for recent posts and falls back to the absolute date beyond about nine days,
# so a fixed old date is the only one that renders the same string forever. A
# `now()` default would make the list's text depend on when CI ran.
#
# One public and one private post, which is what lets a test assert the privacy
# guard rather than just that some list rendered. The private one must stay
# invisible to an anonymous visitor.
psql <<'SQL'
INSERT INTO blogs (id, title, content, date, private) VALUES
  (
    '11111111-1111-4111-8111-111111111111',
    'A Public Post For The E2E Suite',
    'The body of the public post, long enough to be worth clamping in the list.',
    '2026-01-02 03:04:05+00',
    FALSE
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'A Private Post For The E2E Suite',
    'The body of the private post. An anonymous visitor must never see this.',
    '2026-01-02 03:04:05+00',
    TRUE
  );
SQL

# The leaderboard, seeded THREE rows rather than ten. Deliberate: ten would leave the table
# full, so every test about a qualifying score would have to displace something, and the
# "no scores yet" and "not full yet" paths would be unreachable. Tests that need a full table
# fill it themselves.
#
# Descending scores with a gap, so a test can assert the ORDER rather than just the presence
# of three rows -- a broken ORDER BY would still show all three.
psql <<'SQL'
INSERT INTO high_scores (name, score, created_at) VALUES
  ('E2E Champion',    9000, '2026-01-02 03:04:05+00'),
  ('E2E Runner Up',   5000, '2026-01-02 03:04:06+00'),
  ('E2E Third Place',  100, '2026-01-02 03:04:07+00');
SQL

echo "init: done"
