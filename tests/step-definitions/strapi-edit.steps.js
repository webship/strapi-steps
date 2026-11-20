'use strict';

// The edit view of an entry: opening a single type or a new entry, every kind
// of field by its label (a text, a slug with its "Regenerate", a rich text, a
// true/false switch, a relation with its picker, a media field with the
// library's asset picker), saving, publishing, unpublishing, discarding the
// changes and deleting, the status of the entry ("Draft", "Published",
// "Modified"), the errors of a refused form, the notifications, the draft and
// published versions, the locales of the entry and filling one in from
// another, and leaving with unsaved changes. Each action waits for the admin
// API call it sends and for the admin's notification of its outcome.

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const {
  budget,
  clean,
  same,
  mentions,
  listed,
  hintFor,
  withApi,
  eventually,
  pageSummary,
  notifications,
  waitForNotification,
  forgetNotifications,
  openDialog,
  confirmDialog,
  openContentType,
  editViewReady,
  editViewOrFail,
  editForm,
  entryStatus,
  sidePanel,
  fieldErrors,
  findField,
  fieldOrFail,
  setField,
  readField,
  relationItems,
  mediaItems,
  chooseRelation,
  listReady,
  adminReady,
} = require('./strapi-helpers');

/** The admin API call that saves an entry: a POST (a new entry) or a PUT, not an action. */
function saveRequest(method, url) {
  return (method === 'POST' || method === 'PUT') && /\/content-manager\/(collection-types|single-types)\/api::[^?]*(\?|$)/.test(url) && !/\/actions\//.test(url);
}

/** The admin API call of an action of the edit view (publish, unpublish, discard). */
function actionRequest(action) {
  return (method, url) => method === 'POST' && new RegExp(`/content-manager/(collection-types|single-types)/[^?]*/actions/${action}(\\?|$)`).test(url);
}

/** The notification the admin shows after an action, or its validation notice: waited for and returned. */
async function outcome(world, wanted, timeout) {
  const page = world.page;
  const deadline = Date.now() + (timeout || budget(world));
  for (;;) {
    const seen = [...(world.__strapiToasts || []), ...(await notifications(page))];
    const hit = seen.find((t) => wanted.some((w) => mentions(t, w)));
    if (hit) return hit;
    if (Date.now() > deadline) return null;
    await page.waitForTimeout(100);
  }
}

const VALIDATION = 'There are validation errors in your document';

/**
 * Open a single type from the Content Manager's own navigation, as its
 * display name reads there, and wait for its edit view.
 *
 * Example #1: When I open the "Homepage" single type
 * Example #2: Given I open the "Homepage" single type
 * Example #3: And I open the "Homepage" single type
 * Example #4: When I open the "Homepage" single type
 * Example #5: Given I open the "Homepage" single type
 */
When(/^I open the "([^"]*)" single type$/, { timeout: 60000 }, async function (name) {
  const type = await openContentType(this, name);
  if (type.kind !== 'single') {
    throw friendly({ message: `"${name}" is a collection type: it has a list of entries.`, hint: `Open its list with: Given I am on the "${name}" list` });
  }
});

/**
 * Start a new entry of a collection type: its list, then "Create new entry".
 *
 * Example #1: When I create a new "Article" entry
 * Example #2: When I create a new "Category" entry
 * Example #3: And I create a new "Article" entry
 * Example #4: Given I create a new "Article" entry
 * Example #5: When I create a new "Category" entry
 */
When(/^I create a new "([^"]*)" entry$/, { timeout: 60000 }, async function (name) {
  const type = await openContentType(this, name);
  if (type.kind !== 'collection') {
    throw friendly({ message: `"${name}" is a single type: it has one entry, which opens with "I open the "${name}" single type".`, hint: 'New entries are made of collection types.' });
  }
  const link = this.page.getByRole('main').getByRole('link', { name: 'Create new entry', exact: true }).first();
  if (!(await link.count())) throw friendly({ message: `The "${name}" list offers no "Create new entry".`, hint: 'An account whose role may not create entries of this type has none.' });
  await link.click();
  await this.page.waitForURL(/\/create(\?|$)/, { timeout: budget(this) }).catch(() => {});
  await editViewReady(this);
});

/**
 * Set a field of the entry, found by its label (the attribute's name: the
 * "*" of a required field and a relation's count left out), the way a person
 * does for its kind: type into a text, switch a true/false field ("true" or
 * "false"), choose a relation's entry, type into a rich text (the blocks
 * editor or the Markdown editor; "\n" starts a new paragraph).
 *
 * Example #1: When I set "title" to "Editor test article"
 * Example #2: When I set "summary" to "A short summary of the test article."
 * Example #3: And I set "featured" to "true"
 * Example #4: When I set "content" to "A first paragraph.\nA second paragraph."
 * Example #5: When I set "metaTitle" to "Welcome, changed"
 */
