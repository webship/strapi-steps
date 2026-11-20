'use strict';

// Test data: a scenario makes the entries it needs, and the steps delete them
// after it, whatever happens in it. An entry is made through the admin's own
// API as the data administrator of the users registry, in a session of its
// own (the scenario's browser session is never touched). The entries, files
// and folders a scenario makes on screen are deleted after it too: the steps
// watch the admin's answers to the create, upload and new-folder requests.
//
// No step makes or deletes an account: accounts are configuration.

const { Given, Then, After, AfterAll } = require('@cucumber/cucumber');
const { friendly, onNewPage } = require('webship-js/tests/step-definitions/webship');
const {
  listed,
  same,
  watchNotifications,
  dataClient,
  contentTypeInfo,
  findEntries,
  deleteEntry,
  deleteEntriesNamed,
  localeCode,
  deleteFile,
  deleteFolder,
  findFiles,
  cleansUp,
  afterScenario,
  closeClients,
} = require('./strapi-helpers');

// ---------------------------------------------------------------------------
// Every page of a scenario: the requests the browser lost, the notifications,
// and what the scenario makes on screen
// ---------------------------------------------------------------------------

/** Delete an entry after the scenario. */
function deleteEntryAfter(world, uid, documentId) {
  if (!cleansUp(world) || !documentId) return;
  afterScenario(world, `entry:${uid}:${documentId}`, async () => { await deleteEntry(world, uid, documentId); });
}

/** Note what an answer of the admin says the scenario made: an entry, files, a folder. */
async function noteMade(world, response) {
  const request = response.request();
  if (request.method() !== 'POST' || response.status() !== 201 && response.status() !== 200) return;
  const url = new URL(response.url());
  const create = url.pathname.match(/\/content-manager\/collection-types\/([^/]+)(?:\/actions\/publish)?$/);
  if (create && response.status() === 201 || (create && /\/actions\/publish$/.test(url.pathname) && !/\/collection-types\/[^/]+\/[^/]+\/actions/.test(url.pathname))) {
    const json = await response.json().catch(() => null);
    const documentId = json && json.data && json.data.documentId;
    if (documentId) deleteEntryAfter(world, decodeURIComponent(create[1]), documentId);
    return;
  }
  if (/\/upload(\/files)?$/.test(url.pathname) && response.status() === 201) {
    const json = await response.json().catch(() => null);
    const files = Array.isArray(json) ? json : (json && (json.data || [json])) || [];
    for (const file of [].concat(files)) {
      if (file && file.id && cleansUp(world)) afterScenario(world, `file:${file.id}`, async () => { await deleteFile(world, file.id); });
    }
    return;
  }
  if (/\/upload\/folders$/.test(url.pathname) && response.status() === 201) {
    const json = await response.json().catch(() => null);
    const folder = json && (json.data || json);
    if (folder && folder.id && cleansUp(world)) afterScenario(world, `folder:${folder.id}`, async () => { await deleteFolder(world, folder.id); });
  }
}

/**
 * The admin keeps timers that fire many minutes later (its token is renewed after about 12 minutes,
 * its session ends after 30): webship-js's settle counts every pending timer as work in progress, so it
 * would wait out its whole budget after each step on every page of the admin. Timers longer than five
 * seconds are taken out of that count here: a timer that fires minutes later is no work the page is
 * doing now. The count of webship-js's own probe stays right whichever init script runs first.
 */
function ignoreLongTimers() {
  if (window.__webshipLongTimersIgnored || typeof window.setTimeout !== 'function') return;
  window.__webshipLongTimersIgnored = true;
  const previousSet = window.setTimeout;
  const previousClear = window.clearTimeout;
  const long = new Set();
  const counted = () => typeof window.__webshipPendingTimers === 'number';
  window.setTimeout = function (callback, delay, ...args) {
    if (!(Number(delay) > 5000) || !counted()) return previousSet.call(this, callback, delay, ...args);
    let id;
    const fire = function () {
      if (long.delete(id) && counted()) window.__webshipPendingTimers += 1;
      return typeof callback === 'function' ? callback.apply(this, args) : undefined;
    };
    id = previousSet.call(this, fire, delay);
    long.add(id);
    window.__webshipPendingTimers -= 1;
    return id;
  };
  window.clearTimeout = function (id) {
    if (long.delete(id) && counted()) window.__webshipPendingTimers += 1;
    return previousClear.call(this, id);
  };
}

