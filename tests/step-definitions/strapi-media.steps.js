'use strict';

// The Media Library: opening it, its folders (the tree beside it, a new
// folder, opening one, the count of a folder's files), uploading a file from
// the project's tests/assets folder and a refused upload, the files and
// folders it shows, a file's details (its file info, its fields, saving them)
// and deleting a file or a folder. Each action waits for the admin API call
// it sends; the files and folders a scenario makes are deleted after it.

const { Given, When, Then } = require('@cucumber/cucumber');
const { friendly, resolveAssetFile } = require('webship-js/tests/step-definitions/webship');
const {
  budget,
  clean,
  same,
  mentions,
  listed,
  hintFor,
  adminRoute,
  withApi,
  eventually,
  pageSummary,
  notifications,
  waitForNotification,
  forgetNotifications,
  openDialog,
  confirmDialog,
  requireLogin,
  adminReady,
  clearTooltips,
  setField,
  readField,
} = require('./strapi-helpers');

/** Whether the page is the Media Library. */
function onMediaLibrary(world) {
  return /^\/plugins\/upload/.test(adminRoute(world));
}

/** Wait until the Media Library shows a folder: its heading ("Home (3 items)") and no loader. */
async function libraryReady(world) {
  const page = world.page;
  await adminReady(world);
  await eventually(world, async () => clean(await page.getByRole('main').getByRole('heading', { level: 1 }).first().innerText({ timeout: 1000 }).catch(() => '')),
    (h) => /\(\d+ items?\)$/.test(h), async () => ({ message: `The Media Library did not show a folder: ${await pageSummary(world)}.`, hint: hintFor(world, 'Open it first: Given I am on the media library') }));
}

/** Fail unless the page is the Media Library, ready. */
async function libraryOrFail(world) {
  if (!onMediaLibrary(world)) {
    throw friendly({ message: `This step works in the Media Library, but ${await pageSummary(world)}.`, hint: 'Open it first: Given I am on the media library' });
  }
  await libraryReady(world);
}

/** The names of the files and folders the Media Library shows in the folder on screen. */
async function libraryItems(page) {
  return (await page.getByRole('main').getByRole('checkbox').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label') || '')))
    .map((t) => clean(t).replace(/^Select /, '')).filter((t) => t && !/^all/i.test(t));
}

/** The request that lists the files of a folder of the Media Library. */
function filesRequest(method, url) {
  return method === 'GET' && /\/upload\/files\?/.test(url);
}

/**
 * Open the Media Library from the main navigation, and wait for its home folder.
 *
 * Example #1: Given I am on the media library
 * Example #2: When I open the media library
 * Example #3: And I am on the media library
 * Example #4: Given I am on the media library
 * Example #5: When I open the media library
 */
Given(/^I (?:am on|open) the media library$/, { timeout: 60000 }, async function () {
  requireLogin(this);
  const page = this.page;
  const link = page.getByRole('navigation').first().getByRole('link', { name: 'Media Library', exact: true });
  if (!(await link.count())) throw friendly({ message: `The main navigation has no "Media Library": ${await pageSummary(this)}.`, hint: 'An account whose role may not read the files has no "Media Library".' });
  await withApi(this, filesRequest, async () => { await link.click(); await clearTooltips(page); }, { what: 'the files of the Media Library' });
  await page.waitForURL((u) => /\/plugins\/upload/.test(u.pathname), { timeout: budget(this) }).catch(() => {});
  await libraryReady(this);
  // The notice about the new Media Library is closed when it is there: it is no part of a test.
  const banner = page.getByRole('button', { name: 'Close the banner.', exact: true });
  if (await banner.isVisible().catch(() => false)) await banner.click();
});

/**
 * Open a folder of the Media Library from its folder tree (or "Home", its root
 * folder), and wait for its files.
 *
 * Example #1: When I open the folder "Covers" in the media library
 * Example #2: When I open the folder "Home" in the media library
 * Example #3: And I open the folder "Test folder" in the media library
 * Example #4: When I open the folder "Covers" in the media library
 * Example #5: When I open the folder "Home" in the media library
 */
When(/^I open the folder "([^"]*)" in the media library$/, { timeout: 60000 }, async function (name) {
  await libraryOrFail(this);
  const page = this.page;
  const tree = page.getByRole('navigation', { name: 'Media library folders' });
  const button = tree.getByRole('button', { name, exact: true });
  if (!(await button.count())) {
    const folders = (await tree.getByRole('button').allInnerTexts()).map(clean).filter((t) => t && !/^(Media library actions|Actions for |The folder )/.test(t));
    throw friendly({ message: `The Media Library has no folder "${name}". Its folders: ${listed(folders)}.`, hint: 'A folder is named as its tree shows it; "Home" is the root folder.' });
  }
  await withApi(this, filesRequest, () => button.first().click(), { what: `the files of "${name}"` });
  await libraryReady(this);
  await eventually(this, async () => clean(await page.getByRole('main').getByRole('heading', { level: 1 }).first().innerText()), (h) => h.toLowerCase().startsWith(name.toLowerCase()),
    (h) => ({ message: `The Media Library shows "${h}", not the folder "${name}".`, hint: 'The heading names the folder on screen.' }));
});

