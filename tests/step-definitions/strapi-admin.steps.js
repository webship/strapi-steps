'use strict';

// The admin around the content: the main navigation and what an account sees
// in it, the settings and their menu, the lists of the settings (admin roles,
// admin users, API tokens, end-user roles) and a role's permissions, an API
// token's type, the plan of the site, an account's role, and the addresses an
// account is refused. The suite reads the settings; it never changes a role,
// a token or an account.

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const {
  budget,
  clean,
  normal,
  same,
  mentions,
  listed,
  hintFor,
  adminUrl,
  adminRoute,
  absolute,
  open,
  withApi,
  eventually,
  pageSummary,
  requireLogin,
  adminReady,
  clearTooltips,
  notifications,
  emailOf,
} = require('./strapi-helpers');

/** The links of the main navigation, by name. */
async function mainLinks(page) {
  return (await page.getByRole('navigation').first().getByRole('link').evaluateAll((as) => as.map((a) => (a.getAttribute('aria-label') || a.textContent || '').trim()))).map(clean).filter(Boolean);
}

/**
 * Go to a section of the admin from its main navigation ("Home", "Content
 * Manager", "Media Library", "Content-Type Builder", "Settings"), and wait for
 * its page.
 *
 * Example #1: When I go to the "Settings" section
 * Example #2: When I go to the "Content-Type Builder" section
 * Example #3: And I go to the "Home" section
 * Example #4: When I go to the "Content Manager" section
 * Example #5: When I go to the "Media Library" section
 */
When(/^I go to the "([^"]*)" section$/, { timeout: 60000 }, async function (name) {
  requireLogin(this);
  const page = this.page;
  const nav = page.getByRole('navigation').first();
  const link = nav.getByRole('link', { name, exact: true });
  if (!(await link.count())) {
    throw friendly({ message: `The main navigation has no "${name}". It lists ${listed(await mainLinks(page))}.`, hint: hintFor(this, 'An account sees the sections its role may open.') });
  }
  const href = await link.first().getAttribute('href');
  if (/^https?:\/\//.test(href || '') && !String(href).startsWith(absolute(this, '/'))) {
    throw friendly({ message: `"${name}" leaves the site (${href}).`, hint: 'The steps stay on the site: the marketplace is not opened.' });
  }
  await link.first().click();
  await clearTooltips(page);
  await page.waitForURL((u) => u.pathname.startsWith(String(href).split('?')[0]), { timeout: budget(this) }).catch(() => {});
  await adminReady(this);
});

/**
 * The main navigation lists a section, or does not (the sections follow the
 * account's role).
 *
 * Example #1: Then the main navigation should list "Content-Type Builder"
 * Example #2: Then the main navigation should not list "Content-Type Builder"
 * Example #3: And the main navigation should list "Media Library"
 * Example #4: Then the main navigation should list "Settings"
 * Example #5: Then the main navigation should not list "Marketplace"
 */
Then(/^the main navigation should (not )?list "([^"]*)"$/, async function (not, name) {
  requireLogin(this);
  const want = !not;
  await eventually(this, () => mainLinks(this.page), (links) => links.some((l) => same(l, name)) === want,
    (links) => ({ message: `The main navigation ${want ? 'does not list' : 'lists'} "${name}". It lists ${listed(links)}.`, hint: 'The main navigation shows the sections the account\'s role may open.' }));
});

/** The settings menu: its groups and their links ({ group, name, href }). */
async function settingsLinks(page) {
  return page.getByRole('navigation', { name: 'Settings' }).evaluate((nav) => {
    const out = [];
    nav.querySelectorAll(':scope > ol > li, :scope > ul > li, li').forEach((li) => {
      const inner = li.querySelector('ol, ul');
      if (!inner) return;
      const group = (li.firstChild && li.firstChild.textContent ? [...li.childNodes].filter((n) => n !== inner).map((n) => n.textContent).join(' ') : '').trim();
      inner.querySelectorAll('a').forEach((a) => out.push({ group, name: (a.textContent || '').trim(), href: a.getAttribute('href') }));
    });
    return out;
  }).catch(() => []);
}

