'use strict';

// The Content Manager's list of a collection type: opening it, its count, rows,
// columns and cells, the search, sorting, the filters and their tags, the
// columns shown, the pages and their size, the locale of the list, selecting
// rows, and the bulk actions (publish, unpublish, delete) with their
// confirmations. Every action that changes the list waits for the admin's
// answer to the list request it sends, then for the table to have its rows (or
// its empty state) again.

const { Given, When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const {
  budget,
  clean,
  normal,
  same,
  mentions,
  listed,
  quotedList,
  count,
  hintFor,
  CUT_HINT,
  withApi,
  eventually,
  pageSummary,
  waitForNotification,
  forgetNotifications,
  openDialog,
  confirmDialog,
  requireLogin,
  openContentType,
  listReady,
  listOrFail,
  listCount,
  listColumns,
  listRows,
  rowName,
  listRow,
  listRowOrFail,
  editViewReady,
  adminReady,
  isLoading,
} = require('./strapi-helpers');

/** The list request of the content type the page shows (a GET of its collection). */
function listRequest(world) {
  const uid = decodeURIComponent((world.page.url().match(/collection-types\/([^/?#]+)/) || [])[1] || '');
  return (method, url) => method === 'GET' && url.includes(`/content-manager/collection-types/${uid}?`);
}

/** Run an action that changes what the list shows, and wait for the list again. */
async function changeList(world, action, what) {
  await withApi(world, listRequest(world), action, { what });
  await listReady(world);
}

/** The query of the page's address, decoded. */
function query(world) {
  try {
    return new URL(world.page.url()).searchParams;
  } catch {
    return new URLSearchParams();
  }
}

/**
 * Open the list of a collection type from the Content Manager's own
 * navigation, as its display name reads there, and wait for its rows.
 *
 * Example #1: Given I am on the "Article" list
 * Example #2: When I open the "Article" list
 * Example #3: Given I am on the "Category" list
 * Example #4: And I open the "Category" list
 * Example #5: When I open the "Article" list
 */
Given(/^I (?:am on|open) the "([^"]*)" list$/, { timeout: 60000 }, async function (name) {
  const type = await openContentType(this, name);
  if (type.kind !== 'collection') {
    throw friendly({ message: `"${name}" is a single type: it has no list, only its entry.`, hint: `Open it with: When I open the "${name}" single type` });
  }
});

/**
 * The count above the list ("24 entries found"): the entries of the list with
 * its search and filters, in its locale.
 *
 * Example #1: Then the list should count 24 entries
 * Example #2: Then the list should count 1 entry
 * Example #3: And the list should count 0 entries
 * Example #4: Then the list should count 3 entries
 * Example #5: Then the list should count 5 entries
 */
Then(/^the list should count (\d+) entr(?:y|ies)$/, async function (n) {
  await listOrFail(this);
  const wanted = parseInt(n, 10);
  await eventually(this, () => listCount(this.page), (c) => c === wanted,
    async (c) => ({ message: `The list counts ${c === null ? 'nothing (no "... entries found" above it)' : `${c} entr${c === 1 ? 'y' : 'ies'}`}, not ${wanted}.`, hint: hintFor(this, 'The count is of the list with its search, its filters and its locale.') }));
});

/**
 * The list shows an entry, or does not, on its current page: a cell of a row
 * reads exactly that text (its title).
 *
 * Example #1: Then the list should show "Harbour lights at dusk"
 * Example #2: Then the list should not show "Market day in the square"
 * Example #3: And the list should show "A guide to river walks"
 * Example #4: Then the list should not show "Bulk test article one"
 * Example #5: Then the list should show "Lumières du port au crépuscule"
 */
Then(/^the list should (not )?show "([^"]*)"$/, async function (not, name) {
  await listOrFail(this);
  const want = !not;
  await eventually(this, async () => (await listRows(this.page)).map(rowName).concat((await listRows(this.page)).flatMap((r) => r.cells)),
    (cells) => cells.some((c) => same(c, name)) === want,
    async () => ({ message: `The list ${want ? 'does not show' : 'shows'} "${name}". It shows ${listed((await listRows(this.page)).map(rowName))}.`, hint: hintFor(this, 'Only the current page of the list is read: search the list or go to another page.') }));
});

/**
 * The entries the list shows on its current page, in their order, by the
 * text they are known by (their title).
 *
 * Example #1: Then the list should show the entries:
 * Example #2: Then the list should show these entries in this order:
 * Example #3: And the list should show the entries:
 * Example #4: Then the list should show the entries:
 * Example #5: Then the list should show these entries in this order:
 */
