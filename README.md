<p align="center"><img src="https://raw.githubusercontent.com/webship/strapi-steps/2.0.x/assets/logo.svg" alt="Strapi logo" width="96"></p>

# strapi-steps

[![Test](https://github.com/webship/strapi-steps/actions/workflows/test.yml/badge.svg)](https://github.com/webship/strapi-steps/actions/workflows/test.yml)

Cucumber step definitions for testing the admin panel of a Strapi app, with
[webship-js](https://webship.co/docs/webship-js/2.0.x), a BDD browser automation
harness built on Playwright and Cucumber-js.

`@webship-js/strapi-steps` covers what the admin of every Strapi 5 app shows,
whatever its content types:

- **the session**: the admin login by a handle of the users registry (the
  session of an account is taken over from earlier in the run) or through the
  form, its refusal, logging out, who is signed in;
- **the Content Manager's list**: its count, rows, columns and cells, the status
  of each entry, the search, sorting, the filters (by a field, by the status, by
  a relation) and their tags, the columns shown, the pages and their size, the
  locale of the list, selecting rows, and the bulk publish, unpublish and delete
  with their confirmations;
- **the edit view**: every kind of field by its label (a text, a slug and its
  "Regenerate", the rich-text editors, a true/false switch, a relation with its
  picker, a media field with the library's asset picker), saving, the
  notifications, the errors of a refused publication, a single type, leaving
  with unsaved changes, deleting;
- **draft and publish**: publishing, the "Modified" state, the published version
  (read only), discarding the changes, unpublishing, and whether an account may
  publish;
- **the dynamic zone**: adding a component, filling it in, moving it with the
  keyboard, removing it, and the components a zone holds;
- **the locales**: switching an entry to another locale and filling it in from
  another;
- **the Media Library**: its folders, uploading a file and a refused upload,
  making and deleting a folder, a file's details;
- **the Content-Type Builder, read only**: the fields of a model and that the
  builder allows no change;
- **the settings**: the main navigation and the settings menu an account sees,
  the admin roles and their permissions, the end-user roles, the API tokens, the
  accounts and their roles, the plan of the site, an address an account is
  refused;
- **test entries**: a scenario makes the entries it needs through the admin's
  own API and the steps delete them after it, with every entry, file and folder
  it makes on screen.

No step phrase names the platform: a scenario reads `When I choose "Guides" in
the "category" relation` and `Then the status of the entry should be "Modified"`.

The Community Edition only: the steps use no Enterprise feature, and they never
open the pages of the paid plans the settings menu lists.

CI builds a real app with [DDEV](https://ddev.com) on the runner (made with the
official installer, `create-strapi`, at its current release, on PostgreSQL 17,
with the content model and the sample content of [A test site](#a-test-site)),
and runs the whole suite against it twice on every push and pull request, then
the assertions that must fail; see
[`.github/workflows/test.yml`](.github/workflows/test.yml).

## From nothing to a green run

What the machine needs: Docker, [DDEV](https://ddev.com), git, and Node.js 24 or
later with npm. Node.js 24, the app, its admin and PostgreSQL run in DDEV's
containers.

**1. The app.** The pack's own build script (the one CI runs) makes the app in a
generic DDEV project (DDEV has no project type for Strapi): Node.js 24 in the web
image, the app made with `npx create-strapi@latest` without the cloud login
(`--skip-cloud`) and with telemetry off, PostgreSQL 17, the content model written
as schema files, the admin built for production and served by the web
container, French beside English, the sample content, and the three accounts of
[Test users](#test-users). It takes about five minutes the first time.

```bash
git clone https://github.com/webship/strapi-steps.git
SITE_DIR="$PWD/strapi-site" strapi-steps/.github/scripts/build-ddev-site.sh
```

The app answers at `https://strapisteps.ddev.site`, its admin at `/admin`. Its
accounts are `administrator`, `editor` and `author` (the admin logs in with their
email addresses, `<handle>@example.com`), each with the password `dD.123123ddd`
(step 3 names them).

In the [Webship Workspace](https://github.com/webship/workspace), its Strapi
plugin builds the same app instead, in a sites folder of the workspace (`dev/`
here, the one `--with-needs` adds to a new workspace; `test/`, `sandboxes/` and
`demos/` work the same):

```bash
bash core/scripts/plugins.sh --require strapi --with-needs
bash core/scripts/plugins.sh --activate strapi --with-needs
bash core/scripts/plugins.sh --install strapi
bash dev/cmd-strapi-project.sh stsite --install --add-users --sample-content
```

That app answers at `https://stsite.ddev.site`. `--sample-content` adds the
content model and the sample content (the features of this pack need them). Its
accounts are the plugin's, the same three with the workspace's shared password
`dD.123123ddd`: `administrator`, `editor` and `author`. The workspace's own
account is a Super Admin too; the suite does not use it. The plugin's README says
how to manage the accounts with its CLI tool (`cmd-tools-strapi-cli.sh stsite
--add-users`): the dashboard's Users menu does not know a Strapi app.

**2. A test project.**

```bash
mkdir strapi-tests && cd strapi-tests
npm init -y
npm install --save-dev webship-js @webship-js/strapi-steps
npx init-webship-js
```

`npx init-webship-js` writes `cucumber.js`, `playwright.config.ts`, the `tests/`
folders with a first feature and the `npm test` scripts, and installs Chromium.
npm usually runs it already when it installs webship-js; a second run changes
nothing. Its first feature opens the site's root, which sends a visitor to the
admin's login page: it passes, and can stay.

**3. `cucumber.js`.** Replace the file with the wiring of the pack: the step
files of webship-js and of the pack, the tags that keep the assertions that must
fail out of a normal run, the address of the app, the browser messages that are
no error of the app, and the accounts (the JSON of [Test users](#test-users)).
The first lines are the starter's own: a feature named on the command line runs
alone (step 5).

```javascript
// A feature file or a scenario (file:line) named on the command line runs alone:
// cucumber-js 12 would add it to the paths below, so `paths` is left empty then.
const OPTIONS_WITH_A_VALUE = new Set([
  '-c', '--config', '-f', '--format', '--format-options', '--i18n-keywords',
  '-i', '--import', '-l', '--loader', '--language', '--name', '--order',
  '-p', '--profile', '--parallel', '--plugin', '--plugin-options',
  '-r', '--require', '--require-module', '--retry', '--retry-tag-filter',
  '--shard', '-t', '--tags', '--world-parameters',
]);

function commandLinePaths() {
  if (!/cucumber(-js|\.js)?$/.test(String(process.argv[1] || ''))) return [];
  const args = process.argv.slice(2);
  const paths = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith('-')) {
      if (OPTIONS_WITH_A_VALUE.has(args[i])) i += 1;
    } else {
      paths.push(args[i]);
    }
  }
  return paths;
}

module.exports = {
  default: {
    requireModule: ['tsx/cjs'],
    require: [
      'node_modules/webship-js/tests/step-definitions/**/*.js',
      'node_modules/@webship-js/strapi-steps/tests/step-definitions/**/*.js',
      'tests/step-definitions/**/*.js',
    ],
    paths: commandLinePaths().length ? [] : ['tests/features/**/*.feature'],
    // Work in progress and the assertions that must fail stay out of a normal run.
    tags: 'not @wip and not @must-fail',
    format: ['@cucumber/pretty-formatter', 'json:tests/reports/cucumber_report.json'],
    worldParameters: {
      launchUrl: process.env.LAUNCH_URL || 'https://strapisteps.ddev.site',
      // Where the admin is, and the account the test-entry steps work as (a Super Admin of `users`).
      adminPath: '/admin',
      dataAdmin: 'administrator',
      // No error of the app: the 404 of the optional features the admin asks for on every entry
      // (its preview, its AI translations), the 401 of the second logout request it sends, and a
      // request lost when the network of the machine changed.
      javascript: { mode: 'warn', levels: ['error'], ignore: 'the server responded with a status of 40[14]|net::ERR_NETWORK_CHANGED', beforeScenario: false, afterScenario: true },
      minWaitTime: { page: 3000, before_scenario: 0, after_scenario: 0, before_step: 0, after_step: 0 },
      users: {
        administrator: { email: 'administrator@example.com', password: 'dD.123123ddd' },
        editor: { email: 'editor@example.com', password: 'dD.123123ddd' },
        author: { email: 'author@example.com', password: 'dD.123123ddd' },
      },
    },
  },
};
```

On an app from the Webship Workspace (step 1) the accounts are the same; its
address goes in `LAUNCH_URL` (step 5).

On an app of your own, turn the admin's release notification off. Unless told
otherwise, the admin asks GitHub's API for the latest release of Strapi on every
page it opens; once GitHub's limit for the machine's address is reached, GitHub
answers 403 and the browser logs `Failed to load resource: the server responded
with a status of 403 ()` in nearly every scenario (a warning after the scenario,
with no address to tell it from a real refusal). The test app of both ways of
step 1 has it off already, in `src/admin/app.tsx`; build the admin again after
the change (`strapi build`):

```typescript
export default {
  config: {
    notifications: { releases: false },
  },
  bootstrap() {},
};
```

**4. A first feature**, `tests/features/first-run.feature`:

```gherkin
Feature: First run
  Scenario: The editor logs in to the admin
    Given I am not logged in
    When I log in as "editor" with the login form
    Then I should be logged in as "editor"

  Scenario: The editor finds articles in the list
    Given I am a logged in user with the "editor" user
    And I am on the "Article" list
    When I search the list for "river"
    Then the list should count 3 entries
```

The second scenario reads the sample articles that both ways of step 1 make.

**5. Run it.** Set `LAUNCH_URL` to the address of the app:
`https://strapisteps.ddev.site` for the build script's app,
`https://stsite.ddev.site` for the Workspace's.

```bash
LAUNCH_URL=https://strapisteps.ddev.site npm test
```

A green first run prints every step, then the summary (the scenarios above and
the starter's, passed) and the HTML report it wrote:

```
3 scenarios (3 passed)
9 steps (9 passed)
0m08.813s (executing steps: 0m08.778s)
[webship-js] HTML report → …/strapi-tests/tests/reports/cucumber_report.html
```

One feature runs alone when the command line names it (a scenario too, with
its line):

```bash
LAUNCH_URL=https://strapisteps.ddev.site npx cucumber-js tests/features/first-run.feature
```

From there, copy the features of [`tests/features/`](tests/features/) (they
also ship in the package, under
`node_modules/@webship-js/strapi-steps/tests/features/`, with the files they
upload in `tests/assets/`: copy that folder too). Together they use every step of
the pack. Each makes its own test entries and deletes them after it. They run as
they are on the app of either way of step 1.

### What the suite tests

The features of this repository run every step of the pack against the test
app, twice in a row in CI on every change, then the assertions that must fail:
a visitor sent to the login page, each account logging in through the form, a
refused login and an empty form, a session taken over, logging out; the list of
articles with its count, rows, slugs and statuses, a search that finds three and
one that finds none, sorting both ways and by id, a filter by status and one by
a relation, the columns shown and hidden, the third page and 20 entries per page,
the list in French; an article made with every kind of field, a relation and a
cover changed and taken out, a publication refused for an empty title, the
homepage changed and left without saving, a deletion; an article published,
changed ("Modified"), its published version read only, its changes discarded and
unpublished, a draft published, three articles unpublished, published and deleted
from the list; the components of an article, and components added, filled in,
moved and removed; an article's French filled in from its English, saved and
published; the folders and files of the Media Library, a file's details, an
upload with its alternative text and its deletion, a refused upload, a folder
made and deleted; the models of a collection type, a single type and a component,
read only; the plan, the admin roles and their permissions, the end-user roles,
the API tokens and the accounts; and what the editor, the administrator and the
author see and may do.

Every entry, file and folder a scenario makes is deleted after it: the suite
leaves the app as it found it.

Not tested: the admin's other languages (a few steps read the admin's English
words: "Create new entry", "Add filter", "Saved document"), releases, review
workflows and the other Enterprise features (the free edition has none), the
Content-Type Builder in development mode (where it changes the schema: a suite
never does), the media field's "Upload from device" and "Upload from URL" (the
steps upload in the Media Library itself), drag and drop with the mouse (the
steps move components with the keyboard, as the admin announces it), and the
public REST and GraphQL APIs (webship-js's own API steps cover them).

## Requirements

- Node.js 24 or later
- A webship-js 2.0 test project (webship-js 2.0.16 or later)
- A Strapi 5 app (5.63 or later) with accounts of the admin for the suite (a
  Super Admin among them, for the test-entry steps)

## Install

```bash
npm install --save-dev @webship-js/strapi-steps
```

## How the steps find things and wait

- **By what a person reads.** A content type by its display name as the Content
  Manager lists it ("Article"), an entry by its title in the list, a field by its
  label as the edit view shows it (the attribute's name: "title", "metaTitle";
  the "*" of a required field and a relation's count left out), a column by its
  heading, a filter as its tag reads ("Status is draft"), a component by its name
  ("Quote"), a dialog by its name ("Publish entries", "File details"), a menu item
  by its text. The admin's stable hooks are the fallback: the names of the inputs
  (`seo.metaTitle`), the editors' own markers (`data-slate-editor`,
  `.CodeMirror`), the sortable rows of the builder (`aria-roledescription`).
- **The admin's own signals, no fixed sleeps.** The admin is a single-page app:
  while a page loads it marks its main area busy (`aria-busy="true"`) and shows a
  loader ("Loading content"), and a list shows its loader in the table. The steps
  wait for those to end, and for the answer of the admin API call each action
  sends (the list request after a search, a sort or a filter, the save, the
  publish, discard and unpublish actions, the bulk actions, the upload, the
  relation search); then for what the admin shows of the outcome (its
  notification: "Saved document", "Published document"; the keyboard
  announcement of a moved component: "dropped. Final position in list: 3 of 3").
- **The admin's long timers.** The admin keeps timers that fire many minutes
  later (it renews its token after about 12 minutes and ends its session after
  30). webship-js's settle after a step counts every pending timer as work in
  progress, so on this admin it would wait out its whole budget after each step.
  The pack takes timers longer than five seconds out of that count, on every page
  of a scenario: a timer that fires minutes later is no work the page is doing.
- **The login limit.** The admin allows 5 logins of an account in 5 minutes from
  one address. An account that logged in once keeps its session for the rest of
  the run; the test-entry steps log in once per run; a login the admin refuses
  for the limit waits once for its window to end.
- **A cut request says so.** When the browser lost a request of the admin (a
  network change on the machine, another container starting), the step says the
  request was cut before the site answered, with a hint to run the scenario
  again (or to run the suite in the project's container), instead of blaming the
  scenario. A login is sent again once.
- **Failures say what was found.** `The list counts 24 entries, not 25.`,
  `The relation "category" does not list "Guides". It lists "News".`, with a hint
  on where to look.

## Accounts

The suite never creates or deletes an account. Accounts are configuration: list
the ones the app has in `worldParameters.users`, by a handle the scenarios use,
each with its `email` (the admin logs in with it) and `password`.
`worldParameters.dataAdmin` names the handle of a Super Admin: the test-entry
steps make and delete the test entries, files and folders as that account,
through the admin's own API, in a session of their own (the browser's session is
never touched).

An account that logged in once keeps its session for the rest of the run
(`reuseSessions: false` turns it off); a logout ends it.

## Test users

The accounts this repository's suite logs in as, exactly as `cucumber.js` lists
them in `worldParameters.users` (the default values; the `<HANDLE>_EMAIL` and
`<HANDLE>_PASSWORD` variables replace them). The build script creates them; the
Workspace's Strapi plugin creates the same three.

```json
{
  "administrator": { "email": "administrator@example.com", "password": "dD.123123ddd" },
  "editor": { "email": "editor@example.com", "password": "dD.123123ddd" },
  "author": { "email": "author@example.com", "password": "dD.123123ddd" }
}
```

`administrator` is a Super Admin (made with `strapi admin:create-user`); `editor`
has the role Editor (every entry of every content type, publishing included) and
`author` the role Author (the entries it made itself, no publishing), both made
through the admin's role API. Their names in the admin are "Administrator
Webship", "Editor Webship" and "Author Webship". They are placeholder credentials
of a throwaway test app, not of any real one.

## A test site

[`.github/scripts/build-ddev-site.sh`](.github/scripts/build-ddev-site.sh)
builds the app the suite of this repository runs against, in a generic DDEV
project with PostgreSQL 17:

- Node.js 24 in the web image (baked in, so the server has it before the
  container's daemons start); Strapi 5 supports Node.js 22 to 26;
- the app made with the official installer, `npx create-strapi@<STRAPI_VERSION>`
  (`latest` by default), with TypeScript, npm, no example, no git repository, the
  container's database (`db` / `db` / `db`), and `--skip-cloud`: no cloud login,
  no trial, no licence key;
- telemetry off (`STRAPI_TELEMETRY_DISABLED=true`, and `telemetryDisabled` in the
  app's `package.json`), the address of the app and the proxy in front of it in
  `config/server.ts`, no survey in the admin (`FLAG_NPS=false` in `.env`), and no
  release notification (`notifications.releases: false` in `src/admin/app.tsx`:
  the admin would ask GitHub's API for the latest release on every page);
- the content model, written as schema files: an Article collection type (a
  title, a slug, a summary, a rich text (blocks), a cover image, a category
  relation, a true/false field, and a dynamic zone of the components Quote, Rich
  text (Markdown) and Media), Draft and Publish on, localised; a Category
  collection type; a Homepage single type with a Seo component, Draft and
  Publish on, localised;
- the admin built for production (`strapi build`) and the server run in
  production by the web container as a daemon (`strapi start`), the router
  sending the project's address to its port: in production the Content-Type
  Builder only reads;
- the accounts, French beside English (given to the Editor and Author roles,
  which the app made with English only), and the sample content, through the
  admin's own API: 4 categories, 24 articles (published, drafts, and three
  "Modified"; 5 with a French version; one with a cover and three components),
  the homepage in both locales, 5 images (2 in the folder "Covers").

[`site/strapi-site.mjs`](site/strapi-site.mjs) writes all of it: the same script
the Webship Workspace's Strapi plugin runs. Run again with `ACCOUNTS_ONLY=1` and
the same `SITE_DIR`, the build script gives the accounts back their name,
password, role and active state; with `SEED_ONLY=1`, the sample content.

## Steps

108 steps in 8 files, every one with five examples in its JSDoc (`npm run test:examples` checks them).

| File | Steps | Covers |
| --- | --- | --- |
| `strapi-session.steps.js` | 9 | The session: logging in by a handle or through the form, a refused login, a visitor, logging out, who is signed in, the login page. |
| `strapi-admin.steps.js` | 11 | The main navigation and the settings menu, the settings lists, a role's permissions, an API token's type, an account's role, the plan, a refused address. |
| `strapi-list.steps.js` | 31 | The list: its count, rows, columns, cells and statuses, the search, sorting, the filters, the columns shown, the pages, the locale, the selection and the bulk actions, opening and making an entry. |
| `strapi-edit.steps.js` | 27 | The edit view: every kind of field, the relation and media pickers, saving, publishing, unpublishing, discarding, deleting, the status, the notifications, the field errors, the published version, the locales. |
| `strapi-zone.steps.js` | 6 | The dynamic zone: adding, filling in, moving, removing components, and what it holds. |
| `strapi-media.steps.js` | 14 | The Media Library: its folders, uploads, a refused upload, folders made and deleted, a file's details. |
| `strapi-builder.steps.js` | 4 | The Content-Type Builder, read only: a model's fields, a dynamic zone's components, no change allowed. |
| `strapi-data.steps.js` | 6 | Test entries made through the admin's API and deleted after the scenario; an entry or a file that must or must not be there. |
| `strapi-helpers.js` | | Shared plumbing: the addresses of the admin, the waits on its loading states and its API calls, the notifications, the users registry and the session cache, the fields by their labels, the list, the edit view, the dynamic zone, the cut request, the test-data client. It registers no step. |

Text, links, buttons, the status code of a page and the accessibility checks are webship-js's own steps (`I should see "..."`, `I click "Delete"`, `the page should have a main landmark`); this pack adds what the admin decides.

### `strapi-session.steps.js` (9)

- `Given I am a logged in user with the "editor" user`
- `Given I am not logged in`
- `When I log in as "editor" with the login form`
- `When I log in with the email "nobody@example.com" and the password "Wrong-password-1"`
- `Then the login should be refused with "Invalid credentials"`
- `When I log out`
- `Then I should be logged in`
- `Then I should not be logged in`
- `Then I should be on the admin login page`

### `strapi-admin.steps.js` (11)

- `When I go to the "Settings" section`
- `Then the main navigation should list "Content-Type Builder"`
- `When I go to the settings page "API Tokens"`
- `Then the settings menu should list "API Tokens"`
- `Then the plan of the site should be "Community"`
- `Then the settings list should show "Read Only"`
- `When I open "Editor" from the settings list`
- `Then the role should allow "Publish" on "Article"`
- `Then the API token should be "Read-only"`
- `Then the account "editor" should have the role "Editor"`
- `Then I should not be allowed to open "/admin/settings/roles"`

### `strapi-list.steps.js` (31)

- `Given I am on the "Article" list`
- `Then the list should count 24 entries`
- `Then the list should show "Harbour lights at dusk"`
- `Then the list should show the entries:`
- `Then the list should have 10 rows`
- `Then the "Harbour lights at dusk" row should show "harbour-lights-at-dusk" in the "slug" column`
- `Then the status of "Harbour lights at dusk" in the list should be "Published"`
- `When I search the list for "river"`
- `When I clear the search of the list`
- `When I sort the list by "title"`
- `Then the first row of the list should be "A city that walks"`
- `When I filter the list where "Status" "is" "Draft (never published)"`
- `Then the list should have the filter "Status is draft"`
- `When I remove the filter "Status is draft"`
- `When I show the "category" column`
- `When I reset the columns of the list`
- `Then the list should have the column "category"`
- `When I go to page 2 of the list`
- `Then the list should be on page 2`
- `Then the list should have 3 pages`
- `When I show 20 entries per page`
- `When I switch the list to "French (fr)"`
- `When I select "Bulk test article one" in the list`
- `When I select all entries on the page`
- `Then the selection should read "2 entries selected"`
- `Then the selection should offer "Publish"`
- `When I publish the selected entries`
- `When I unpublish the selected entries`
- `When I open "Harbour lights at dusk" from the list`
- `When I create a new entry from the list`
- `Then the list should be empty`

### `strapi-edit.steps.js` (27)

- `When I open the "Homepage" single type`
- `When I create a new "Article" entry`
- `When I set "title" to "Editor test article"`
- `When I set these fields:`
- `Then "title" should be set to "Editor test article"`
- `When I regenerate the "slug"`
- `When I choose "Guides" in the "category" relation`
- `When I remove "Guides" from the "category" relation`
- `Then the "category" relation should list "Guides"`
- `When I choose the asset "meadow.png" for "cover"`
- `When I remove the asset "meadow.png" from "cover"`
- `Then "cover" should hold the asset "meadow.png"`
- `When I save the entry`
- `When I publish the entry`
- `When I unpublish the entry`
- `When I discard the changes of the entry`
- `When I delete the entry`
- `Then the status of the entry should be "Draft"`
- `Then I should see the notification "Saved document"`
- `Then the "title" field should show the error "This value is required."`
- `Then I should not be able to publish the entry`
- `When I view the published version of the entry`
- `Then the form should be read only`
- `When I switch the entry to "French (fr)"`
- `Then the entry should be in "French (fr)"`
- `When I fill the entry in from "English (en)"`
- `When I leave the entry without saving`

### `strapi-zone.steps.js` (6)

- `When I add the "Quote" component to "blocks"`
- `When I set "body" to "A quotation for the test." in the "Quote" component of "blocks"`
- `Then "body" should be set to "A quotation for the test." in the "Quote" component of "blocks"`
- `When I move the "Quote" component of "blocks" down`
- `When I remove the "Quote" component from "blocks"`
- `Then the "blocks" dynamic zone should hold "Quote", "Rich text" and "Media"`
### `strapi-media.steps.js` (14)

- `Given I am on the media library`
- `When I open the folder "Covers" in the media library`
- `Then the folder should count 2 items`
- `Then the media library should show "meadow.png"`
- `When I upload "test-lighthouse.png" to the media library`
- `Then the upload should be refused with "File is not a valid image"`
- `When I create the folder "Test folder" in the media library`
- `When I delete "test-lighthouse.png" from the media library`
- `When I open the details of "meadow.png"`
- `Then the "Dimensions" of the file should be "640 × 400"`
- `When I set "Alternative text" to "A lighthouse ring on blue" in the file details`
- `Then "Alternative text" should be set to "A lighthouse ring on blue" in the file details`
- `When I save the file details`
- `When I close the file details`

### `strapi-builder.steps.js` (4)

- `When I open the model of "Article"`
- `Then the model should have the fields:`
- `Then the "blocks" dynamic zone of the model should offer "Quote", "Rich text" and "Media"`
- `Then the model should not allow changes`

### `strapi-data.steps.js` (6)

- `Given there is an "Article" entry "Data step article"`
- `Given there is a published "Article" entry "Published test article"`
- `Given there is an "Article" entry "Table test article" with:`
- `Given there is no "Article" entry "Editor test article"`
- `Then there should be an "Article" entry "Editor test article"`
- `Then there should be a file "test-lighthouse.png" in the media library`

## Phrases shared with other packs

The session phrases are the ones every platform pack has, so a feature reads
the same on every system (one cucumber.js profile per system; the platform packs
are not meant to be loaded together). Loaded beside each of the 29 published
packs, these phrases of this pack also match one of theirs:

| Phrase of this pack | Also in |
| --- | --- |
| `I am a logged in user with the "editor" user` | codeigniter, django, django-cms, drupal-core, joomla, laravel, mediawiki, moodle, nextjs, odoo, symfony, typo3, wordpress |
| `I am not logged in` | django, django-cms, drupal-core, joomla, odoo, typo3, wordpress |
| `I log out` | codeigniter, django, django-cms, drupal-core, laravel, mediawiki, moodle, nextjs, odoo, symfony, typo3, wordpress |
| `I should be logged in` / `I should be logged in as "editor"` | backdrop-cms, codeigniter, django, django-cms, drupal-core, laravel, mediawiki, moodle, nextjs, odoo, symfony, typo3, wordpress |
| `I should not be logged in` | codeigniter, django, django-cms, drupal-core, laravel, mediawiki, moodle, nextjs, odoo, symfony, typo3, wordpress |
| `I log in as "editor" with the login form` | codeigniter, django, laravel, mediawiki, moodle, nextjs, symfony |
| `I log in with the email "…" and the password "…"` | codeigniter, laravel, nextjs |
| `the login should be refused with "…"` | django, mediawiki |
| `I should be on the admin login page` | django, joomla |
| `I should see the notification "…"` | craft-cms, ghost, laravel, odoo, prestashop, typo3 |
| `I search the list for "…"` | django, joomla |
| `I sort the list by "…"`, `the first row of the list should be "…"` | django, ghost, prestashop |
| `the list should have 3 pages`, `I go to page 2 of the list`, `the list should be on page 2` | django, ghost, symfony |
| `the list should have 10 rows` | django, prestashop |
| `I should not be allowed to open "…"` | django, django-cms |
| `I am on the "…" list`, `I open "…" from the list`, `the list should count … entries`, `the list should show "…"`, `the "…" row should show "…" in the "…" column`, `I select "…" in the list`, `the selection should read "…"`, `I set "…" to "…"`, `I set these fields:`, `"…" should be set to "…"` | django |

The Django admin pack shares the most: both test an admin, with a list, a form
and a session, and say it the same way. None matches a webship-js step, and none
matches a phrase of the component pack (Bootstrap) or of the Diffy pack, which
can be loaded beside this one.

## Testing this package

```bash
npm ci
npm run test:examples    # every step's JSDoc examples match it and nothing else; every feature step resolves
npm run test:paths       # a feature named on the command line runs alone
npx cucumber-js --dry-run
SITE_DIR="$PWD/../strapi-site" .github/scripts/build-ddev-site.sh
npx cucumber-js          # the whole suite
npm run test:must-fail   # the assertions that must fail, each with its message and a hint
```

## How the steps were written

Every step was written from a round of manual testing of a real local app in
the browser first: each screen it touches was opened as the account the step
works as, its roles, labels and messages noted, and the signal it gives while it
loads or saves found (its loader, its busy state, its API call, its
notification). The failures of the first runs went back to the browser before
the step changed.

## License

MIT, see [LICENSE](LICENSE).

## Logo

The Strapi logo in this README comes from Simple Icons 16.37.0 (CC0-1.0), filled
with the colour the set lists for the brand. The Strapi name and logo are
trademarks of their owner; this pack is not affiliated with or endorsed by them.