/** Open the settings when the page is not in them. */
async function inSettings(world) {
  requireLogin(world);
  if (!/^\/settings/.test(adminRoute(world))) {
    const link = world.page.getByRole('navigation').first().getByRole('link', { name: 'Settings', exact: true });
    if (await link.count()) {
      await link.click();
      await clearTooltips(world.page);
      await world.page.waitForURL((u) => /\/settings/.test(u.pathname), { timeout: budget(world) }).catch(() => {});
      await adminReady(world);
    } else {
      await open(world, adminUrl(world, 'settings'));
    }
  }
  await world.page.getByRole('navigation', { name: 'Settings' }).waitFor({ state: 'visible', timeout: budget(world) });
}

/**
 * Go to a page of the settings from their menu, by its name; when two groups
 * have a page of that name ("Roles"), the group names it ("Users &
 * Permissions plugin").
 *
 * Example #1: When I go to the settings page "API Tokens"
 * Example #2: When I go to the settings page "Roles" under "Administration panel"
 * Example #3: And I go to the settings page "Roles" under "Users & Permissions plugin"
 * Example #4: When I go to the settings page "Users" under "Administration panel"
 * Example #5: When I go to the settings page "Overview"
 */
When(/^I go to the settings page "([^"]*)"(?: under "([^"]*)")?$/, { timeout: 60000 }, async function (name, group) {
  await inSettings(this);
  const page = this.page;
  const links = await settingsLinks(page);
  const matches = links.filter((l) => same(l.name, name) && (!group || mentions(l.group, group)));
  if (!matches.length) {
    throw friendly({ message: `The settings menu has no page "${name}"${group ? ` under "${group}"` : ''}. It lists ${listed(links.map((l) => `${l.name} (${l.group})`))}.`, hint: 'A page is named as the settings menu shows it; an account sees the pages its role may open.' });
  }
  if (matches.length > 1 && !group) {
    throw friendly({ message: `The settings menu has ${matches.length} pages "${name}": ${listed(matches.map((l) => l.group))}.`, hint: `Name the group: When I go to the settings page "${name}" under "${matches[0].group}"` });
  }
  const target = matches[0];
  if (/\/purchase-/.test(target.href || '')) {
    throw friendly({ message: `"${name}" is an offer of a paid plan (${target.href}), not a page of the site.`, hint: 'The steps work with the Community Edition only; they never open the paid plans\' pages.' });
  }
  await page.getByRole('navigation', { name: 'Settings' }).locator(`a[href="${target.href}"]`).first().click();
  await page.waitForURL((u) => u.pathname === String(target.href).split('?')[0] || u.pathname.startsWith(String(target.href).split('?')[0]), { timeout: budget(this) }).catch(() => {});
  await adminReady(this);
});

/**
 * The settings menu lists a page, or does not (under a group, when named);
 * the pages follow the account's role.
 *
 * Example #1: Then the settings menu should list "API Tokens"
 * Example #2: Then the settings menu should not list "Roles"
 * Example #3: And the settings menu should list "Roles" under "Users & Permissions plugin"
 * Example #4: Then the settings menu should list "Internationalization"
 * Example #5: Then the settings menu should not list "API Tokens"
 */
Then(/^the settings menu should (not )?list "([^"]*)"(?: under "([^"]*)")?$/, { timeout: 60000 }, async function (not, name, group) {
  await inSettings(this);
  const want = !not;
  await eventually(this, () => settingsLinks(this.page), (links) => links.some((l) => same(l.name, name) && (!group || mentions(l.group, group))) === want,
    (links) => ({ message: `The settings menu ${want ? 'does not list' : 'lists'} "${name}"${group ? ` under "${group}"` : ''}. It lists ${listed(links.map((l) => `${l.name} (${l.group})`))}.`, hint: 'The settings menu shows the pages the account\'s role may open.' }));
});