When(/^I set "([^"]*)" to "([^"]*)"$/, { timeout: 60000 }, async function (label, value) {
  await editViewOrFail(this);
  await setField(this, editForm(this.page), label, value.replace(/\\n/g, '\n'));
});

/**
 * Set several fields of the entry, a label and a value per row of the table.
 *
 * Example #1: When I set these fields:
 * Example #2: And I set these fields:
 * Example #3: When I set these fields:
 * Example #4: Given I set these fields:
 * Example #5: When I set these fields:
 */
When(/^I set these fields:$/, { timeout: 120000 }, async function (table) {
  await editViewOrFail(this);
  for (const [label, value] of table.raw().filter((r) => r.length >= 2)) {
    await setField(this, editForm(this.page), label, String(value).replace(/\\n/g, '\n'));
  }
});

/**
 * A field of the entry shows a value: a text's text, "true" or "false" for a
 * switch, the entries of a relation, the files of a media field, the text of
 * a rich text.
 *
 * Example #1: Then "title" should be set to "Editor test article"
 * Example #2: Then "slug" should be set to "editor-test-article"
 * Example #3: And "featured" should be set to "true"
 * Example #4: Then "category" should be set to "Guides"
 * Example #5: Then "metaTitle" should be set to "Welcome to the city"
 */
Then(/^"([^"]*)" should be set to "([^"]*)"$/, async function (label, value) {
  await editViewOrFail(this);
  await eventually(this, () => readField(this, editForm(this.page), label), (v) => same(v, value),
    (v) => ({ message: `"${label}" is set to "${v}", not "${value}".`, hint: 'The field is read as the form shows it now (the draft, unless the published version is open).' }));
});

/**
 * Make a slug field again from the field it follows ("Regenerate"), and wait
 * for the admin's answer.
 *
 * Example #1: When I regenerate the "slug"
 * Example #2: And I regenerate the "slug"
 * Example #3: When I regenerate the "slug"
 * Example #4: Then I regenerate the "slug"
 * Example #5: When I regenerate the "slug"
 */
When(/^I regenerate the "([^"]*)"$/, async function (label) {
  await editViewOrFail(this);
  const field = await fieldOrFail(this, editForm(this.page), label);
  const button = field.box.getByRole('button', { name: 'Regenerate', exact: true });
  if (!(await button.count())) throw friendly({ message: `The field "${field.label}" has no "Regenerate": it is not a slug made from another field.`, hint: 'A slug (an attribute of the kind "uid") is regenerated from its target field.' });
  await withApi(this, (method, url) => method === 'POST' && /\/content-manager\/uid\/generate/.test(url), () => button.click(), { what: 'the new slug', required: true });
});

/**
 * Choose an entry in a relation field: type its name in the picker, wait for
 * the admin's search, choose it in the list it offers.
 *
 * Example #1: When I choose "Guides" in the "category" relation
 * Example #2: And I choose "News" in the "category" relation
 * Example #3: When I choose "Events" in the "category" relation
 * Example #4: When I choose "Opinion" in the "category" relation
 * Example #5: When I choose "Guides" in the "category" relation
 */
