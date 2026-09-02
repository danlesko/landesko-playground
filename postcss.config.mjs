/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    // v4 moved the PostCSS plugin out of the `tailwindcss` package. Leaving the old
    // `tailwindcss: {}` key here fails the build with a specific error naming this
    // package, so this cannot go wrong silently.
    //
    // No autoprefixer and no postcss-import: v4 emits its own vendor prefixes and
    // resolves `@import` internally. Neither was ever declared in this repo.
    "@tailwindcss/postcss": {},
  },
};

export default config;
