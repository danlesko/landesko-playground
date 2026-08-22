// Both queries in data.ts are `SELECT *`, so every row carries every column and
// this type is a claim about what the driver actually hands back.
export type Blog = {
  id: string;
  title: string;
  content: string;
  // `timestamp` in Postgres, and the driver's OID 1114 parser hands back a
  // `Date`, not the string this used to declare. The column is naive, so that
  // `Date` is a wall clock read in the *query* process's zone — not the
  // reader's, and not necessarily the writer's either: the create action
  // formats in `America/Denver` before inserting.
  //
  // `Date` is narrower than the parser's full range: `infinity`/`-infinity`
  // parse to the *numbers* `Infinity`/`-Infinity`, and nothing on the column
  // excludes them. It still describes every row this codebase can produce,
  // because the only INSERT writes a formatted wall clock. Widening to
  // `Date | number` would make both render sites handle a value only
  // hand-written SQL could put there; a CHECK constraint is the fix if that
  // ever stops being true.
  date: Date;
  // The column is `private`, which only reads as a reserved word in identifier
  // position; as a property name it is fine. actions.ts calls its form field
  // `privateBlog` for that reason, so the two names differ on purpose.
  private: boolean;
};

export type Email = {
  name: string;
  email: string;
  message: string;
};
