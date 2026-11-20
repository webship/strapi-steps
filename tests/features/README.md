# Features

Reference features for the test site that `.github/scripts/build-ddev-site.sh`
builds (or the Webship Workspace's builder, with `--install --add-users
--sample-content`): an app made with the official installer, its content model
(an Article collection type with a dynamic zone, a Category collection type, a
Homepage single type with a component), two locales (English and French), the
sample content (24 articles, 4 categories, the homepage, 5 images, 2 of them in
the folder "Covers"), and the three accounts of `cucumber.js` (`administrator`,
`editor`, `author`). Each scenario makes the entries, files and folders it needs
and deletes them after it, so a feature runs as it is on any such site.

| Feature | Covers |
| --- | --- |
| `session` | A visitor sent to the login page, each account logging in through the form, a refused login, an empty form, a session taken over, logging out. |
| `list` | The count, the rows and their status, a search, sorting, the filters by status and by a relation, the columns, the pages and their size, the list in French. |
| `edit-view` | A new entry with every kind of field, a relation and a media field changed, a refused publication, the single type left without saving, a deletion. |
| `draft-and-publish` | Published, changed ("Modified"), the published version read only, the changes discarded, unpublished; a draft published; bulk unpublish, publish and delete from the list. |
| `dynamic-zone` | The components of an entry; adding, filling in, moving and removing components. |
| `locales` | An entry's French filled in from its English, saved and published; the list and an entry in French. |
| `media-library` | Folders and files, a file's details, an upload with its alternative text and its deletion, a refused upload, a folder made and deleted. |
| `content-type-builder` | The models of a collection type, a single type and a component, read only. |
| `settings` | The plan, the admin roles and their permissions, the end-user roles, the API tokens, the accounts and their roles. |
| `access` | What the editor, the administrator and the author see and may do. |

The assertions that must fail are in `tests/must-fail/` (`npm run test:must-fail`).