/**
 * The plan of the site, as the settings' "Overview" names it ("Community":
 * the free edition).
 *
 * Example #1: Then the plan of the site should be "Community"
 * Example #2: And the plan of the site should be "Community"
 * Example #3: Then the plan of the site should be "Community"
 * Example #4: Then the plan of the site should be "Community"
 * Example #5: And the plan of the site should be "Community"
 */
Then(/^the plan of the site should be "([^"]*)"$/, { timeout: 60000 }, async function (plan) {
  await inSettings(this);
  if (!/^\/settings\/application-infos/.test(adminRoute(this))) {
    const overview = this.page.getByRole('navigation', { name: 'Settings' }).getByRole('link', { name: 'Overview', exact: true });
    await overview.click();
    await adminReady(this);
  }
  const read = async () => this.page.getByRole('main').evaluate((m) => {
    const dt = [...m.querySelectorAll('dt')].find((d) => /current plan/i.test(d.textContent));
    return dt && dt.nextElementSibling ? dt.nextElementSibling.textContent.trim() : '';
  }).catch(() => '');
  await eventually(this, read, (v) => same(v, plan),
    (v) => ({ message: `The site's plan is "${v || '(not shown)'}", not "${plan}".`, hint: 'The settings\' "Overview" shows the current plan; the free edition is "Community".' }));
});

/** The rows of the table the settings page shows: { cells, name, locator }. */
async function settingsRows(page) {
  const rows = page.getByRole('main').locator('table tbody tr');
  const raw = await rows.evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => (td.textContent || '').trim()))).catch(() => []);
  return raw.map((cells, index) => ({ cells: cells.map(clean), index, locator: rows.nth(index) }));
}

/** Wait until the settings page shows its table. */
async function settingsTable(world) {
  await adminReady(world);
  await eventually(world, async () => (await settingsRows(world.page)).length, (n) => n > 0,
    async () => ({ message: `The settings page shows no list: ${await pageSummary(world)}.`, hint: hintFor(world, 'Open a page with a list first: When I go to the settings page "API Tokens"') }));
}

/**
 * The list of the settings page on screen (roles, users, API tokens, the
 * end-user roles) shows a row with that text in one of its cells, or does
 * not; with a second text, the same row shows it too.
 *
 * Example #1: Then the settings list should show "Read Only"
 * Example #2: Then the settings list should show "Editor" with "1 user"
 * Example #3: And the settings list should show "Public" with "Default role given to unauthenticated user."
 * Example #4: Then the settings list should not show "Write access for the website"
 * Example #5: Then the settings list should show "editor@example.com" with "Active"
 */
Then(/^the settings list should (not )?show "([^"]*)"(?: with "([^"]*)")?$/, { timeout: 60000 }, async function (not, name, other) {
  await settingsTable(this);
  const want = !not;
  await eventually(this, () => settingsRows(this.page), (rows) => rows.some((r) => r.cells.some((c) => same(c, name)) && (!other || r.cells.some((c) => mentions(c, other)))) === want,
    (rows) => ({ message: `The list ${want ? 'shows no' : 'shows a'} row "${name}"${other ? ` with "${other}"` : ''}. Its rows: ${listed(rows.map((r) => r.cells.filter(Boolean).slice(0, 3).join(' | ')))}.`, hint: 'A row is named by the text of one of its cells.' }));
});

/**
 * Open an item of the settings list on screen by its name (its "Edit" link or
 * button): a role, an API token, an end-user role.
 *
 * Example #1: When I open "Editor" from the settings list
 * Example #2: When I open "Read Only" from the settings list
 * Example #3: And I open "Public" from the settings list
 * Example #4: When I open "Author" from the settings list
 * Example #5: When I open "Authenticated" from the settings list
 */