Then(/^the list should show (?:the|these) entries(?: in this order)?:$/, async function (table) {
  await listOrFail(this);
  const wanted = table.raw().map((r) => clean(r[0])).filter(Boolean);
  await eventually(this, async () => (await listRows(this.page)).map(rowName),
    (names) => names.length === wanted.length && names.every((n, i) => same(n, wanted[i])),
    async (names) => ({ message: `The list shows ${listed(names)}, not ${listed(wanted)} in that order.`, hint: hintFor(this, 'The rows are compared in their order on the current page.') }));
});

/**
 * How many rows the current page of the list has.
 *
 * Example #1: Then the list should have 10 rows
 * Example #2: Then the list should have 4 rows
 * Example #3: And the list should have 20 rows
 * Example #4: Then the list should have 1 row
 * Example #5: Then the list should have 3 rows
 */
Then(/^the list should have (\d+) rows?$/, async function (n) {
  await listOrFail(this);
  const wanted = parseInt(n, 10);
  await eventually(this, async () => (await listRows(this.page)).length, (c) => c === wanted,
    (c) => ({ message: `The list has ${c} row${c === 1 ? '' : 's'} on this page, not ${wanted}.`, hint: 'The page size is the "Entries per page" under the list (10 by default).' }));
});

/**
 * The cell of an entry's row in a column, by the column's heading.
 *
 * Example #1: Then the "Harbour lights at dusk" row should show "harbour-lights-at-dusk" in the "slug" column
 * Example #2: Then the "Harbour lights at dusk" row should show "News" in the "category" column
 * Example #3: And the "Choosing walking boots" row should show "Modified" in the "status" column
 * Example #4: Then the "A guide to river walks" row should show "English (en) (default), French (fr)" in the "Available in" column
 * Example #5: Then the "Harbour lights at dusk" row should show "Published" in the "status" column
 */
Then(/^the "([^"]*)" row should show "([^"]*)" in the "([^"]*)" column$/, async function (name, value, column) {
  await listOrFail(this);
  await eventually(this, async () => {
    const row = await listRow(this, name);
    return { row, columns: await listColumns(this.page) };
  }, ({ row }) => !!row && same(row.byColumn[normal(column)] || '', value), async ({ row, columns }) => {
    if (!row) return { message: `The list shows no "${name}". It shows ${listed((await listRows(this.page)).map(rowName))}.`, hint: 'Only the current page is read: search the list first.' };
    if (!(normal(column) in row.byColumn)) return { message: `The list has no column "${column}". Its columns: ${listed(columns)}.`, hint: 'Show a column with: When I show the "category" column' };
    return { message: `The "${name}" row shows "${row.byColumn[normal(column)]}" in the "${column}" column, not "${value}".`, hint: 'The cell is read as the list shows it.' };
  });
});

/**
 * The status of an entry in the list: "Draft", "Published" or "Modified"
 * (published, with changes in its draft).
 *
 * Example #1: Then the status of "Harbour lights at dusk" in the list should be "Published"
 * Example #2: Then the status of "Market day in the square" in the list should be "Draft"
 * Example #3: And the status of "Choosing walking boots" in the list should be "Modified"
 * Example #4: Then the status of "Bulk test article one" in the list should be "Published"
 * Example #5: Then the status of "Bulk test article two" in the list should be "Draft"
 */
Then(/^the status of "([^"]*)" in the list should be "([^"]*)"$/, async function (name, status) {
  await listOrFail(this);
  await eventually(this, async () => {
    const row = await listRow(this, name);
    if (!row) return { row: null };
    const text = clean(await row.locator.locator('[role="status"]').first().textContent({ timeout: 1000 }).catch(() => ''));
    return { row, text };
  }, ({ row, text }) => !!row && same(text, status), async ({ row, text }) => (row
    ? { message: `The status of "${name}" in the list is "${text || '(none)'}", not "${status}".`, hint: 'A published entry with changes in its draft is "Modified".' }
    : { message: `The list shows no "${name}". It shows ${listed((await listRows(this.page)).map(rowName))}.`, hint: 'Only the current page is read: search the list first.' }));
});

/**
 * Search the list with its search box, and wait for the list's answer.
 *
 * Example #1: When I search the list for "river"
 * Example #2: When I search the list for "harbour"
 * Example #3: And I search the list for "Bulk test article"
 * Example #4: When I search the list for "nothing at all like this"
 * Example #5: When I search the list for "Harbour lights"
 */
When(/^I search the list for "([^"]*)"$/, async function (text) {
  await listOrFail(this);
  const main = this.page.getByRole('main');
  const box = main.getByRole('searchbox').first();
  if (!(await box.count())) await main.getByRole('button', { name: 'Search', exact: true }).click();
  await box.waitFor({ state: 'visible', timeout: budget(this) });
  await box.fill(text);
  await changeList(this, () => box.press('Enter'), `the search for "${text}"`);
  if (query(this).get('_q') !== text) {
    throw friendly({ message: `The list did not search for "${text}": its address has ${query(this).get('_q') ? `the search "${query(this).get('_q')}"` : 'no search'}.`, hint: 'The search box of the list is above its table ("Search"); not the Content Manager\'s own search of the content types.' });
  }
});