When(/^I choose "([^"]*)" in the "([^"]*)" relation$/, { timeout: 60000 }, async function (value, label) {
  await editViewOrFail(this);
  const field = await fieldOrFail(this, editForm(this.page), label);
  if (field.kind !== 'relation') throw friendly({ message: `The field "${field.label}" is not a relation (it is a ${field.kind} field).`, hint: 'A relation field has the picker "Add or create a relation".' });
  await chooseRelation(this, field, value);
});

/**
 * Take an entry out of a relation field (its "Remove" button).
 *
 * Example #1: When I remove "Guides" from the "category" relation
 * Example #2: And I remove "News" from the "category" relation
 * Example #3: When I remove "Events" from the "category" relation
 * Example #4: When I remove "Opinion" from the "category" relation
 * Example #5: When I remove "Guides" from the "category" relation
 */
When(/^I remove "([^"]*)" from the "([^"]*)" relation$/, async function (value, label) {
  await editViewOrFail(this);
  const field = await fieldOrFail(this, editForm(this.page), label);
  const items = field.box.locator('ol li, ul li').filter({ has: this.page.getByRole('button', { name: value, exact: true }) });
  if (!(await items.count())) throw friendly({ message: `The relation "${field.label}" lists no "${value}". It lists ${listed(await relationItems(field))}.`, hint: 'An entry of a relation is named by the text the relation shows for it.' });
  await items.first().getByRole('button', { name: 'Remove', exact: true }).click();
  await eventually(this, () => relationItems(field), (list) => !list.some((t) => same(t, value)),
    (list) => ({ message: `After "Remove", the relation "${field.label}" still lists ${listed(list)}.`, hint: 'The admin takes the entry out of the list under the field.' }));
});

/**
 * A relation field lists an entry, or does not.
 *
 * Example #1: Then the "category" relation should list "Guides"
 * Example #2: Then the "category" relation should not list "News"
 * Example #3: And the "category" relation should list "News"
 * Example #4: Then the "category" relation should not list "Guides"
 * Example #5: Then the "category" relation should list "Events"
 */
Then(/^the "([^"]*)" relation should (not )?list "([^"]*)"$/, async function (label, not, value) {
  await editViewOrFail(this);
  const field = await fieldOrFail(this, editForm(this.page), label);
  const want = !not;
  await eventually(this, () => relationItems(field), (list) => list.some((t) => same(t, value)) === want,
    (list) => ({ message: `The relation "${field.label}" ${want ? 'does not list' : 'lists'} "${value}". It lists ${listed(list)}.`, hint: 'The relation lists its entries under its picker.' }));
});

/**
 * Choose a file of the Media Library for a media field: "Add asset", then
 * "Browse library", the file by its name in the asset picker (its root, or a
 * folder named with "in the folder"), and "Confirm".
 *
 * Example #1: When I choose the asset "meadow.png" for "cover"
 * Example #2: When I choose the asset "harbour-cover.png" in the folder "Covers" for "cover"
 * Example #3: And I choose the asset "mountains.png" for "cover"
 * Example #4: When I choose the asset "sunset.png" for "file"
 * Example #5: When I choose the asset "river-cover.png" in the folder "Covers" for "cover"
 */
When(/^I choose the asset "([^"]*)"(?: in the folder "([^"]*)")? for "([^"]*)"$/, { timeout: 60000 }, async function (name, folder, label) {
  await editViewOrFail(this);
  const page = this.page;
  const field = await fieldOrFail(this, editForm(page), label);
  if (field.kind !== 'media') throw friendly({ message: `The field "${field.label}" is not a media field (it is a ${field.kind} field).`, hint: 'A media field has the button "Add asset".' });
  await field.box.getByRole('button', { name: 'Add asset', exact: true }).click();
  await withApi(this, (method, url) => method === 'GET' && /\/upload\/files\?/.test(url),
    () => page.getByRole('menuitem', { name: 'Browse library', exact: true }).click(), { what: 'the files of the Media Library' });
  const dialog = page.getByRole('dialog').filter({ has: page.getByRole('tablist', { name: 'Asset picker tabs' }) }).last();
  await dialog.waitFor({ state: 'visible', timeout: budget(this) });
  if (folder) {
    await withApi(this, (method, url) => method === 'GET' && /\/upload\/files\?/.test(url),
      () => dialog.getByRole('listitem').filter({ hasText: new RegExp(`^\\s*${folder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) }).first().click(), { what: `the folder "${folder}"` });
  }
  const box = dialog.getByRole('checkbox', { name: `Select ${name}`, exact: true });
  try {
    await box.waitFor({ state: 'visible', timeout: budget(this) });
  } catch {
    const offered = (await dialog.getByRole('checkbox').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label') || ''))).map((t) => clean(t).replace(/^Select /, '')).filter(Boolean);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click().catch(() => {});
    throw friendly({ message: `The asset picker shows no "${name}"${folder ? ` in the folder "${folder}"` : ''}. It shows ${listed(offered)}.`, hint: 'A file in a folder is chosen with: When I choose the asset "harbour-cover.png" in the folder "Covers" for "cover"' });
  }
  if ((await box.getAttribute('aria-checked')) !== 'true') await box.click();
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await dialog.waitFor({ state: 'hidden', timeout: budget(this) }).catch(() => {});
  await eventually(this, () => mediaItems(field), (files) => files.some((f) => same(f, name)),
    (files) => ({ message: `After "Confirm", the field "${field.label}" holds ${listed(files)}, not "${name}".`, hint: 'The field shows the chosen file with its name.' }));
});

/**
 * Take a file out of a media field (its "Remove <file>" button).
 *
 * Example #1: When I remove the asset "meadow.png" from "cover"
 * Example #2: And I remove the asset "harbour-cover.png" from "cover"
 * Example #3: When I remove the asset "sunset.png" from "file"
 * Example #4: When I remove the asset "mountains.png" from "cover"
 * Example #5: When I remove the asset "meadow.png" from "cover"
 */
When(/^I remove the asset "([^"]*)" from "([^"]*)"$/, async function (name, label) {
  await editViewOrFail(this);
  const field = await fieldOrFail(this, editForm(this.page), label);
  const button = field.box.getByRole('button', { name: `Remove ${name}`, exact: true });
  if (!(await button.count())) throw friendly({ message: `The field "${field.label}" holds no "${name}". It holds ${listed(await mediaItems(field))}.`, hint: 'A file is named by its file name.' });
  await button.click();
  await eventually(this, () => mediaItems(field), (files) => !files.some((f) => same(f, name)),
    (files) => ({ message: `After "Remove", the field "${field.label}" still holds ${listed(files)}.`, hint: 'The admin takes the file out of the field.' }));
});

/**
 * A media field holds a file, or holds none.
 *
 * Example #1: Then "cover" should hold the asset "meadow.png"
 * Example #2: Then "cover" should hold no asset
 * Example #3: And "cover" should hold the asset "harbour-cover.png"
 * Example #4: Then "file" should hold the asset "sunset.png"
 * Example #5: Then "cover" should hold no asset
 */
Then(/^"([^"]*)" should hold (?:the asset "([^"]*)"|no asset)$/, async function (label, name) {
  await editViewOrFail(this);
  const field = await fieldOrFail(this, editForm(this.page), label);
  await eventually(this, () => mediaItems(field), (files) => (name ? files.some((f) => same(f, name)) : files.length === 0),
    (files) => ({ message: `The field "${field.label}" holds ${listed(files)}${name ? `, not "${name}"` : ''}.`, hint: 'The field lists its files by their names.' }));
});

/**
 * Save the entry ("Save"), and wait for the admin's answer and its
 * notification ("Saved document"). A form the admin refuses before sending
 * it shows its errors and its notice instead: the next steps read them.
 *
 * Example #1: When I save the entry
 * Example #2: And I save the entry
 * Example #3: When I save the entry
 * Example #4: Then I save the entry
 * Example #5: When I save the entry
 */
When(/^I save the entry$/, { timeout: 60000 }, async function () {
  await editViewOrFail(this);
  const page = this.page;
  const button = sidePanel(page).getByRole('button', { name: 'Save', exact: true });
  if (!(await button.isEnabled())) {
    throw friendly({ message: '"Save" is off: the entry has no change to save.', hint: 'Change a field first: When I set "title" to "..."' });
  }
  forgetNotifications(this);
  await withApi(this, saveRequest, () => button.click(), { what: 'the save' });
  const said = await outcome(this, ['Saved document', VALIDATION, 'error', 'Warning'], budget(this));
  if (!said) throw friendly({ message: `After "Save" the admin said nothing: ${await pageSummary(this)}.`, hint: hintFor(this, 'The admin says "Saved document" after a save, or why it refused it.') });
  await editViewReady(this);
});

/**
 * Publish the entry ("Publish"), confirming the admin's question when it asks
 * one (an entry related to drafts), and wait for its answer and its
 * notification ("Published document"). A form the admin refuses shows its
 * errors and its notice instead: the next steps read them.
 *
 * Example #1: When I publish the entry
 * Example #2: And I publish the entry
 * Example #3: When I publish the entry
 * Example #4: Then I publish the entry
 * Example #5: When I publish the entry
 */
When(/^I publish the entry$/, { timeout: 60000 }, async function () {
  await editViewOrFail(this);
  const page = this.page;
  const button = sidePanel(page).getByRole('button', { name: 'Publish', exact: true });
  if (!(await button.isEnabled())) {
    throw friendly({ message: `"Publish" is off (the entry is "${await entryStatus(page)}").`, hint: 'A published entry with no change has nothing to publish; an account whose role may not publish has it off.' });
  }
  forgetNotifications(this);
  await withApi(this, actionRequest('publish'), async () => {
    await button.click();
    // An entry related to draft entries asks first.
    const dialog = await openDialog(page);
    if (dialog && (await dialog.getByRole('button', { name: 'Publish', exact: true }).count())) {
      await dialog.getByRole('button', { name: 'Publish', exact: true }).click();
    }
  }, { what: 'the publication' });
  const said = await outcome(this, ['Published document', VALIDATION, 'error'], budget(this));
  if (!said) throw friendly({ message: `After "Publish" the admin said nothing: ${await pageSummary(this)}.`, hint: hintFor(this, 'The admin says "Published document" after a publication, or why it refused it.') });
  await editViewReady(this);
});

/** Run an item of the side panel's "More document actions" menu. */
async function documentAction(world, item) {
  const page = world.page;
  const more = sidePanel(page).getByRole('button', { name: 'More document actions', exact: true });
  if (!(await more.isEnabled())) throw friendly({ message: '"More document actions" is off for this entry.', hint: 'A new entry that was never saved has no document actions.' });
  await more.click();
  const entry = page.getByRole('menuitem', { name: item, exact: true });
  if (!(await entry.count()) || (await entry.getAttribute('aria-disabled')) === 'true' || (await entry.getAttribute('data-disabled')) !== null) {
    const offered = (await page.getByRole('menuitem').evaluateAll((els) => els.map((e) => (e.textContent || '').trim() + (e.getAttribute('aria-disabled') === 'true' || e.hasAttribute('data-disabled') ? ' (off)' : '')))).map(clean);
    await page.keyboard.press('Escape');
    throw friendly({ message: `"More document actions" has no "${item}" that can be used. It offers: ${listed(offered)}.`, hint: '"Discard changes" is off while the draft has no change; "Unpublish" needs a published entry.' });
  }
  return entry;
}

/**
 * Unpublish the entry ("More document actions" > "Unpublish"), confirming the
 * admin's question when it asks one, and wait for its answer and its
 * notification ("Unpublished document").
 *
 * Example #1: When I unpublish the entry
 * Example #2: And I unpublish the entry
 * Example #3: When I unpublish the entry
 * Example #4: Then I unpublish the entry
 * Example #5: When I unpublish the entry
 */
When(/^I unpublish the entry$/, { timeout: 60000 }, async function () {
  await editViewOrFail(this);
  const page = this.page;
  const entry = await documentAction(this, 'Unpublish');
  forgetNotifications(this);
  await withApi(this, actionRequest('unpublish'), async () => {
    await entry.click();
    // A modified entry asks what becomes of its draft: the admin's first choice stays.
    const dialog = await openDialog(page);
    if (dialog) {
      const confirm = dialog.getByRole('button', { name: /^(Confirm|Unpublish)$/ });
      if (await confirm.count()) await confirm.first().click();
    }
  }, { what: 'the unpublication', required: true });
  const said = await outcome(this, ['Unpublished document', 'error'], budget(this));
  if (!said) throw friendly({ message: `After "Unpublish" the admin said nothing: ${await pageSummary(this)}.`, hint: hintFor(this, 'The admin says "Unpublished document".') });
  await editViewReady(this);
});

/**
 * Discard the changes of the draft ("More document actions" > "Discard
 * changes", then "Confirm"): the draft goes back to what is published.
 *
 * Example #1: When I discard the changes of the entry
 * Example #2: And I discard the changes of the entry
 * Example #3: When I discard the changes of the entry
 * Example #4: Then I discard the changes of the entry
 * Example #5: When I discard the changes of the entry
 */
When(/^I discard the changes of the entry$/, { timeout: 60000 }, async function () {
  await editViewOrFail(this);
  const entry = await documentAction(this, 'Discard changes');
  await entry.click();
  forgetNotifications(this);
  await withApi(this, actionRequest('discard'), async () => {
    if (!(await confirmDialog(this, 'Confirm', budget(this)))) throw friendly({ message: '"Discard changes" asked no confirmation.', hint: 'The admin asks "Are you sure you want to discard the changes?".' });
  }, { what: 'the discarding of the changes', required: true });
  const said = await outcome(this, ['Changes discarded', 'error'], budget(this));
  if (!said) throw friendly({ message: `After "Discard changes" the admin said nothing: ${await pageSummary(this)}.`, hint: hintFor(this, 'The admin says "Changes discarded".') });
  await editViewReady(this);
});

/**
 * Delete the entry ("More actions" > "Delete entry", in every locale, or in
 * the locale shown with "in this locale only"), confirm, and wait for the list.
 *
 * Example #1: When I delete the entry
 * Example #2: When I delete the entry in this locale only
 * Example #3: And I delete the entry
 * Example #4: When I delete the entry
 * Example #5: When I delete the entry in this locale only
 */
When(/^I delete the entry( in this locale only)?$/, { timeout: 60000 }, async function (only) {
  await editViewOrFail(this);
  const page = this.page;
  await page.getByRole('main').getByRole('button', { name: 'More actions', exact: true }).first().click();
  const items = (await page.getByRole('menuitem').evaluateAll((els) => els.map((e) => (e.textContent || '').trim()))).map(clean);
  const name = items.find((t) => (only ? /^Delete entry \((?!all locales)/.test(t) : /^Delete entry( \(all locales\))?$/.test(t)))
    || items.find((t) => /^Delete( entry| document)?$/.test(t));
  if (!name) {
    await page.keyboard.press('Escape');
    throw friendly({ message: `"More actions" offers no way to delete this entry${only ? ' in this locale only' : ''}. It offers: ${listed(items)}.`, hint: 'An account whose role may not delete entries of this type has no "Delete entry".' });
  }
  await page.getByRole('menuitem', { name, exact: true }).click();
  forgetNotifications(this);
  await withApi(this, (method, url) => method === 'DELETE' && /\/content-manager\/(collection-types|single-types)\//.test(url), async () => {
    if (!(await confirmDialog(this, 'Confirm', budget(this)))) throw friendly({ message: '"Delete entry" asked no confirmation.', hint: 'The admin asks "Are you sure you want to delete this document?".' });
  }, { what: 'the deletion', required: true });
  const said = await outcome(this, ['Deleted document', 'error'], budget(this));
  if (!said) throw friendly({ message: `After "Delete entry" the admin said nothing: ${await pageSummary(this)}.`, hint: hintFor(this, 'The admin says "Deleted document".') });
  await adminReady(this);
  if (/\/collection-types\/[^/]+\/?$/.test(new URL(page.url()).pathname)) await listReady(this);
});

/**
 * The status of the entry in its edit view: "Draft", "Published" or
 * "Modified" (published, with changes in its draft).
 *
 * Example #1: Then the status of the entry should be "Draft"
 * Example #2: Then the status of the entry should be "Published"
 * Example #3: And the status of the entry should be "Modified"
 * Example #4: Then the status of the entry should be "Draft"
 * Example #5: Then the status of the entry should be "Published"
 */
Then(/^the status of the entry should be "([^"]*)"$/, async function (status) {
  await editViewOrFail(this);
  await eventually(this, () => entryStatus(this.page), (s) => same(s, status),
    (s) => ({ message: `The status of the entry is "${s || '(none)'}", not "${status}".`, hint: 'A published entry whose draft was saved with a change is "Modified".' }));
});

/**
 * The admin showed a notification with this text since the step before the
 * last action ("Saved document", "Published document", "Changes discarded",
 * "Deleted document", a refusal).
 *
 * Example #1: Then I should see the notification "Saved document"
 * Example #2: Then I should see the notification "Published document"
 * Example #3: And I should see the notification "There are validation errors in your document. Please fix them before saving."
 * Example #4: Then I should see the notification "Changes discarded"
 * Example #5: Then I should see the notification "Deleted document"
 */
Then(/^I should see the notification "([^"]*)"$/, async function (text) {
  if (!(await waitForNotification(this, text, budget(this)))) {
    const seen = [...(this.__strapiToasts || []), ...(await notifications(this.page))];
    throw friendly({ message: `The admin showed no notification "${text}". It showed ${listed(seen)}.`, hint: hintFor(this, 'A notification appears at the top of the page for a few seconds after an action.') });
  }
});

/**
 * A field shows its error, under it ("This value is required."): in the edit
 * view after a refused publication, or in the login form.
 *
 * Example #1: Then the "title" field should show the error "This value is required."
 * Example #2: Then the "Email" field should show the error "This value is required."
 * Example #3: And the "slug" field should show the error "This attribute must be unique"
 * Example #4: Then the "Password" field should show the error "This value is required."
 * Example #5: Then the "metaTitle" field should show the error "This value is required."
 */
Then(/^the "([^"]*)" field should show the error "([^"]*)"$/, async function (label, message) {
  const page = this.page;
  await eventually(this, () => fieldErrors(page, page.locator('main')), (errors) => errors.some((e) => same(e.label, label) && mentions(e.error, message)),
    (errors) => ({ message: `The field "${label}" shows no error "${message}". The fields' errors: ${errors.length ? errors.map((e) => `${e.label}: "${e.error}"`).join(', ') : '(none)'}.`, hint: hintFor(this, 'The admin checks a required field when the entry is published (a draft may be saved without it).') }));
});

/**
 * Whether the account may publish the entry: its "Publish" is on or off.
 *
 * Example #1: Then I should not be able to publish the entry
 * Example #2: Then I should be able to publish the entry
 * Example #3: And I should not be able to publish the entry
 * Example #4: Then I should be able to publish the entry
 * Example #5: Then I should not be able to publish the entry
 */
Then(/^I should (not )?be able to publish the entry$/, async function (not) {
  await editViewOrFail(this);
  const want = !not;
  const button = sidePanel(this.page).getByRole('button', { name: 'Publish', exact: true });
  await eventually(this, async () => (await button.count()) > 0 && (await button.isEnabled()), (on) => on === want,
    async () => ({ message: `"Publish" is ${want ? 'off' : 'on'} for this entry (status "${await entryStatus(this.page)}").`, hint: want ? 'An entry with nothing new to publish has "Publish" off.' : 'The account\'s role may publish this content type.' }));
});

/**
 * Show the draft or the published version of the entry (its "draft" and
 * "published" tabs).
 *
 * Example #1: When I view the published version of the entry
 * Example #2: When I view the draft of the entry
 * Example #3: And I view the published version of the entry
 * Example #4: When I view the draft of the entry
 * Example #5: When I view the published version of the entry
 */
When(/^I view the (draft|published version) of the entry$/, async function (which) {
  await editViewOrFail(this);
  const name = which === 'draft' ? 'draft' : 'published';
  const tab = this.page.getByRole('main').getByRole('tab', { name, exact: true });
  if (!(await tab.isEnabled())) throw friendly({ message: `The entry has no ${which} to view: its "${name}" tab is off.`, hint: 'An entry that was never published has no published version.' });
  await tab.click();
  await eventually(this, () => tab.getAttribute('aria-selected'), (v) => v === 'true', () => ({ message: `The "${name}" tab did not open.`, hint: 'The tabs are above the form.' }));
  await adminReady(this);
});

/**
 * Every field of the form is read only (the published version of an entry).
 *
 * Example #1: Then the form should be read only
 * Example #2: And the form should be read only
 * Example #3: Then the form should be read only
 * Example #4: Then the form should be read only
 * Example #5: And the form should be read only
 */
Then(/^the form should be read only$/, async function () {
  await editViewOrFail(this);
  // What a person could change: not a hidden input, not the file input a media field keeps out of sight.
  const editable = await editForm(this.page).evaluate((root) => [...root.querySelectorAll('input:not([type="hidden"]):not([type="file"]), textarea, [contenteditable="true"]')]
    .filter((el) => !(el.disabled || el.readOnly || el.getAttribute('aria-disabled') === 'true' || el.getAttribute('aria-hidden') === 'true') && (el.offsetWidth || el.offsetHeight))
    .map((el) => el.getAttribute('name') || el.getAttribute('aria-label') || el.tagName.toLowerCase()));
  if (editable.length) {
    throw friendly({ message: `The form has fields that can be changed: ${listed(editable)}.`, hint: 'The published version of an entry is read only; the draft is the one edited.' });
  }
});

/** The locales of the entry's locale picker, as it offers them ("English (en) Published", "Create French (fr) locale"). */
async function localeOptions(world) {
  const page = world.page;
  await page.getByRole('main').getByRole('combobox', { name: 'Locales', exact: true }).click();
  const options = (await page.locator('[role="listbox"] [role="option"]').allInnerTexts().catch(() => [])).map(clean);
  return options;
}

/**
 * Switch the entry to another locale with its locale picker; a locale the
 * entry does not have yet opens empty, to be filled in.
 *
 * Example #1: When I switch the entry to "French (fr)"
 * Example #2: When I switch the entry to "English (en)"
 * Example #3: And I switch the entry to "French (fr)"
 * Example #4: When I switch the entry to "English (en)"
 * Example #5: When I switch the entry to "French (fr)"
 */
When(/^I switch the entry to "([^"]*)"$/, { timeout: 60000 }, async function (locale) {
  await editViewOrFail(this);
  const page = this.page;
  const combo = page.getByRole('main').getByRole('combobox', { name: 'Locales', exact: true });
  if (!(await combo.count())) throw friendly({ message: 'The entry has no locale picker: its content type is not localised.', hint: 'Only a localised content type has the picker "Locales".' });
  const options = await localeOptions(this);
  // An option reads the locale and its status ("English (en) Published"), or "Create French (fr) locale".
  const index = options.findIndex((o) => mentions(o, locale));
  if (index < 0) {
    await page.keyboard.press('Escape');
    throw friendly({ message: `The locale picker offers no "${locale}". It offers: ${listed(options)}.`, hint: 'An account sees only the locales its role may edit (Settings > Roles).' });
  }
  const code = (locale.match(/\(([^)]+)\)\s*$/) || [])[1] || '';
  await withApi(this, (method, url) => method === 'GET' && /\/content-manager\/(collection-types|single-types)\//.test(url) && (!code || url.includes(`locale=${code}`)),
    () => page.locator('[role="listbox"] [role="option"]').nth(index).click(), { what: `the entry in "${locale}"` });
  await editViewReady(this);
});