When(/^I open "([^"]*)" from the settings list$/, { timeout: 60000 }, async function (name) {
  await settingsTable(this);
  const page = this.page;
  const rows = await settingsRows(page);
  const row = rows.find((r) => r.cells.some((c) => same(c, name)));
  if (!row) throw friendly({ message: `The list shows no "${name}". Its rows: ${listed(rows.map((r) => r.cells.filter(Boolean)[0]))}.`, hint: 'A row is named by the text of one of its cells.' });
  // Its "Edit" link or button ("Edit Read Only", "Edit"), else the row itself.
  const target = row.locator.getByRole('link', { name: /^Edit\b/ }).or(row.locator.getByRole('button', { name: /^Edit\b/ })).first();
  const before = page.url();
  await ((await target.count()) ? target : row.locator.locator('td').nth(1)).click();
  await page.waitForURL((u) => u.toString() !== before, { timeout: budget(this) }).catch(() => {});
  await adminReady(this);
});

/**
 * A role's permission on a content type, on the role's page on screen: for an
 * admin role the action of its matrix ("Create", "Read", "Update", "Delete",
 * "Publish"), for an end-user role the action of its API ("find", "findOne",
 * "create", "update", "delete").
 *
 * Example #1: Then the role should allow "Publish" on "Article"
 * Example #2: Then the role should not allow "Publish" on "Article"
 * Example #3: And the role should allow "Read" on "Homepage"
 * Example #4: Then the role should not allow "find" on "Article"
 * Example #5: Then the role should allow "Delete" on "Category"
 */