/**
 * Clear the list's search (its "Clear" button), and wait for the list.
 *
 * Example #1: When I clear the search of the list
 * Example #2: And I clear the search of the list
 * Example #3: When I clear the search of the list
 * Example #4: Then I clear the search of the list
 * Example #5: When I clear the search of the list
 */
When(/^I clear the search of the list$/, async function () {
  await listOrFail(this);
  const clear = this.page.getByRole('main').getByRole('search').getByRole('button', { name: 'Clear', exact: true });
  if (!(await clear.count())) {
    throw friendly({ message: 'The list has no search to clear.', hint: 'Search it first: When I search the list for "river"' });
  }
  await changeList(this, () => clear.click(), 'the list without its search');
});

/**
 * Sort the list by a column, by clicking its heading until the list is sorted
 * the way asked (ascending unless "in descending order").
 *
 * Example #1: When I sort the list by "title"
 * Example #2: When I sort the list by "title" in descending order
 * Example #3: And I sort the list by "id" in ascending order
 * Example #4: When I sort the list by "slug"
 * Example #5: When I sort the list by "id" in descending order
 */
When(/^I sort the list by "([^"]*)"(?: in (ascending|descending) order)?$/, async function (column, order) {
  await listOrFail(this);
  const page = this.page;
  const want = order === 'descending' ? 'DESC' : 'ASC';
  const heads = page.getByRole('main').locator('table thead th');
  const columns = await listColumns(page);
  const index = columns.findIndex((c) => same(c, column));
  if (index < 0) throw friendly({ message: `The list has no column "${column}". Its columns: ${listed(columns)}.`, hint: 'A column is named by its heading (the attribute\'s name).' });
  const sorted = () => {
    const sort = query(this).get('sort') || '';
    const [field, dir] = sort.split(':');
    return same(field, column) && (dir || 'ASC').toUpperCase() === want;
  };
  for (let attempt = 0; attempt < 3 && !sorted(); attempt += 1) {
    await changeList(this, () => heads.nth(index + 1).click(), `the list sorted by "${column}"`);
  }
  if (!sorted()) {
    throw friendly({ message: `The list is not sorted by "${column}" in ${order || 'ascending'} order: its address has the sort "${query(this).get('sort') || '(none)'}".`, hint: 'Only some columns sort: a relation or a rich text does not.' });
  }
});

/**
 * The first row of the list's current page is an entry (by its title).
 *
 * Example #1: Then the first row of the list should be "A city that walks"
 * Example #2: Then the first row of the list should be "Why the old bridge matters"
 * Example #3: And the first row of the list should be "Harbour lights at dusk"
 * Example #4: Then the first row of the list should be "Lantern parade along the river"
 * Example #5: Then the first row of the list should be "The river festival returns"
 */
Then(/^the first row of the list should be "([^"]*)"$/, async function (name) {
  await listOrFail(this);
  await eventually(this, async () => (await listRows(this.page)).map(rowName), (names) => names.length > 0 && same(names[0], name),
    (names) => ({ message: `The first row of the list is ${names.length ? `"${names[0]}"` : 'missing (the list is empty)'}, not "${name}".`, hint: 'The order is the list\'s sort: the address shows it (sort=title:ASC).' }));
});

/**
 * Filter the list: a field, an operator and a value, as the list's "Filters"
 * form offers them ("Status" "is" "Draft (never published)", "title"
 * "contains (case insensitive)" "harbour", "category" "is" "Guides").
 *
 * Example #1: When I filter the list where "Status" "is" "Draft (never published)"
 * Example #2: When I filter the list where "title" "contains (case insensitive)" "harbour"
 * Example #3: And I filter the list where "category" "is" "Guides"
 * Example #4: When I filter the list where "featured" "is" "true"
 * Example #5: When I filter the list where "Status" "is" "Published (modified)"
 */
