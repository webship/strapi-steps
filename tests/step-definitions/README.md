# Step definitions

The pack's steps, one file per area of the admin; `strapi-helpers.js` holds the
shared plumbing and registers no step. Every step carries a JSDoc block with five
`Example #n:` lines, which `npm run test:examples` checks against the step and
every other definition loaded with it.
