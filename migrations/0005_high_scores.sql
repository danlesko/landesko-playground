-- ============================================================================
-- NOT EXECUTED against production at the time of writing.
--
-- Safe to run at any time: it creates a new table and a new function and alters
-- nothing existing. RUN IT BEFORE DEPLOYING the code that uses it -- the code
-- does degrade gracefully without it (see "Deploy ordering"), but there is no
-- reason to choose a degraded window.
-- ============================================================================
--
-- Purpose: hold the Tetris leaderboard -- a player's name and score -- capped at
-- ten rows, and the function that maintains that cap correctly.
--
-- ---------------------------------------------------------------------------
-- Why now
-- ---------------------------------------------------------------------------
-- The Tetris board on /animation (#163, PR #164) had nowhere to put a score. The
-- owner asked for the ten highest to be shown on the board before a game starts,
-- and for a player to be able to record theirs afterwards if they choose to.
--
-- ---------------------------------------------------------------------------
-- Why the cap lives in a FUNCTION and not in the application
-- ---------------------------------------------------------------------------
-- This is the whole substance of the migration, and the first two attempts were
-- both wrong. Worth writing down so the third is not undone.
--
-- The rule is: insert only if the table holds fewer than ten rows or the score
-- beats the tenth-best; then leave exactly ten rows.
--
-- ATTEMPT 1 -- read the standing, then write, from the application. Impossible
-- to do safely: `sql` from `@vercel/postgres` builds a FRESH HTTP client per
-- call, so two calls are two round trips with no shared transaction and another
-- submission can land between them. `sql.connect()` gives a real pooled client
-- over WebSockets, but the local e2e stack is `local-neon-http-proxy` with the
-- wire-protocol port deliberately unpublished, so anything built on it cannot be
-- tested here or in CI.
--
-- ATTEMPT 2 -- one statement with data-modifying CTEs. Two separate defects,
-- both found by review and then reproduced against this schema:
--
--   a) Every CTE in a statement sees the SAME snapshot and cannot see rows
--      another CTE wrote. So "insert, then trim past the tenth row" ranks the
--      table WITHOUT the new row, and a row one CTE inserts cannot be deleted by
--      another.
--   b) Qualifying against `min(score)` is wrong whenever the table is over-full.
--      Measured: with eleven rows scoring 1..11, a candidate of 2 beats
--      `min(score) = 1`, so it was accepted -- and the eviction then removed the
--      two lowest, destroying the existing 2 and seating an equal score in its
--      place. A tie must not displace. The comparison has to be against the
--      TENTH-BEST score, which is the row actually at risk.
--
-- Neither attempt addressed concurrency at all. From nine rows, N simultaneous
-- requests each see nine, each insert, and the table ends with 9 + N. Reading
-- with LIMIT 10 hides that from players but does not make it true, and a low
-- score arriving later does not heal it.
--
-- ATTEMPT 3, below. A VOLATILE PL/pgSQL function that takes a transaction-scoped
-- advisory lock and then re-reads. Three properties make it correct where the
-- others were not:
--
--   - The function call is one statement, so it is one implicit transaction, and
--     `pg_advisory_xact_lock` is held for all of it. A second caller blocks until
--     the first commits.
--   - VOLATILE is load-bearing, not decoration: a VOLATILE function takes a NEW
--     snapshot for each statement it executes, so the count and cutoff read after
--     the lock is granted include the previous writer's committed rows. A STABLE
--     function would reuse the calling query's snapshot and reintroduce the race.
--   - It deletes the surplus whether or not the candidate qualifies, so an
--     over-full table is corrected rather than preserved.
--
-- ---------------------------------------------------------------------------
-- Why VARCHAR(32)
-- ---------------------------------------------------------------------------
-- The owner specified 32 characters, and `users.name` in 0001 is already
-- VARCHAR(255), so a bounded VARCHAR matches this schema's precedent and shows
-- the limit in \d output rather than burying it in a constraint.
--
-- The bound is a BACKSTOP, not the primary limit: PostgreSQL counts characters
-- while the zod check in the route counts UTF-16 code units, so the two disagree
-- for any name containing a surrogate pair -- and the route, being the stricter
-- of the two there, rejects first. A name reaching this column has already passed
-- validation.
--
-- ---------------------------------------------------------------------------
-- Why no index
-- ---------------------------------------------------------------------------
-- The opposite call from 0004, and for the opposite reason: the table holds at
-- most ten rows, so every query is a sequential scan of one page and an index on
-- (score DESC, ...) would never be chosen. 0004 indexed `blogs` because it grows
-- without bound. This cannot.
--
-- If the cap is ever lifted, add (score DESC, created_at ASC, id ASC), which is
-- the read's ORDER BY exactly, and the eviction's inverse will want it too.
--
-- ---------------------------------------------------------------------------
-- Deploy ordering
-- ---------------------------------------------------------------------------
-- Run this FIRST. The code does tolerate the table's absence -- the read throws,
-- the route answers 503, and the board renders with the leaderboard area saying
-- scores are unavailable while the game stays playable -- so the order cannot
-- corrupt anything. It just means nobody can record a score until this runs.
--
-- ---------------------------------------------------------------------------
-- Before running, in production
-- ---------------------------------------------------------------------------
-- `IF NOT EXISTS` will silently accept a DIFFERENT pre-existing relation of the
-- same name, so check first rather than trusting it:
--
--   SELECT to_regclass('public.high_scores');   -- expect NULL
--   SELECT proname FROM pg_proc WHERE proname = 'record_high_score';  -- expect 0 rows
--
-- ---------------------------------------------------------------------------
-- How to verify, after running
-- ---------------------------------------------------------------------------
--   \d public.high_scores
--
-- Expect four columns, `name` as character varying(32), `created_at` as timestamp
-- with time zone, a primary key on id, and the two CHECK constraints. Then prove
-- the constraints bite. Both must ERROR, and the transaction is rolled back so
-- production is left empty:
--
--   BEGIN;
--     INSERT INTO public.high_scores (name, score) VALUES (E' \t ', 1);  -- blank
--     INSERT INTO public.high_scores (name, score) VALUES ('x', -1);     -- negative
--   ROLLBACK;
--
-- And the function, which should report saved=true and one row:
--
--   BEGIN;
--     SELECT public.record_high_score('verify', 1);
--   ROLLBACK;
--
-- ---------------------------------------------------------------------------
-- Reversal, and the moderation path
-- ---------------------------------------------------------------------------
--   DROP FUNCTION public.record_high_score(text, integer);
--   DROP TABLE public.high_scores;
--
-- Loses every recorded score, which is the table's entire content. Nothing else
-- references it and no column was altered.
--
-- There is no admin UI, and names are player-supplied text shown to every
-- visitor, so removing one is a manual step and worth stating plainly:
--
--   DELETE FROM public.high_scores WHERE name = '<the name>';
--
-- ---------------------------------------------------------------------------