Then(/^the role should (not )?allow "([^"]*)" on "([^"]*)"$/, { timeout: 60000 }, async function (not, action, type) {
  const page = this.page;
  await adminReady(this);
  const main = page.getByRole('main');
  const want = !not;
  let box = null;
  if (/\/settings\/users-permissions\/roles\//.test(adminRoute(this))) {
    // An end-user role: the content type's actions fold under its heading.
    const heading = main.getByRole('button', { name: new RegExp(`^${type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') }).first();
    if (!(await heading.count())) throw friendly({ message: `The role has no permissions for "${type}".`, hint: 'The end-user role lists the actions of the site\'s API by content type.' });
    if ((await heading.getAttribute('aria-expanded')) !== 'true') await heading.click();
    box = main.getByRole('region', { name: new RegExp(`^${type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') }).getByRole('checkbox', { name: action, exact: true });
  } else {
    // An admin role: a matrix, the tab of the type's kind first.
    for (const tab of ['Collection Types', 'Single Types']) {
      const label = `Select ${action} ${type.toLowerCase()} permission`;
      const t = main.getByRole('tab', { name: tab, exact: true });
      if (await t.count()) await t.click();
      const candidate = main.getByRole('checkbox', { name: label, exact: true });
      if (await candidate.count()) { box = candidate; break; }
    }
  }
  if (!box || !(await box.count())) {
    throw friendly({ message: `The role's page has no permission "${action}" on "${type}": ${await pageSummary(this)}.`, hint: 'Open a role first (When I open "Editor" from the settings list); an admin role names its actions "Create", "Read", "Update", "Delete", "Publish", an end-user role "find", "findOne", "create", "update", "delete".' });
  }
  const checked = async () => {
    const aria = await box.first().getAttribute('aria-checked');
    return aria === null ? box.first().isChecked() : aria === 'true';
  };
  await eventually(this, checked, (on) => on === want,
    () => ({ message: `The role ${want ? 'does not allow' : 'allows'} "${action}" on "${type}".`, hint: 'The role\'s page shows its permissions as check boxes.' }));
});

/**
 * The type of the API token on screen ("Read-only", "Full access", "Custom").
 *
 * Example #1: Then the API token should be "Read-only"
 * Example #2: Then the API token should be "Full access"
 * Example #3: And the API token should be "Read-only"
 * Example #4: Then the API token should be "Custom"
 * Example #5: Then the API token should be "Full access"
 */
Then(/^the API token should be "([^"]*)"$/, async function (type) {
  await adminReady(this);
  const combo = this.page.getByRole('main').getByRole('combobox', { name: 'Token type', exact: true });
  if (!(await combo.count())) throw friendly({ message: `The page shows no API token: ${await pageSummary(this)}.`, hint: 'Open one first: When I open "Read Only" from the settings list' });
  await eventually(this, async () => clean(await combo.innerText()), (v) => same(v, type),
    (v) => ({ message: `The API token's type is "${v}", not "${type}".`, hint: 'The type is the token\'s "Token type".' }));
});

/**
 * An account of the users registry (or an email address) has a role, as the
 * administration panel's users list shows it.
 *
 * Example #1: Then the account "editor" should have the role "Editor"
 * Example #2: Then the account "author" should have the role "Author"
 * Example #3: And the account "administrator" should have the role "Super Admin"
 * Example #4: Then the account "editor@example.com" should have the role "Editor"
 * Example #5: Then the account "author" should have the role "Author"
 */
Then(/^the account "([^"]*)" should have the role "([^"]*)"$/, { timeout: 60000 }, async function (who, role) {
  const email = emailOf(this, who);
  if (!/^\/settings\/users/.test(adminRoute(this))) {
    await inSettings(this);
    const users = (await settingsLinks(this.page)).find((l) => same(l.name, 'Users') && mentions(l.group, 'Administration'));
    if (!users) throw friendly({ message: 'The settings menu has no "Users" of the administration panel.', hint: 'Only an account whose role may read the admin users sees them (a Super Admin).' });
    await this.page.getByRole('navigation', { name: 'Settings' }).locator(`a[href="${users.href}"]`).first().click();
    await adminReady(this);
  }
  await settingsTable(this);
  await eventually(this, () => settingsRows(this.page), (rows) => rows.some((r) => r.cells.some((c) => same(c, email)) && r.cells.some((c) => c.split(/\s*,\s*/).some((x) => same(x, role)))),
    (rows) => {
      const row = rows.find((r) => r.cells.some((c) => same(c, email)));
      return row
        ? { message: `The account ${email} has the role(s) "${row.cells[4] || row.cells.join(' | ')}", not "${role}".`, hint: 'The roles of an account are set by the build of the site.' }
        : { message: `The users list shows no account ${email}. It shows ${listed(rows.map((r) => r.cells[3]))}.`, hint: 'The accounts are made by the build of the site.' };
    });
});

/**
 * An address of the admin is refused to the account logged in: the admin
 * says it may not access it ("You don't have the permissions to access that
 * content"), or refuses what it asks for ("Forbidden").
 *
 * Example #1: Then I should not be allowed to open "/admin/settings/roles"
 * Example #2: Then I should not be allowed to open "/admin/plugins/content-type-builder"
 * Example #3: And I should not be allowed to open "/admin/settings/api-tokens"
 * Example #4: Then I should not be allowed to open "/admin/settings/users"
 * Example #5: Then I should not be allowed to open "/admin/settings/webhooks"
 */
Then(/^I should not be allowed to open "([^"]*)"$/, { timeout: 60000 }, async function (address) {
  requireLogin(this);
  await open(this, absolute(this, address));
  const page = this.page;
  const refused = async () => {
    const text = clean(await page.getByRole('main').innerText({ timeout: 1000 }).catch(() => ''));
    const toasts = await notifications(page);
    return { text, toasts };
  };
  await eventually(this, refused, (s) => /You don't have the permissions to access that content|Whoops! Something went wrong/i.test(s.text) || s.toasts.some((t) => /Forbidden/i.test(t)) || /\/admin\/?$/.test(new URL(page.url()).pathname) && !/\/admin\/?$/.test(address),
    async (s) => ({ message: `The admin opened "${address}" for the account: ${await pageSummary(this)} (${s.text.slice(0, 120)}).`, hint: 'The account\'s role may open this address; a refused address shows "You don\'t have the permissions to access that content".' }));
});

void [normal, withApi];