When(/^I filter the list where "([^"]*)" "([^"]*)" "([^"]*)"$/, async function (field, operator, value) {
  await listOrFail(this);
  const page = this.page;
  const before = page.url();
  await page.getByRole('main').getByRole('button', { name: 'Filters', exact: true }).click();
  const form = page.locator('[role="dialog"]').filter({ has: page.getByRole('button', { name: 'Add filter', exact: true }) }).last();
  await form.waitFor({ state: 'visible', timeout: budget(this) });
  const choose = async (combo, text, what) => {
    await combo.click();
    const option = page.locator('[role="listbox"] [role="option"]').filter({ hasText: new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i') });
    if (!(await option.count())) {
      await option.first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
    }
    if (!(await option.count())) {
      const offered = (await page.locator('[role="listbox"] [role="option"]').allInnerTexts()).map(clean).filter((t) => t && !/^Select /.test(t));
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      throw friendly({ message: `The filters offer no ${what} "${text}". They offer: ${listed(offered)}.`, hint: 'A filter is named as the list\'s "Filters" form shows it: the field ("Status", "title"), the operator ("is", "contains (case insensitive)"), the value.' });
    }
    await option.first().click();
  };
  await choose(form.getByRole('combobox', { name: 'Select field' }), field, 'field');
  await choose(form.getByRole('combobox', { name: 'Select filter' }), operator, 'operator');
  const valueBox = form.locator('input[name="value"], [role="combobox"]').filter({ hasNot: page.locator('[aria-label="Select field"], [aria-label="Select filter"]') });
  const control = form.locator('input[name="value"]');
  if (await control.count()) {
    if ((await control.getAttribute('type')) === 'checkbox') {
      if ((await control.isChecked()) !== /^(true|yes|on|1)$/i.test(value)) await control.click({ force: true });
    } else {
      await control.fill(value);
    }
  } else {
    const combos = form.getByRole('combobox');
    await choose(combos.nth(2), value, 'value');
  }
  void valueBox;
  await changeList(this, () => form.getByRole('button', { name: 'Add filter', exact: true }).click(), `the list filtered by "${field}"`);
  if (page.url() === before || !/filters/.test(decodeURIComponent(page.url()))) {
    throw friendly({ message: `The filter "${field}" ${operator} "${value}" was not added: the list's address has no filter.`, hint: 'The "Add filter" button stays off until the filter has a value.' });
  }
});

/** The filters the list shows above its table, as they read ("Status is draft"). */
async function filterTags(page) {
  return (await page.getByRole('main').locator('button[aria-label]').evaluateAll((bs) => bs
    .filter((b) => b.previousElementSibling && b.previousElementSibling.textContent && b.getAttribute('aria-label') === b.previousElementSibling.textContent.trim())
    .map((b) => b.getAttribute('aria-label')))).map(clean);
}

/**
 * The list shows a filter above its table, as it reads ("Status is draft",
 * "title $containsi harbour"), or does not.
 *
 * Example #1: Then the list should have the filter "Status is draft"
 * Example #2: Then the list should not have the filter "Status is draft"
 * Example #3: And the list should have the filter "category is Guides"
 * Example #4: Then the list should have the filter "title contains harbour"
 * Example #5: Then the list should not have the filter "category is Guides"
 */
Then(/^the list should (not )?have the filter "([^"]*)"$/, async function (not, name) {
  await listOrFail(this);
  const want = !not;
  await eventually(this, () => filterTags(this.page), (tags) => tags.some((t) => same(t, name)) === want,
    (tags) => ({ message: `The list ${want ? 'has no' : 'has the'} filter "${name}". Its filters: ${listed(tags)}.`, hint: 'A filter reads as the list shows it above its table.' }));
});

/**
 * Remove a filter of the list (its button above the table), and wait for the list.
 *
 * Example #1: When I remove the filter "Status is draft"
 * Example #2: When I remove the filter "category is Guides"
 * Example #3: And I remove the filter "title contains harbour"
 * Example #4: When I remove the filter "featured is true"
 * Example #5: When I remove the filter "Status is draft"
 */
When(/^I remove the filter "([^"]*)"$/, async function (name) {
  await listOrFail(this);
  const tags = await filterTags(this.page);
  const tag = tags.find((t) => same(t, name));
  if (!tag) throw friendly({ message: `The list has no filter "${name}". Its filters: ${listed(tags)}.`, hint: 'A filter reads as the list shows it above its table.' });
  await changeList(this, () => this.page.getByRole('main').getByRole('button', { name: tag, exact: true }).click(), `the list without the filter "${name}"`);
});

/** Open the list's "View settings" and give back its "Displayed fields" check boxes. */
async function viewSettings(world) {
  const page = world.page;
  const panel = page.locator('[role="dialog"]').filter({ hasText: 'Displayed fields' }).last();
  // A panel closed by the step before can still be on its way out: wait until it is gone, then open it.
  await panel.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
  await page.getByRole('main').getByRole('button', { name: 'View settings', exact: true }).click();
  await panel.waitFor({ state: 'visible', timeout: budget(world) });
  return panel;
}

/** Close the view settings and wait until they are gone. */
async function closeViewSettings(world) {
  const page = world.page;
  await page.keyboard.press('Escape');
  await page.locator('[role="dialog"]').filter({ hasText: 'Displayed fields' }).last().waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
}

/**
 * Show or hide a column of the list with its "View settings" (the "Displayed
 * fields" of the list), and wait for the table to show it.
 *
 * Example #1: When I show the "category" column
 * Example #2: When I hide the "summary" column
 * Example #3: And I show the "featured" column
 * Example #4: When I hide the "slug" column
 * Example #5: When I show the "updatedAt" column
 */