onNewPage(async (world, page) => {
  await page.addInitScript(ignoreLongTimers).catch(() => {});
  world.__strapiFailedRequests = [];
  page.on('requestfailed', (r) => {
    const failure = r.failure();
    world.__strapiFailedRequests.push({ at: Date.now(), method: r.method(), url: r.url(), error: (failure && failure.errorText) || '' });
  });
  page.on('response', (response) => { noteMade(world, response).catch(() => {}); });
  await watchNotifications(world);
});

// ---------------------------------------------------------------------------
// Test entries
// ---------------------------------------------------------------------------

/** A value of a test-entry table as the admin's API takes it, for a field of the content type. */
async function apiValue(world, type, field, value) {
  const client = await dataClient(world);
  const { json } = await client.call('GET', `/content-manager/content-types/${type.uid}/configuration`);
  const attributes = (json && json.data && json.data.contentType && json.data.contentType.attributes) || null;
  let attribute = attributes && attributes[field];
  if (!attribute) {
    const init = await client.call('GET', '/content-manager/init');
    const schema = ((init.json && init.json.data && init.json.data.contentTypes) || []).find((t) => t.uid === type.uid);
    attribute = schema && schema.attributes && schema.attributes[field];
  }
  if (!attribute) return value;
  switch (attribute.type) {
    case 'boolean': return /^(yes|true|on|1)$/i.test(value);
    case 'integer': case 'biginteger': return parseInt(value, 10);
    case 'decimal': case 'float': return parseFloat(value);
    case 'blocks': return String(value).split(/\\n|\n/).map((line) => ({ type: 'paragraph', children: [{ type: 'text', text: line }] }));
    case 'relation': {
      const target = await contentTypeInfo(world, attribute.target);
      const names = String(value).split(/\s*,\s*/).filter(Boolean);
      const connect = [];
      for (const name of names) {
        const found = await findEntries(world, target.uid, name);
        if (!found.length) throw friendly({ message: `The relation "${field}" finds no "${target.displayName}" entry "${name}".`, hint: `Make it first, or name an entry the "${target.displayName}" list shows.` });
        connect.push({ documentId: found[0].documentId });
      }
      return { connect };
    }
    default: return value;
  }
}

/**
 * Make a test entry through the admin's API as the data administrator, in the
 * status asked ("draft", "published", or "modified": published, then changed),
 * and delete it after the scenario. Fields come from a table.
 */
async function makeEntry(world, typeName, title, status, rows) {
  const type = await contentTypeInfo(world, typeName);
  if (type.kind !== 'collectionType') {
    throw friendly({ message: `"${type.displayName}" is a single type: it has one entry, the build's; the test-data steps make entries of collection types.`, hint: 'Example: Given there is an "Article" entry "Data step article"' });
  }
  const client = await dataClient(world);
  // A stopped run can leave one with that name: it goes first.
  await deleteEntriesNamed(world, type.uid, title);
  const data = { [type.mainField]: title };
  let locale = null;
  for (const [field, value] of rows || []) {
    if (same(field, 'locale')) { locale = await localeCode(world, value); continue; }
    data[field] = await apiValue(world, type, field, value);
  }
  const query = type.localized ? `?locale=${encodeURIComponent(locale || 'en')}` : '';
  const { json } = await client.call('POST', `/content-manager/collection-types/${type.uid}${query}`, { data });
  const documentId = json && json.data && json.data.documentId;
  if (!documentId) throw friendly({ message: `The admin made no "${type.displayName}" entry "${title}": ${JSON.stringify(json).slice(0, 200)}.`, hint: 'Look at the fields of the table: each is a field of the content type.' });
  deleteEntryAfter(world, type.uid, documentId);
  if (status === 'published' || status === 'modified') {
    await client.call('POST', `/content-manager/collection-types/${type.uid}/${documentId}/actions/publish${query}`, { data: {} });
  }
  if (status === 'modified') {
    // A change to the draft after it was published: the first text field after the main one says so.
    const { json: conf } = await client.call('GET', `/content-manager/content-types/${type.uid}/configuration`);
    const attributes = (conf && conf.data && conf.data.contentType && conf.data.contentType.attributes) || {};
    const textField = Object.keys(attributes).find((k) => k !== type.mainField && ['text', 'string'].includes(attributes[k].type));
    if (!textField) throw friendly({ message: `"${type.displayName}" has no text field besides "${type.mainField}" to change, so its entry cannot be made "modified".`, hint: 'Make it published and change it in a step of the scenario.' });
    await client.call('PUT', `/content-manager/collection-types/${type.uid}/${documentId}${query}`, { data: { [textField]: `${title}: changed after it was published.` } });
  }
  return { uid: type.uid, documentId };
}