/**
 * The folder on screen counts its files ("Covers (2 items)": the files, not
 * the folders in it).
 *
 * Example #1: Then the folder should count 2 items
 * Example #2: Then the folder should count 3 items
 * Example #3: And the folder should count 4 items
 * Example #4: Then the folder should count 1 item
 * Example #5: Then the folder should count 0 items
 */
Then(/^the folder should count (\d+) items?$/, async function (n) {
  await libraryOrFail(this);
  const wanted = parseInt(n, 10);
  await eventually(this, async () => clean(await this.page.getByRole('main').getByRole('heading', { level: 1 }).first().innerText()),
    (h) => { const m = h.match(/\((\d+) items?\)$/); return !!m && parseInt(m[1], 10) === wanted; },
    (h) => ({ message: `The folder reads "${h}": not ${wanted} item${wanted === 1 ? '' : 's'}.`, hint: 'The count is of the files in the folder, not of its folders.' }));
});

/**
 * The Media Library shows a file or a folder in the folder on screen, or does not.
 *
 * Example #1: Then the media library should show "meadow.png"
 * Example #2: Then the media library should show "Covers"
 * Example #3: And the media library should not show "test-lighthouse.png"
 * Example #4: Then the media library should show "harbour-cover.png"
 * Example #5: Then the media library should not show "Test folder"
 */
Then(/^the media library should (not )?show "([^"]*)"$/, async function (not, name) {
  await libraryOrFail(this);
  const want = !not;
  await eventually(this, () => libraryItems(this.page), (items) => items.some((i) => same(i, name)) === want,
    (items) => ({ message: `The Media Library ${want ? 'does not show' : 'shows'} "${name}". The folder shows ${listed(items)}.`, hint: 'Only the folder on screen is read: open another with "I open the folder ... in the media library".' }));
});

/**
 * Upload a file of the project's tests/assets folder (or a path from the
 * project's root) into the folder on screen, and wait for the admin's answer.
 *
 * Example #1: When I upload "test-lighthouse.png" to the media library
 * Example #2: And I upload "test-lighthouse.png" to the media library
 * Example #3: When I upload "broken-image.png" to the media library
 * Example #4: When I upload "tests/assets/test-lighthouse.png" to the media library
 * Example #5: When I upload "test-lighthouse.png" to the media library
 */
When(/^I upload "([^"]*)" to the media library$/, { timeout: 90000 }, async function (file) {
  await libraryOrFail(this);
  const page = this.page;
  const path = resolveAssetFile(this, file);
  const input = page.locator('input[type="file"][multiple]').first();
  if (!(await input.count())) throw friendly({ message: 'The Media Library offers no upload here.', hint: 'An account whose role may not create files has no upload.' });
  forgetNotifications(this);
  this.__strapiUpload = await withApi(this, (method, url) => method === 'POST' && /\/upload(\/files)?(\?|$)/.test(url), () => input.setInputFiles(path), { what: `the upload of "${file}"`, required: true });
  await libraryReady(this);
});

/**
 * The last upload was refused: the admin's "Upload failed" dialog names the
 * file and why ("File is not a valid image"). The dialog is closed after.
 *
 * Example #1: Then the upload should be refused with "File is not a valid image"
 * Example #2: Then the upload should be refused with "File is not a valid image"
 * Example #3: And the upload should be refused with "File is not a valid image"
 * Example #4: Then the upload should be refused with "File is not a valid image"
 * Example #5: Then the upload should be refused with "File is not a valid image"
 */
Then(/^the upload should be refused with "([^"]*)"$/, async function (reason) {
  const page = this.page;
  const dialog = await eventually(this, () => openDialog(page, 'Upload failed'), (d) => !!d,
    async () => ({ message: `No "Upload failed" dialog: the upload was not refused (the admin answered ${this.__strapiUpload ? this.__strapiUpload.status() : 'nothing'}).`, hint: 'The admin refuses a file it cannot read as what its name says.' }));
  const text = clean(await dialog.innerText());
  await dialog.getByRole('button', { name: 'Close', exact: true }).click().catch(() => {});
  if (!mentions(text, reason)) {
    throw friendly({ message: `The upload was refused, but not with "${reason}": the dialog reads "${text}".`, hint: 'The dialog names each refused file and why.' });
  }
});