When(/^I (show|hide) the "([^"]*)" column$/, async function (action, column) {
  await listOrFail(this);
  const page = this.page;
  const panel = await viewSettings(this);
  const box = panel.getByRole('checkbox', { name: column, exact: true });
  if (!(await box.count())) {
    const offered = (await panel.getByRole('checkbox').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label') || (b.id && document.querySelector(`label[for="${b.id}"]`) || {}).textContent || ''))).map(clean).filter(Boolean);
    await page.keyboard.press('Escape');
    throw friendly({ message: `The list offers no column "${column}". Its view settings offer: ${listed(offered)}.`, hint: 'A column is named by its field, as the list\'s "View settings" show it.' });
  }
  const want = action === 'show';
  if (((await box.getAttribute('aria-checked')) === 'true') !== want) await box.click();
  await closeViewSettings(this);
  await eventually(this, () => listColumns(page), (cols) => cols.some((c) => same(c, column)) === want,
    (cols) => ({ message: `After "View settings", the list's columns are ${listed(cols)}: "${column}" is ${want ? 'missing' : 'still there'}.`, hint: 'The list draws the columns its view settings check.' }));
  await listReady(this);
});

/**
 * Put the list's columns back as its configuration has them ("Reset" of its
 * "View settings").
 *
 * Example #1: When I reset the columns of the list
 * Example #2: And I reset the columns of the list
 * Example #3: When I reset the columns of the list
 * Example #4: Then I reset the columns of the list
 * Example #5: When I reset the columns of the list
 */
When(/^I reset the columns of the list$/, async function () {
  await listOrFail(this);
  const panel = await viewSettings(this);
  await panel.getByRole('button', { name: 'Reset', exact: true }).click();
  await closeViewSettings(this);
  await listReady(this);
});

/**
 * The list has a column, by its heading, or does not.
 *
 * Example #1: Then the list should have the column "category"
 * Example #2: Then the list should not have the column "summary"
 * Example #3: And the list should have the column "status"
 * Example #4: Then the list should have the column "Available in"
 * Example #5: Then the list should not have the column "category"
 */
Then(/^the list should (not )?have the column "([^"]*)"$/, async function (not, column) {
  await listOrFail(this);
  const want = !not;
  await eventually(this, () => listColumns(this.page), (cols) => cols.some((c) => same(c, column)) === want,
    (cols) => ({ message: `The list ${want ? 'has no' : 'has the'} column "${column}". Its columns: ${listed(cols)}.`, hint: 'Show or hide one with: When I show the "category" column' }));
});

/** The pages of the list: { current, last } from its pagination. */
async function pagination(page) {
  return page.getByRole('main').getByRole('navigation', { name: 'Pagination' }).evaluate((nav) => {
    // A link reads "Go to page 3" to a screen reader and shows "3": the shown copy is left out.
    const name = (a) => {
      if (a.getAttribute('aria-label')) return a.getAttribute('aria-label');
      const copy = a.cloneNode(true);
      copy.querySelectorAll('[aria-hidden="true"]').forEach((e) => e.remove());
      return copy.textContent || '';
    };
    const links = [...nav.querySelectorAll('a')].map((a) => ({ label: name(a).trim(), current: a.getAttribute('aria-current') === 'true' || a.getAttribute('aria-current') === 'page' }));
    const numbers = links.map((l) => ({ ...l, n: parseInt((l.label.match(/page (\d+)/i) || [])[1] || '', 10) })).filter((l) => !Number.isNaN(l.n));
    const current = numbers.find((l) => l.current);
    return { current: current ? current.n : 1, last: numbers.length ? Math.max(...numbers.map((l) => l.n)) : 1 };
  }).catch(() => ({ current: 1, last: 1 }));
}

/**
 * Go to a page of the list with its pagination, and wait for its rows.
 *
 * Example #1: When I go to page 2 of the list
 * Example #2: When I go to page 3 of the list
 * Example #3: And I go to page 1 of the list
 * Example #4: When I go to page 2 of the list
 * Example #5: When I go to page 3 of the list
 */
When(/^I go to page (\d+) of the list$/, async function (n) {
  await listOrFail(this);
  const nav = this.page.getByRole('main').getByRole('navigation', { name: 'Pagination' });
  const link = nav.getByRole('link', { name: `Go to page ${n}`, exact: true });
  if (!(await link.count())) {
    const { last } = await pagination(this.page);
    throw friendly({ message: `The list has no page ${n}: it has ${last} page${last === 1 ? '' : 's'}.`, hint: 'The pages follow the count and the "Entries per page".' });
  }
  await changeList(this, () => link.click(), `page ${n} of the list`);
});

