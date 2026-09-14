-- ============================================================================
-- NOT EXECUTED against production at the time of writing.
--
-- Safe to run at any time, and it must be run BEFORE deploying the code that
-- uses it: the function's signature changes, so a deployed client calling the
-- three-argument form against the old two-argument function would get "function
-- does not exist" and every save would fail. Running it first is harmless in the
-- other direction -- the new function is additive until something calls it.
-- ============================================================================
--
-- Purpose: make recording a score IDEMPOTENT, so a retry cannot store it twice.
--
-- ---------------------------------------------------------------------------
-- The defect
-- ---------------------------------------------------------------------------
-- 0005 removed one source of ambiguity -- a second read that could fail after a
-- successful write -- but not the underlying one. The database can commit and the
-- RESPONSE can still be lost: a dropped connection, a function timeout, a client
-- navigating away. `recordHighScore` turns that into a rejected promise, the route
-- answers 503, and the panel says "the leaderboard could not be reached, so
-- nothing was saved" -- which is false, and invites a retry that inserts a second
-- row for the same game.
--
-- This needs no attacker and no unusual traffic. It is one lost response.
--
-- ---------------------------------------------------------------------------
-- The fix, and what it does NOT cover
-- ---------------------------------------------------------------------------
-- The client mints a UUID per game-over panel and sends it with the score. The
-- column below records it, a unique index makes a second insert impossible, and
-- the function checks for it first and returns the existing board instead.
--
-- What it does not cover, stated because a reader will otherwise assume it does:
-- if the first attempt inserted and was then EVICTED by other players' scores, a
-- retry with the same id finds no row and is treated as new. That is the right
-- outcome rather than a hole -- the score is no longer on the board, so
-- re-qualifying it is exactly what should happen -- but it does mean the
-- guarantee is "no duplicate row", not "at most one attempt ever".
--
-- Nor does it cover a submission that did not qualify. Nothing is inserted, so
-- there is nothing to key on, and a retry simply re-evaluates it. Harmless: the
-- outcome is the same and no row is written either way.
--
-- ---------------------------------------------------------------------------
-- Why the column is NULLABLE
-- ---------------------------------------------------------------------------
-- Rows written before this migration have no submission id and there is none to
-- invent for them. PostgreSQL's unique indexes treat NULLs as distinct, so any
-- number of legacy rows coexist under the index without a partial-index clause.
--
-- The consequence is that the constraint only protects rows that CARRY an id.
-- Every row the application writes from now on does, because the argument is not
-- optional -- see the function below, which has no default for it.
--
-- ---------------------------------------------------------------------------
-- Why the old function is DROPPED rather than replaced
-- ---------------------------------------------------------------------------
-- `CREATE OR REPLACE FUNCTION` matches on the argument list, so adding a third
-- argument would create an OVERLOAD and leave the two-argument version in place.
-- Two functions with the same name, one of them able to write a row with no
-- submission id, is precisely the ambiguity this migration exists to remove.
--
-- ---------------------------------------------------------------------------
-- How to verify, after running
-- ---------------------------------------------------------------------------
--   \d public.high_scores
--
-- Expect the new `submission_id` column and `high_scores_submission_id_key` as a
-- unique index. Then confirm there is exactly ONE function, taking three
-- arguments:
--
--   SELECT oid::regprocedure FROM pg_proc WHERE proname = 'record_high_score';
--
-- And that a repeated submission is a no-op rather than a second row. Rolled
-- back, so production is untouched:
--
--   BEGIN;
--     SELECT public.record_high_score('verify', 10, '11111111-1111-4111-8111-111111111111');
--     SELECT public.record_high_score('verify', 10, '11111111-1111-4111-8111-111111111111');
--     SELECT count(*) FROM public.high_scores WHERE name = 'verify';  -- expect 1
--   ROLLBACK;
--
-- ---------------------------------------------------------------------------
-- Reversal
-- ---------------------------------------------------------------------------
--   DROP FUNCTION public.record_high_score(text, integer, uuid);
--   ALTER TABLE public.high_scores DROP COLUMN submission_id;
--
-- and then re-run 0005 to restore the two-argument function. Loses no scores.
--
-- ---------------------------------------------------------------------------

ALTER TABLE public.high_scores
  ADD COLUMN IF NOT EXISTS submission_id UUID;

-- A plain UNIQUE rather than a partial index. NULLs are distinct in PostgreSQL, so
-- the legacy rows need no exclusion clause.
DO $$
BEGIN
  ALTER TABLE public.high_scores
    ADD CONSTRAINT high_scores_submission_id_key UNIQUE (submission_id);
EXCEPTION
  -- Idempotent: `ADD CONSTRAINT` has no `IF NOT EXISTS`, so re-running this file
  -- would otherwise fail on the second pass.
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

DROP FUNCTION IF EXISTS public.record_high_score(text, integer);

CREATE OR REPLACE FUNCTION public.record_high_score(
  p_name text,
  p_score integer,
  p_submission_id uuid
)
RETURNS jsonb
-- VOLATILE is required, not cosmetic: it is what gives each statement below a
-- fresh snapshot, so the reads happen AFTER the lock rather than in the caller's
-- older one. See 0005 for the full reasoning, which the lock still depends on.
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
  v_already  boolean;
BEGIN
  -- Serialises writers for the rest of this statement's transaction. Taken before
  -- the idempotency check as well, so two retries of the same submission arriving
  -- together cannot both pass it.
  PERFORM pg_advisory_xact_lock(hashtext('public.high_scores')::bigint);

  SELECT EXISTS (
    SELECT 1 FROM public.high_scores WHERE submission_id = p_submission_id
  ) INTO v_already;

  IF NOT v_already THEN
    SELECT count(*) INTO v_total FROM public.high_scores;

    -- The TENTH-BEST score: the row a new entry would actually displace. NULL when
    -- there are fewer than ten rows, which makes the comparison NULL and leaves
    -- `v_total < v_limit` to decide.
    SELECT score INTO v_cutoff
    FROM public.high_scores
    ORDER BY score DESC, created_at ASC, id ASC
    OFFSET v_limit - 1
    LIMIT 1;

    -- Strictly greater: a score EQUAL to the tenth-best does not displace it.
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
      INSERT INTO public.high_scores (name, score, submission_id)
      VALUES (p_name, p_score, p_submission_id);
    END IF;
  END IF;

  SELECT coalesce(
           jsonb_agg(
             jsonb_build_object('name', t.name, 'score', t.score, 'id', t.id)
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

  -- `saved` is true for a replay of a submission that DID land, because from the
  -- caller's point of view it is saved -- which is the whole purpose of the id.
  -- A replay of one that never qualified reports whatever it qualifies as now.
  RETURN jsonb_build_object(
    'saved', v_already OR coalesce(v_qualifies, false),
    'scores', v_scores
  );
END;
$$;