/**
 * Make a folder in the folder on screen ("New" > "New folder", its name,
 * "Create folder"), and wait for the admin's answer.
 *
 * Example #1: When I create the folder "Test folder" in the media library
 * Example #2: And I create the folder "Second test folder" in the media library
 * Example #3: When I create the folder "Test folder" in the media library
 * Example #4: When I create the folder "Covers" in the media library
 * Example #5: When I create the folder "Inner test folder" in the media library
 */
When(/^I create the folder "([^"]*)" in the media library$/, { timeout: 60000 }, async function (name) {
  await libraryOrFail(this);
  const page = this.page;
  await page.getByRole('main').getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New folder', exact: true }).click();
  const dialog = await eventually(this, () => openDialog(page, 'New folder'), (d) => !!d, () => ({ message: '"New folder" opened no dialog.', hint: 'The dialog asks for the folder\'s name.' }), 5000);
  await dialog.getByRole('textbox', { name: 'Folder name', exact: true }).fill(name);
  forgetNotifications(this);
  await withApi(this, (method, url) => method === 'POST' && /\/upload\/folders(\?|$)/.test(url), () => dialog.getByRole('button', { name: 'Create folder', exact: true }).click(), { what: `the folder "${name}"`, required: true });
  await libraryReady(this);
});

/**
 * Delete a file or a folder of the folder on screen (its "More actions" >
 * "Delete", or a folder's actions in the tree), confirm, and wait for the
 * admin's answer.
 *
 * Example #1: When I delete "test-lighthouse.png" from the media library
 * Example #2: When I delete "Test folder" from the media library
 * Example #3: And I delete "test-lighthouse.png" from the media library
 * Example #4: When I delete "Second test folder" from the media library
 * Example #5: When I delete "test-lighthouse.png" from the media library
 */
When(/^I delete "([^"]*)" from the media library$/, { timeout: 60000 }, async function (name) {
  await libraryOrFail(this);
  const page = this.page;
  const tree = page.getByRole('navigation', { name: 'Media library folders' });
  const folderActions = tree.getByRole('button', { name: `Actions for ${name}`, exact: true });
  if (await folderActions.count()) {
    await folderActions.first().click();
    await page.getByRole('menuitem', { name: 'Delete folder', exact: true }).click();
  } else {
    const item = page.getByRole('main').getByRole('listitem').filter({ has: page.getByRole('checkbox', { name: `Select ${name}`, exact: true }) });
    if (!(await item.count())) throw friendly({ message: `The folder on screen shows no "${name}". It shows ${listed(await libraryItems(page))}.`, hint: 'A file or a folder is named as the Media Library shows it.' });
    await item.first().hover();
    await item.first().getByRole('button', { name: 'More actions', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  }
  forgetNotifications(this);
  await withApi(this, (method, url) => method === 'POST' && /\/upload\/actions\/bulk-delete/.test(url) || method === 'DELETE' && /\/upload\//.test(url), async () => {
    if (!(await confirmDialog(this, 'Confirm', budget(this)))) throw friendly({ message: `Deleting "${name}" asked no confirmation.`, hint: 'The admin asks "Are you sure you want to delete the selected items?".' });
  }, { what: `the deletion of "${name}"`, required: true });
  await libraryReady(this);
});

/**
 * Open the details of a file of the folder on screen (its name), and wait for
 * its "File details" dialog.
 *
 * Example #1: When I open the details of "meadow.png"
 * Example #2: And I open the details of "test-lighthouse.png"
 * Example #3: When I open the details of "harbour-cover.png"
 * Example #4: When I open the details of "sunset.png"
 * Example #5: When I open the details of "mountains.png"
 */
When(/^I open the details of "([^"]*)"$/, { timeout: 60000 }, async function (name) {
  await libraryOrFail(this);
  const page = this.page;
  const button = page.getByRole('main').getByRole('button', { name, exact: true });
  if (!(await button.count())) throw friendly({ message: `The folder on screen shows no file "${name}". It shows ${listed(await libraryItems(page))}.`, hint: 'A file is named by its file name.' });
  await withApi(this, (method, url) => method === 'GET' && /\/upload\/files\/\d+/.test(url), () => button.first().click(), { what: `the details of "${name}"` });
  await eventually(this, () => openDialog(page, 'File details'), (d) => !!d, () => ({ message: `The details of "${name}" did not open.`, hint: 'The details open in the dialog "File details".' }));
});

/** The open "File details" dialog, or a failure. */
async function detailsOrFail(world) {
  const dialog = await openDialog(world.page, 'File details');
  if (!dialog) throw friendly({ message: 'No file\'s details are open.', hint: 'Open them first: When I open the details of "meadow.png"' });
  return dialog;
}