/**
 * The list is on a page of its pagination.
 *
 * Example #1: Then the list should be on page 2
 * Example #2: Then the list should be on page 1
 * Example #3: And the list should be on page 3
 * Example #4: Then the list should be on page 2
 * Example #5: Then the list should be on page 1
 */
Then(/^the list should be on page (\d+)$/, async function (n) {
  await listOrFail(this);
  const wanted = parseInt(n, 10);
  await eventually(this, () => pagination(this.page), (p) => p.current === wanted,
    (p) => ({ message: `The list is on page ${p.current} of ${p.last}, not on page ${wanted}.`, hint: 'Go there with: When I go to page 2 of the list' }));
});

/**
 * How many pages the list has, as its pagination shows them.
 *
 * Example #1: Then the list should have 3 pages
 * Example #2: Then the list should have 2 pages
 * Example #3: And the list should have 1 page
 * Example #4: Then the list should have 3 pages
 * Example #5: Then the list should have 2 pages
 */
Then(/^the list should have (\d+) pages?$/, async function (n) {
  await listOrFail(this);
  const wanted = parseInt(n, 10);
  await eventually(this, () => pagination(this.page), (p) => p.last === wanted,
    (p) => ({ message: `The list has ${p.last} page${p.last === 1 ? '' : 's'}, not ${wanted}.`, hint: 'The pages follow the count and the "Entries per page".' }));
});

/**
 * Show a number of entries per page ("Entries per page" under the list), and
 * wait for the list.
 *
 * Example #1: When I show 20 entries per page
 * Example #2: When I show 10 entries per page
 * Example #3: And I show 50 entries per page
 * Example #4: When I show 100 entries per page
 * Example #5: When I show 20 entries per page
 */
When(/^I show (\d+) entries per page$/, async function (n) {
  await listOrFail(this);
  const page = this.page;
  const combo = page.getByRole('main').getByRole('combobox', { name: 'Entries per page' });
  await combo.click();
  const option = page.locator('[role="listbox"] [role="option"]').filter({ hasText: new RegExp(`^\\s*${n}\\s*$`) });
  if (!(await option.count())) {
    await option.first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
  }
  if (!(await option.count())) {
    const offered = await page.locator('[role="listbox"] [role="option"]').allInnerTexts();
    await page.keyboard.press('Escape');
    throw friendly({ message: `"Entries per page" offers no ${n}. It offers: ${listed(offered)}.`, hint: 'The list offers 10, 20, 50 and 100.' });
  }
  await changeList(this, () => option.first().click(), `${n} entries per page`);
  if (query(this).get('pageSize') !== String(n)) {
    throw friendly({ message: `The list does not show ${n} entries per page: its address has the page size "${query(this).get('pageSize') || '(none)'}".`, hint: 'The page size is the "Entries per page" under the list.' });
  }
});

/**
 * Switch the list to another locale with its locale picker, and wait for the
 * list of that locale.
 *
 * Example #1: When I switch the list to "French (fr)"
 * Example #2: When I switch the list to "English (en)"
 * Example #3: And I switch the list to "French (fr)"
 * Example #4: When I switch the list to "English (en)"
 * Example #5: When I switch the list to "French (fr)"
 */