-- `uuid_generate_v4()` and the `uuid-ossp` extension it needs are established by
-- 0001, which creates `blogs` the same way.
CREATE TABLE IF NOT EXISTS public.high_scores (
  id UUID NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  name VARCHAR(32) NOT NULL,
  score INTEGER NOT NULL,
  -- TIMESTAMPTZ, unlike `blogs.date` as first created -- 0003 exists only because
  -- that column was naive. It is also load-bearing rather than metadata: it is
  -- the first tiebreak in both the read's ordering and the eviction's, so two
  -- equal scores rank by who got there first, deterministically.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- At least one non-whitespace character. `btrim(name) <> ''` was the first
  -- version and is weaker than it looks: btrim strips spaces only, so a name of
  -- tabs or newlines would satisfy it and render as a blank row. The route trims
  -- and rejects before this is reached; this is for hand-written SQL.
  CONSTRAINT high_scores_name_not_blank CHECK (name ~ '[^[:space:]]'),
  -- The game cannot produce a negative score, so one here would mean a forged
  -- request that got past the route, or a manual insert.
  CONSTRAINT high_scores_score_non_negative CHECK (score >= 0)
);

-- ---------------------------------------------------------------------------
-- The leaderboard rule, as one serialisable operation.
--
-- Returns `{"saved": bool, "scores": [{"name": ..., "score": ...}, ...]}` -- the
-- board AFTER the write, so the caller needs no second query. A second query
-- would also be able to fail after a successful insert and make a stored score
-- look unstored.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_high_score(
  p_name text,
  p_score integer
)
RETURNS jsonb
-- VOLATILE is required, not cosmetic. See the note above: it is what gives each
-- statement below a fresh snapshot, so the reads happen AFTER the lock rather
-- than in the caller's older one.
VOLATILE
LANGUAGE plpgsql
AS $$
DECLARE
  v_limit    constant integer := 10;
  v_total    integer;
  v_cutoff   integer;
  v_qualifies boolean;
  v_surplus  integer;
  v_scores   jsonb;
BEGIN
  -- Serialises writers for the rest of this statement's transaction. A second
  -- caller waits here rather than reading a standing that is about to change.
  PERFORM pg_advisory_xact_lock(hashtext('public.high_scores')::bigint);

  SELECT count(*) INTO v_total FROM public.high_scores;

  -- The TENTH-BEST score: the row a new entry would actually displace. NULL when
  -- there are fewer than ten rows, which makes the comparison below NULL and
  -- leaves `v_total < v_limit` to decide -- the same three-valued fallthrough the
  -- empty-table case relies on.
  SELECT score INTO v_cutoff
  FROM public.high_scores
  ORDER BY score DESC, created_at ASC, id ASC
  OFFSET v_limit - 1
  LIMIT 1;

  -- Strictly greater: a score EQUAL to the tenth-best does not displace it, which
  -- is what "higher than the lowest" says.
  v_qualifies := v_total < v_limit OR p_score > v_cutoff;

  -- Surplus is computed from the total, so an over-full table sheds its extra
  -- rows even when the candidate does not qualify.
  v_surplus := GREATEST(
    0,
    v_total - v_limit + (CASE WHEN v_qualifies THEN 1 ELSE 0 END)
  );

  IF v_surplus > 0 THEN
    -- The exact inverse of the read's ordering, or this would evict the leader.
    DELETE FROM public.high_scores
    WHERE id IN (
      SELECT id
      FROM public.high_scores
      ORDER BY score ASC, created_at DESC, id DESC
      LIMIT v_surplus
    );
  END IF;

  IF v_qualifies THEN
    INSERT INTO public.high_scores (name, score) VALUES (p_name, p_score);
  END IF;

  SELECT coalesce(
           jsonb_agg(
             jsonb_build_object('name', t.name, 'score', t.score)
             ORDER BY t.score DESC, t.created_at ASC, t.id ASC
           ),
           '[]'::jsonb
         )
    INTO v_scores
  FROM (
    SELECT name, score, created_at, id
    FROM public.high_scores
    ORDER BY score DESC, created_at ASC, id ASC
    LIMIT v_limit
  ) t;

  RETURN jsonb_build_object('saved', v_qualifies, 'scores', v_scores);
END;
$$;