/**
 * The entry's locale picker shows a locale.
 *
 * Example #1: Then the entry should be in "French (fr)"
 * Example #2: Then the entry should be in "English (en)"
 * Example #3: And the entry should be in "French (fr)"
 * Example #4: Then the entry should be in "English (en)"
 * Example #5: Then the entry should be in "French (fr)"
 */
Then(/^the entry should be in "([^"]*)"$/, async function (locale) {
  await editViewOrFail(this);
  const combo = this.page.getByRole('main').getByRole('combobox', { name: 'Locales', exact: true });
  await eventually(this, async () => clean(await combo.innerText().catch(() => '')), (v) => mentions(v, locale),
    (v) => ({ message: `The entry's locale picker shows "${v || '(nothing)'}", not "${locale}".`, hint: 'Switch with: When I switch the entry to "French (fr)"' }));
});

/**
 * Fill the entry's current locale in from another locale ("Fill in from
 * another locale", the locale, "Yes, fill in"): its fields take that locale's
 * values, to be saved.
 *
 * Example #1: When I fill the entry in from "English (en)"
 * Example #2: And I fill the entry in from "English (en)"
 * Example #3: When I fill the entry in from "French (fr)"
 * Example #4: When I fill the entry in from "English (en)"
 * Example #5: When I fill the entry in from "French (fr)"
 */