/**
 * Make a test entry of a collection type, a draft, through the admin's API as
 * the data administrator; it is deleted after the scenario, whatever happens.
 *
 * Example #1: Given there is an "Article" entry "Data step article"
 * Example #2: Given there is a "Category" entry "Data step category"
 * Example #3: And there is an "Article" entry "Locale test article"
 * Example #4: Given there is an "Article" entry "Bulk test article one"
 * Example #5: And there is an "Article" entry "Relation test article"
 */
Given(/^there is an? "([^"]*)" entry "([^"]*)"$/, { timeout: 120000 }, async function (type, title) {
  await makeEntry(this, type, title, 'draft');
});

/**
 * Make a test entry in a status: published, or modified (published, then
 * changed, so its draft differs from what is published).
 *
 * Example #1: Given there is a published "Article" entry "Published test article"
 * Example #2: Given there is a modified "Article" entry "Modified test article"
 * Example #3: And there is a published "Article" entry "Bulk test article two"
 * Example #4: Given there is a draft "Article" entry "Draft test article"
 * Example #5: And there is a published "Article" entry "Locale test article"
 */
Given(/^there is an? (draft|published|modified) "([^"]*)" entry "([^"]*)"$/, { timeout: 120000 }, async function (status, type, title) {
  const info = await contentTypeInfo(this, type);
  if (status !== 'draft' && !info.draftAndPublish) {
    throw friendly({ message: `"${info.displayName}" has no draft and publish: its entries are published as they are saved.`, hint: `Make it without a status: Given there is a "${info.displayName}" entry "${type}"` });
  }
  await makeEntry(this, type, title, info.draftAndPublish ? status : 'draft');
});

/**
 * Make a test entry with the fields of a table (a field and its value per
 * row; a relation by the names of the entries it holds, a true/false field by
 * "true" or "false", the locale by its name). A row "status" sets it
 * published or modified.
 *
 * Example #1: Given there is an "Article" entry "Table test article" with:
 * Example #2: Given there is a published "Article" entry "Table test article" with:
 * Example #3: And there is an "Article" entry "Category test article" with:
 * Example #4: Given there is a modified "Article" entry "Modified table article" with:
 * Example #5: Given there is a "Category" entry "Table test category" with:
 */
Given(/^there is an? (?:(draft|published|modified) )?"([^"]*)" entry "([^"]*)" with:$/, { timeout: 120000 }, async function (status, type, title, table) {
  const rows = table.raw().filter((r) => r.length >= 2);
  const info = await contentTypeInfo(this, type);
  await makeEntry(this, type, title, info.draftAndPublish ? (status || 'draft') : 'draft', rows);
});

/**
 * Make sure a content type has no entry with that name: delete it, as the
 * data administrator, when it is there (a run stopped half way can leave
 * one), and again after the scenario, whatever happens in it. For an entry
 * the scenario makes on screen.
 *
 * Example #1: Given there is no "Article" entry "Editor test article"
 * Example #2: And there is no "Article" entry "Author test article"
 * Example #3: Given there is no "Category" entry "Screen test category"
 * Example #4: Given there is no "Article" entry "Dynamic zone test article"
 * Example #5: And there is no "Article" entry "Validation test article"
 */
Given(/^there is no "([^"]*)" entry "([^"]*)"$/, { timeout: 120000 }, async function (type, title) {
  const info = await contentTypeInfo(this, type);
  await deleteEntriesNamed(this, info.uid, title);
  if (cleansUp(this)) afterScenario(this, `named:${info.uid}:${title}`, async () => { await deleteEntriesNamed(this, info.uid, title); });
});

/**
 * Check, as the data administrator, whether a content type has an entry with
 * that name (in any status; in a locale when one is named).
 *
 * Example #1: Then there should be an "Article" entry "Editor test article"
 * Example #2: Then there should be no "Article" entry "Bulk test article one"
 * Example #3: And there should be a "Category" entry "Screen test category"
 * Example #4: Then there should be an "Article" entry "Locale test article" in "French (fr)"
 * Example #5: Then there should be no "Article" entry "Deleted test article"
 */
Then(/^there should be (an?|no) "([^"]*)" entry "([^"]*)"(?: in "([^"]*)")?$/, { timeout: 60000 }, async function (which, type, title, locale) {
  const info = await contentTypeInfo(this, type);
  const code = locale ? await localeCode(this, locale) : (info.localized ? 'en' : null);
  const found = await findEntries(this, info.uid, title, code);
  if (which === 'no' && found.length) {
    throw friendly({ message: `There is ${found.length === 1 ? 'an' : found.length} "${info.displayName}" entry "${title}"${locale ? ` in ${locale}` : ''} (${found.map((f) => f.status).join(', ')}).`, hint: 'The entry was not deleted.' });
  }
  if (which !== 'no' && !found.length) {
    throw friendly({ message: `There is no "${info.displayName}" entry "${title}"${locale ? ` in ${locale}` : ''}.`, hint: 'The entry was not saved: look for an error notification on the screenshot of the failure.' });
  }
});

