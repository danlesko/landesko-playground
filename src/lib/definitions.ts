// Both queries in data.ts are `SELECT *`, so every row carries every column and
// this type is a claim about what the driver actually hands back.
export type Blog = {
  id: string;
  title: string;
  content: string;
  // `timestamp` in Postgres, so the driver resolves it to a `Date`, not the
  // string this used to declare. Naive — no zone — which is why the render
  // sites deliberately format in the reader's ambient zone.
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
