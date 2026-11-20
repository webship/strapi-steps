'use strict';

// The Content-Type Builder, read only: the model of a content type or a
// component, its fields with their kinds and whether they are required, the
// components of a dynamic zone, and that the builder allows no change (the
// server runs in production, where the admin turns the builder's editing
// off). A suite never changes the schema.

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const {
  budget,
  clean,
  same,
  mentions,
  listed,
  hintFor,
  adminUrl,
  adminRoute,
  open,
  eventually,
  pageSummary,
  requireLogin,
  adminReady,
  clearTooltips,
  notifications,
} = require('./strapi-helpers');

/** The builder's own navigation. */
function builderNav(page) {
  return page.getByRole('navigation', { name: 'Content-Type Builder' });
}

/**
 * The fields of the model on screen: [{ name, type, required, disabled, nested }]. The builder draws a
 * field as a sortable row (role "button", named by the field): its name, a "*" when it is required, its
 * kind ("Text", "Relation (manyToOne) with Category", "Component (Seo)"); the fields of a component or
 * of a dynamic zone's components are rows inside that row ("nested").
 */
async function modelFields(page) {
  return page.evaluate(() => [...document.querySelectorAll('li[role="button"][aria-roledescription="sortable"]')].filter((li) => !li.closest('nav')).map((li) => {
    const spans = [...li.querySelectorAll('span')].filter((sp) => !sp.closest('li[role="button"]') || sp.closest('li[role="button"]') === li);
    const nameSpan = spans.find((sp) => sp.textContent.replace(/\u00a0/g, ' ').trim().replace(/\*\s*$/, '') === li.getAttribute('aria-label'));
    const required = !!nameSpan && /\*/.test(nameSpan.textContent);
    // The kind: the first text after the name that is not the "*" (its own span, or the span that holds a link).
    const kindSpan = spans.find((sp) => sp !== nameSpan && !(nameSpan && nameSpan.contains(sp)) && /\S/.test(sp.textContent.replace(/\u00a0/g, ' ')) && !/^\*\s*$/.test(sp.textContent.replace(/\u00a0/g, ' ').trim()));
    const type = kindSpan ? kindSpan.textContent.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim() : '';
    return {
      name: li.getAttribute('aria-label') || '',
      type,
      required,
      disabled: li.getAttribute('aria-disabled') === 'true',
      nested: !!li.parentElement.closest('li[role="button"]'),
    };
  })).catch(() => []);
}

/**
 * Open the model of a content type ("Article") or of a component (with
 * "component": "Quote") in the Content-Type Builder, from its navigation.
 *
 * Example #1: When I open the model of "Article"
 * Example #2: When I open the model of the "Quote" component
 * Example #3: And I open the model of "Homepage"
 * Example #4: When I open the model of "Category"
 * Example #5: When I open the model of the "Seo" component
 */