/**
 * Check, as the data administrator, whether the Media Library has a file
 * with that name (in any folder).
 *
 * Example #1: Then there should be a file "test-lighthouse.png" in the media library
 * Example #2: Then there should be no file "test-lighthouse.png" in the media library
 * Example #3: And there should be a file "meadow.png" in the media library
 * Example #4: Then there should be no file "broken-image.png" in the media library
 * Example #5: And there should be a file "harbour-cover.png" in the media library
 */
Then(/^there should be (a|no) file "([^"]*)" in the media library$/, { timeout: 60000 }, async function (which, name) {
  const found = await findFiles(this, name);
  if (which === 'no' && found.length) throw friendly({ message: `The Media Library has ${found.length} file(s) "${name}".`, hint: 'The file was not deleted, or the upload was not refused.' });
  if (which === 'a' && !found.length) throw friendly({ message: `The Media Library has no file "${name}".`, hint: 'The upload did not finish: look at the screenshot of the failure.' });
});

// ---------------------------------------------------------------------------
// After the scenario
// ---------------------------------------------------------------------------

After({ timeout: 180000 }, async function (scope) {
  const todo = (this.__strapiCleanUp || []).slice().reverse();
  this.__strapiCleanUp = [];
  const failed = [];
  for (const item of todo) {
    try {
      await item.fn();
    } catch (err) {
      failed.push(`${item.label}: ${String((err && err.message) || err).split('\n')[0]}`);
    }
  }
  if (failed.length) {
    const status = scope && scope.result && scope.result.status;
    process.stderr.write(`\n[strapi-steps] The clean-up after "${scope && scope.pickle ? scope.pickle.name : 'the scenario'}" left: ${listed(failed)}${status ? ` (the scenario ${String(status).toLowerCase()})` : ''}\n`);
  }
});

AfterAll(async function () {
  await closeClients();
});
