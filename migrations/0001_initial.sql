-- Captured by introspecting the live database on 2026-08-21 (PostgreSQL 15.19,
-- Neon). This file records what the database ACTUALLY contains, not what the
-- application's types wish it contained. Before this capture the schema existed
-- nowhere in version control.
--
-- Two columns here were added by hand and are absent from the deleted seed
-- route (src/app/lib/seed/route.ts, last present at 77bc358^):
--
--   * blogs.private  -- read by src/lib/data.ts, written by src/lib/actions.ts,
--                       never declared anywhere in the repo.
--   * blogs.date     -- the seed declared DATE. The live column is TIMESTAMP
--                       WITHOUT TIME ZONE, and every stored value carries a
--                       time of day, which a DATE column cannot hold. Issue #3
--                       asserts DATE on the strength of that deleted seed file;
--                       the assertion is wrong.
--
-- Everything below reproduces the live constraint names, which are the ones
-- Postgres generates from these inline declarations (blogs_pkey, users_pkey,
-- users_email_key). Schema only -- no rows.
--
-- IF NOT EXISTS makes this safe to run against the existing database, where it
-- is a no-op. It will NOT retrofit a database created from the old seed file;
-- that would need ALTER statements, which are deliberately not included here.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS users (
  id UUID NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL
);

-- Left from the credentials-auth era; authentication is GitHub OAuth only now,
-- so nothing in the application reads this table. Retained as captured -- it is
-- recorded here, not endorsed, and dropping it is a separate decision.

CREATE TABLE IF NOT EXISTS blogs (
  id UUID NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  -- Precision 6 is Postgres's default for TIMESTAMP and is what the live
  -- column reports. Timezone-naive: src/lib/actions.ts writes Denver local
  -- wall-clock time while the server's TimeZone is GMT.
  date TIMESTAMP WITHOUT TIME ZONE NOT NULL,
  private BOOLEAN NOT NULL DEFAULT FALSE
);

-- The live database has no indexes beyond the three the constraints above
-- create: blogs_pkey, users_pkey and users_email_key. In particular there is no
-- index on blogs.date, which every listing query sorts by.