When(/^I open the model of (?:the "([^"]*)" component|"([^"]*)")$/, { timeout: 60000 }, async function (component, type) {
  requireLogin(this);
  const page = this.page;
  const name = component || type;
  if (!/^\/plugins\/content-type-builder/.test(adminRoute(this))) {
    const link = page.getByRole('navigation').first().getByRole('link', { name: 'Content-Type Builder', exact: true });
    if (!(await link.count())) throw friendly({ message: `The main navigation has no "Content-Type Builder": ${await pageSummary(this)}.`, hint: 'Only an account whose role may read the content types (a Super Admin) has the builder.' });
    await link.click();
    await clearTooltips(page);
    await page.waitForURL((u) => /content-type-builder/.test(u.pathname), { timeout: budget(this) }).catch(() => {});
    await adminReady(this);
  }
  const nav = builderNav(page);
  await nav.waitFor({ state: 'visible', timeout: budget(this) });
  let link = nav.getByRole('link', { name, exact: true });
  if (component && !(await link.count())) {
    const folded = nav.locator('button[aria-expanded="false"]');
    for (let i = 0; i < await folded.count(); i += 1) await folded.nth(i).click();
    link = nav.getByRole('link', { name, exact: true });
  }
  const hrefs = (await link.evaluateAll((as) => as.map((a) => a.getAttribute('href')))).filter((h) => (component ? /component-categories/.test(h) : /content-types\//.test(h)));
  if (!hrefs.length) {
    const offered = (await nav.getByRole('link').allInnerTexts()).map(clean).filter(Boolean);
    throw friendly({ message: `The Content-Type Builder has no ${component ? 'component' : 'content type'} "${name}". It lists ${listed(offered)}.`, hint: 'A model is named as the builder lists it (its display name).' });
  }
  // The builder opens on its first content type: a model already on screen is not opened again.
  const onIt = decodeURIComponent(new URL(page.url()).pathname).replace(/\/+$/, '') === decodeURIComponent(hrefs[0]).split('?')[0].replace(/\/+$/, '');
  if (!onIt) await nav.locator(`a[href="${hrefs[0]}"]`).first().click();
  await page.waitForURL((u) => decodeURIComponent(u.pathname).endsWith(decodeURIComponent(hrefs[0]).replace(/^.*?(\/plugins)/, '$1').split('?')[0].replace(/^\/admin/, '')), { timeout: budget(this) }).catch(() => {});
  await adminReady(this);
  await eventually(this, async () => clean(await page.locator('h1').first().innerText().catch(() => '')), (h) => same(h, name),
    (h) => ({ message: `The builder shows "${h}", not the model of "${name}".`, hint: hintFor(this, 'The model\'s page is headed by its display name.') }));
});

/**
 * The fields of the model on screen, in their order: a name and a kind per
 * row, and "required" in a third column for a required field. The fields of
 * a dynamic zone's components are not read here.
 *
 * Example #1: Then the model should have the fields:
 * Example #2: And the model should have the fields:
 * Example #3: Then the model should have the fields:
 * Example #4: Then the model should have the fields:
 * Example #5: And the model should have the fields:
 */
Then(/^the model should have the fields:$/, async function (table) {
  const wanted = table.raw().filter((r) => r.length >= 2).map(([name, type, required]) => ({ name: clean(name), type: clean(type), required: /required/i.test(required || '') }));
  await eventually(this, async () => (await modelFields(this.page)).filter((f) => !f.nested),
    (fields) => fields.length === wanted.length && wanted.every((w, i) => same(fields[i].name, w.name) && mentions(fields[i].type, w.type) && fields[i].required === w.required),
    (fields) => ({ message: `The model has the fields ${listed(fields.map((f) => `${f.name}${f.required ? '*' : ''}: ${f.type}`))}, not ${listed(wanted.map((w) => `${w.name}${w.required ? '*' : ''}: ${w.type}`))}.`, hint: 'A field reads with its name, "*" when it is required, and its kind as the builder names it ("Text", "UID", "Rich text (Blocks)", "Media", "Relation (manyToOne)", "Boolean", "Dynamic zone", "Component").' }));
});

/**
 * The components a dynamic zone of the model on screen offers, in their order.
 *
 * Example #1: Then the "blocks" dynamic zone of the model should offer "Quote", "Rich text" and "Media"
 * Example #2: And the "blocks" dynamic zone of the model should offer "Quote", "Rich text" and "Media"
 * Example #3: Then the "blocks" dynamic zone of the model should offer "Quote", "Rich text" and "Media"
 * Example #4: Then the "blocks" dynamic zone of the model should offer "Quote", "Rich text" and "Media"
 * Example #5: And the "blocks" dynamic zone of the model should offer "Quote", "Rich text" and "Media"
 */
Then(/^the "([^"]*)" dynamic zone of the model should offer ("[^"]*"(?:(?:, | and )"[^"]*")*)$/, async function (zone, list) {
  const wanted = [...list.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
  const read = async () => this.page.evaluate((name) => {
    const row = [...document.querySelectorAll('li[role="button"][aria-roledescription="sortable"]')].find((li) => !li.closest('nav') && (li.getAttribute('aria-label') || '').toLowerCase() === name.toLowerCase());
    if (!row || !/dynamic zone/i.test(row.textContent || '')) return null;
    return [...row.querySelectorAll('[role="tab"]')].map((t) => (t.textContent || '').trim());
  }, zone).catch(() => null);
  await eventually(this, read, (tabs) => !!tabs && tabs.length === wanted.length && tabs.every((t, i) => same(t, wanted[i])),
    (tabs) => ({ message: tabs ? `The dynamic zone "${zone}" of the model offers ${listed(tabs)}, not ${listed(wanted)}.` : `The model has no dynamic zone "${zone}".`, hint: 'The builder shows a dynamic zone\'s components as tabs under the zone\'s row.' }));
});

/**
 * The Content-Type Builder allows no change: its "Save" is off and every
 * field of the model is read only (the server runs in production).
 *
 * Example #1: Then the model should not allow changes
 * Example #2: And the model should not allow changes
 * Example #3: Then the model should not allow changes
 * Example #4: Then the model should not allow changes
 * Example #5: And the model should not allow changes
 */
Then(/^the model should not allow changes$/, async function () {
  const page = this.page;
  const save = builderNav(page).getByRole('button', { name: 'Save', exact: true });
  if (!(await save.count())) throw friendly({ message: `The page is not the Content-Type Builder: ${await pageSummary(this)}.`, hint: 'Open a model first: When I open the model of "Article"' });
  if (await save.isEnabled()) throw friendly({ message: 'The Content-Type Builder\'s "Save" is on: the builder allows changes.', hint: 'In production the admin turns the builder\'s editing off; in development it is on.' });
  const editable = (await modelFields(page)).filter((f) => !f.disabled);
  if (!(await modelFields(page)).length) throw friendly({ message: `The builder shows no field of a model: ${await pageSummary(this)}.`, hint: 'Open a model first: When I open the model of "Article"' });
  if (editable.length) throw friendly({ message: `The model's fields ${listed(editable.map((f) => f.name))} can be opened to change them.`, hint: 'In production every field of the builder is read only.' });
});

void [mentions, adminUrl, open, notifications];