When(/^I switch the list to "([^"]*)"$/, async function (locale) {
  await listOrFail(this);
  const page = this.page;
  const combo = page.getByRole('main').getByRole('combobox', { name: 'Select a locale' });
  if (!(await combo.count())) throw friendly({ message: 'The list has no locale picker: its content type is not localised.', hint: 'Only a localised content type has one ("Select a locale").' });
  await combo.click();
  const option = page.locator('[role="listbox"] [role="option"]').filter({ hasText: new RegExp(`^\\s*${locale.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i') });
  if (!(await option.count())) await option.first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
  if (!(await option.count())) {
    const offered = await page.locator('[role="listbox"] [role="option"]').allInnerTexts();
    await page.keyboard.press('Escape');
    throw friendly({ message: `The list offers no locale "${locale}". It offers: ${listed(offered)}.`, hint: 'An account sees only the locales its role may read (Settings > Roles).' });
  }
  await changeList(this, () => option.first().click(), `the list in "${locale}"`);
});

/**
 * Select an entry's row in the list with its check box.
 *
 * Example #1: When I select "Bulk test article one" in the list
 * Example #2: And I select "Bulk test article two" in the list
 * Example #3: When I select "Harbour lights at dusk" in the list
 * Example #4: When I select "Bulk test article three" in the list
 * Example #5: And I select "A guide to river walks" in the list
 */
When(/^I select "([^"]*)" in the list$/, async function (name) {
  const row = await listRowOrFail(this, name);
  const box = row.locator.getByRole('checkbox').first();
  if ((await box.getAttribute('aria-checked')) !== 'true') await box.click();
  await eventually(this, () => box.getAttribute('aria-checked'), (v) => v === 'true',
    () => ({ message: `The row of "${name}" is not selected after a click on its check box.`, hint: 'The check box is the first cell of the row.' }), 5000);
});

/**
 * Select every row of the list's current page ("Select all entries").
 *
 * Example #1: When I select all entries on the page
 * Example #2: And I select all entries on the page
 * Example #3: When I select all entries on the page
 * Example #4: Then I select all entries on the page
 * Example #5: When I select all entries on the page
 */
When(/^I select all entries on the page$/, async function () {
  await listOrFail(this);
  const box = this.page.getByRole('main').locator('table thead').getByRole('checkbox', { name: 'Select all entries' });
  if ((await box.getAttribute('aria-checked')) !== 'true') await box.click();
  if ((await box.getAttribute('aria-checked')) !== 'true') await box.click();
});

/**
 * The selection the list reads above its table ("2 entries selected").
 *
 * Example #1: Then the selection should read "2 entries selected"
 * Example #2: Then the selection should read "1 entry selected"
 * Example #3: And the selection should read "10 entries selected"
 * Example #4: Then the selection should read "3 entries selected"
 * Example #5: Then the selection should read "2 entries selected"
 */
Then(/^the selection should read "([^"]*)"$/, async function (text) {
  await listOrFail(this);
  const read = async () => (await this.page.getByRole('main').getByText(/^\d+ entr(?:y|ies) selected$/).allInnerTexts().catch(() => [])).map(clean);
  await eventually(this, read, (texts) => texts.some((t) => same(t, text)),
    (texts) => ({ message: `The list reads ${texts.length ? `"${texts[0]}"` : 'no selection'}, not "${text}".`, hint: 'Select rows first: When I select "Bulk test article one" in the list' }));
});

/**
 * The bulk actions the list offers for its selection ("Publish", "Unpublish",
 * "Delete").
 *
 * Example #1: Then the selection should offer "Publish"
 * Example #2: Then the selection should not offer "Publish"
 * Example #3: And the selection should offer "Delete"
 * Example #4: Then the selection should offer "Unpublish"
 * Example #5: Then the selection should not offer "Unpublish"
 */
Then(/^the selection should (not )?offer "([^"]*)"$/, async function (not, action) {
  await listOrFail(this);
  const want = !not;
  const button = this.page.getByRole('main').getByRole('button', { name: action, exact: true });
  await eventually(this, async () => (await button.count()) > 0 && (await button.first().isEnabled()), (has) => has === want,
    () => ({ message: `The list ${want ? 'does not offer' : 'offers'} "${action}" for its selection.`, hint: 'An account sees the actions its role allows; "Publish" shows when a selected entry can be published.' }));
});

/** The bulk action request of the list. */
function bulkRequest(world, action) {
  const uid = decodeURIComponent((world.page.url().match(/collection-types\/([^/?#]+)/) || [])[1] || '');
  return (method, url) => method === 'POST' && url.includes(`/content-manager/collection-types/${uid}/actions/${action}`);
}

/**
 * Publish the selected entries: the "Publish entries" dialog lists them, and
 * its "Publish" sends them; the step waits for the admin's answer and the
 * list again.
 *
 * Example #1: When I publish the selected entries
 * Example #2: And I publish the selected entries
 * Example #3: When I publish the selected entries
 * Example #4: Then I publish the selected entries
 * Example #5: When I publish the selected entries
 */
When(/^I publish the selected entries$/, { timeout: 90000 }, async function () {
  await listOrFail(this);
  const page = this.page;
  const button = page.getByRole('main').getByRole('button', { name: 'Publish', exact: true });
  if (!(await button.count())) throw friendly({ message: 'The list offers no "Publish" for its selection.', hint: 'Select an entry that can be published first; an account whose role may not publish has no "Publish".' });
  await withApi(this, (method, url) => method === 'POST' && /\/actions\/bulkFindForValidation/.test(url), () => button.click(), { what: 'the check of the selected entries' });
  const dialog = page.getByRole('dialog', { name: 'Publish entries' });
  await dialog.waitFor({ state: 'visible', timeout: budget(this) });
  const send = dialog.getByRole('button', { name: 'Publish', exact: true });
  await eventually(this, () => send.isEnabled(), (on) => on, async () => ({ message: `The "Publish entries" dialog does not let the selection be published: ${clean(await dialog.innerText()).slice(0, 300)}.`, hint: 'An entry with a field the publication refuses is "Waiting for action": fix it in its edit view.' }));
  forgetNotifications(this);
  await withApi(this, bulkRequest(this, 'bulkPublish'), async () => {
    await send.click();
    // The admin asks once more: "Are you sure you want to publish these entries?"
    const confirm = page.getByRole('alertdialog').filter({ hasText: 'publish these entries' }).getByRole('button', { name: 'Publish', exact: true });
    await confirm.waitFor({ state: 'visible', timeout: budget(this) });
    await confirm.click();
  }, { what: 'the bulk publish', required: true });
  await dialog.waitFor({ state: 'hidden', timeout: budget(this) }).catch(async () => { await dialog.getByRole('button', { name: 'Cancel', exact: true }).click().catch(() => {}); });
  await listReady(this);
});

/**
 * Unpublish or delete the selected entries, confirming the admin's question
 * ("Are you sure you want to unpublish these entries?"); the step waits for the
 * admin's answer and the list again.
 *
 * Example #1: When I unpublish the selected entries
 * Example #2: When I delete the selected entries
 * Example #3: And I delete the selected entries
 * Example #4: When I unpublish the selected entries
 * Example #5: Then I delete the selected entries
 */
When(/^I (unpublish|delete) the selected entries$/, { timeout: 90000 }, async function (action) {
  await listOrFail(this);
  const page = this.page;
  const label = action === 'unpublish' ? 'Unpublish' : 'Delete';
  const button = page.getByRole('main').getByRole('button', { name: label, exact: true });
  if (!(await button.count())) throw friendly({ message: `The list offers no "${label}" for its selection.`, hint: 'Select rows first: When I select "Bulk test article one" in the list' });
  await button.click();
  const dialog = await openDialog(page, 'Confirmation') || (await eventually(this, () => openDialog(page), (d) => !!d, () => ({ message: `"${label}" asked no confirmation.`, hint: 'The admin asks before it unpublishes or deletes entries.' }), 5000));
  forgetNotifications(this);
  await withApi(this, bulkRequest(this, action === 'unpublish' ? 'bulkUnpublish' : 'bulkDelete'), () => dialog.getByRole('button', { name: 'Confirm', exact: true }).click(), { what: `the bulk ${action}`, required: true });
  await listReady(this);
});

/**
 * Open an entry from the list, by the text of its row (its title), and wait
 * for its edit view.
 *
 * Example #1: When I open "Harbour lights at dusk" from the list
 * Example #2: And I open "Bulk test article one" from the list
 * Example #3: When I open "Lumières du port au crépuscule" from the list
 * Example #4: When I open "Locale test article" from the list
 * Example #5: When I open "Guides" from the list
 */
When(/^I open "([^"]*)" from the list$/, { timeout: 60000 }, async function (name) {
  const row = await listRowOrFail(this, name);
  const cells = row.locator.locator('td');
  const n = await cells.count();
  // A cell with the entry's text: not the check box, not the locales' menu, not the row's actions.
  let target = null;
  for (let i = 1; i < n; i += 1) {
    const text = clean(await cells.nth(i).innerText());
    if (same(text, name)) { target = cells.nth(i); break; }
  }
  await (target || cells.nth(2)).click();
  await this.page.waitForURL(/\/content-manager\/collection-types\/[^/]+\/[^/?#]+/, { timeout: budget(this) }).catch(() => {});
  await editViewReady(this);
});

/**
 * Start a new entry from the list ("Create new entry"), and wait for its form.
 *
 * Example #1: When I create a new entry from the list
 * Example #2: And I create a new entry from the list
 * Example #3: When I create a new entry from the list
 * Example #4: Then I create a new entry from the list
 * Example #5: When I create a new entry from the list
 */
When(/^I create a new entry from the list$/, { timeout: 60000 }, async function () {
  await listOrFail(this);
  const link = this.page.getByRole('main').getByRole('link', { name: 'Create new entry', exact: true }).first();
  if (!(await link.count())) throw friendly({ message: 'The list offers no "Create new entry".', hint: 'An account whose role may not create entries of this type has none.' });
  await link.click();
  await this.page.waitForURL(/\/create(\?|$)/, { timeout: budget(this) }).catch(() => {});
  await editViewReady(this);
});

/**
 * The list is empty: it says "No content found" instead of a table.
 *
 * Example #1: Then the list should be empty
 * Example #2: And the list should be empty
 * Example #3: Then the list should be empty
 * Example #4: Then the list should be empty
 * Example #5: And the list should be empty
 */
Then(/^the list should be empty$/, async function () {
  await listOrFail(this);
  await eventually(this, async () => ({ empty: await this.page.getByRole('main').getByText(/^No content found$/).count(), rows: (await listRows(this.page)).map(rowName) }),
    (s) => s.empty > 0, (s) => ({ message: `The list is not empty: it shows ${listed(s.rows)}.`, hint: 'An author sees only the entries it made itself.' }));
});

void [mentions, quotedList, count, CUT_HINT, pageSummary, waitForNotification, confirmDialog, requireLogin, adminReady, isLoading];