When(/^I fill the entry in from "([^"]*)"$/, { timeout: 60000 }, async function (locale) {
  await editViewOrFail(this);
  const page = this.page;
  const button = page.getByRole('main').getByRole('button', { name: 'Fill in from another locale', exact: true });
  if (!(await button.isEnabled())) throw friendly({ message: '"Fill in from another locale" is off.', hint: 'It is on for a locale of a saved entry, when the entry has another locale.' });
  await button.click();
  const dialog = await eventually(this, () => openDialog(page, 'Confirmation'), (d) => !!d, () => ({ message: '"Fill in from another locale" opened no dialog.', hint: 'The admin asks which locale to fill the entry in from.' }), 5000);
  await dialog.getByRole('combobox', { name: 'Locale', exact: true }).click();
  const option = page.locator('[role="listbox"] [role="option"]').filter({ hasText: locale });
  if (!(await option.count())) {
    const offered = await page.locator('[role="listbox"] [role="option"]').allInnerTexts().catch(() => []);
    await page.keyboard.press('Escape');
    await dialog.getByRole('button', { name: 'No, cancel', exact: true }).click().catch(() => {});
    throw friendly({ message: `The entry cannot be filled in from "${locale}". It offers ${listed(offered)}.`, hint: 'Only a locale the entry has can fill another in.' });
  }
  await option.first().click();
  await withApi(this, (method, url) => method === 'GET' && /\/i18n\/content-manager\/get-fill-from-locale\//.test(url),
    () => dialog.getByRole('button', { name: 'Yes, fill in', exact: true }).click(), { what: `the values of "${locale}"`, required: true });
});

/**
 * Leave the entry with "Back" while it has unsaved changes, confirming the
 * admin's question ("Are you sure you want to leave this page? All your
 * modifications will be lost."): the changes are not saved.
 *
 * Example #1: When I leave the entry without saving
 * Example #2: And I leave the entry without saving
 * Example #3: When I leave the entry without saving
 * Example #4: Then I leave the entry without saving
 * Example #5: When I leave the entry without saving
 */
When(/^I leave the entry without saving$/, { timeout: 60000 }, async function () {
  await editViewOrFail(this);
  const page = this.page;
  const before = page.url();
  await page.getByRole('main').getByRole('link', { name: 'Back', exact: true }).click();
  const dialog = await eventually(this, () => openDialog(page, 'Confirmation'), (d) => !!d,
    () => ({ message: '"Back" asked nothing: the entry had no unsaved change.', hint: 'Change a field first; without a change, "Back" leaves at once.' }), 5000);
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await page.waitForURL((u) => u.toString() !== before, { timeout: budget(this) }).catch(() => {});
  await adminReady(this);
  if (/\/collection-types\/[^/]+\/?$/.test(new URL(page.url()).pathname)) await listReady(this);
});

void [findField];