/**
 * A line of the open file's "File info": "Size", "Dimensions", "Extension",
 * "Created by", "Asset ID", "Creation date", "Last updated".
 *
 * Example #1: Then the "Dimensions" of the file should be "640 × 400"
 * Example #2: Then the "Extension" of the file should be "png"
 * Example #3: And the "Created by" of the file should be "Administrator Webship"
 * Example #4: Then the "Dimensions" of the file should be "320 × 200"
 * Example #5: Then the "Created by" of the file should be "Editor Webship"
 */
Then(/^the "([^"]*)" of the file should be "([^"]*)"$/, async function (term, value) {
  const dialog = await detailsOrFail(this);
  const info = await dialog.evaluate((d) => {
    const h = [...d.querySelectorAll('h1, h2, h3')].find((x) => /File info/i.test(x.textContent));
    const box = h ? h.parentElement : d;
    const pairs = {};
    box.querySelectorAll('div').forEach((div) => {
      const spans = [...div.children].filter((c) => c.tagName === 'SPAN');
      if (spans.length === 2) pairs[spans[0].textContent.trim()] = spans[1].textContent.trim();
    });
    return pairs;
  });
  const key = Object.keys(info).find((k) => same(k, term));
  if (!key) throw friendly({ message: `The file info has no "${term}". It has ${listed(Object.keys(info))}.`, hint: 'The lines of "File info" are named as the dialog shows them.' });
  const norm = (t) => clean(t).replace(/\s*[x×✕]\s*/gi, ' × ');
  if (norm(info[key]) !== norm(value)) {
    throw friendly({ message: `The file's "${key}" is "${info[key]}", not "${value}".`, hint: 'The dimensions read "width × height" in pixels.' });
  }
});

/**
 * Set a field of the open file's details ("File name", "Caption",
 * "Alternative text").
 *
 * Example #1: When I set "Alternative text" to "A lighthouse ring on blue" in the file details
 * Example #2: And I set "Caption" to "A test caption" in the file details
 * Example #3: When I set "File name" to "renamed-lighthouse.png" in the file details
 * Example #4: When I set "Alternative text" to "" in the file details
 * Example #5: When I set "Caption" to "" in the file details
 */
When(/^I set "([^"]*)" to "([^"]*)" in the file details$/, async function (label, value) {
  const dialog = await detailsOrFail(this);
  await setField(this, dialog, label, value, 'the file details');
});

/**
 * A field of the open file's details shows a value.
 *
 * Example #1: Then "Alternative text" should be set to "A lighthouse ring on blue" in the file details
 * Example #2: Then "File name" should be set to "meadow.png" in the file details
 * Example #3: And "Caption" should be set to "A test caption" in the file details
 * Example #4: Then "Alternative text" should be set to "A green meadow" in the file details
 * Example #5: Then "Location" should be set to "Home" in the file details
 */
Then(/^"([^"]*)" should be set to "([^"]*)" in the file details$/, async function (label, value) {
  const dialog = await detailsOrFail(this);
  await eventually(this, () => readField(this, dialog, label, 'the file details'), (v) => same(v, value),
    (v) => ({ message: `"${label}" of the file is "${v}", not "${value}".`, hint: 'The details show the file as it was saved last.' }));
});

/**
 * Save the open file's details ("Save changes"), and wait for the admin's answer.
 *
 * Example #1: When I save the file details
 * Example #2: And I save the file details
 * Example #3: When I save the file details
 * Example #4: Then I save the file details
 * Example #5: When I save the file details
 */
When(/^I save the file details$/, { timeout: 60000 }, async function () {
  const dialog = await detailsOrFail(this);
  const button = dialog.getByRole('button', { name: 'Save changes', exact: true });
  if (!(await button.isEnabled())) throw friendly({ message: '"Save changes" is off: the details have no change.', hint: 'Change a field first: When I set "Alternative text" to "..." in the file details' });
  await withApi(this, (method, url) => method === 'PUT' && /\/upload\/files\/\d+/.test(url), () => button.click(), { what: 'the details of the file', required: true });
});

/**
 * Close the open file's details ("Close").
 *
 * Example #1: When I close the file details
 * Example #2: And I close the file details
 * Example #3: When I close the file details
 * Example #4: Then I close the file details
 * Example #5: When I close the file details
 */
When(/^I close the file details$/, async function () {
  const dialog = await detailsOrFail(this);
  await dialog.getByRole('button', { name: 'Close', exact: true }).first().click();
  await dialog.waitFor({ state: 'hidden', timeout: budget(this) }).catch(() => {});
  await libraryReady(this);
});

void [notifications, waitForNotification];
