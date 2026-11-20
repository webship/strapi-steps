'use strict';

// The dynamic zone of an entry: adding a component from the zone's picker,
// filling in a component's fields, moving a component up or down (with the
// keyboard, the way the admin announces it: "grabbed", "dropped"), removing a
// component, and the components the zone holds in their order. A component is
// named as the zone shows it: its display name ("Quote"), which the admin
// follows with the value of its first text field ("Quote - A harbour master").

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const {
  budget,
  clean,
  same,
  listed,
  quotedList,
  count,
  hintFor,
  eventually,
  editViewOrFail,
  editForm,
  fieldOrFail,
  setField,
  readField,
  zoneItems,
  zoneBox,
  componentName,
} = require('./strapi-helpers');

/** The zone's box, or a failure that lists the zones there are. */
async function zoneOrFail(world, zone) {
  await editViewOrFail(world);
  const form = editForm(world.page);
  const box = await zoneBox(world.page, form, zone);
  if (!box) {
    const zones = (await form.locator('button').allInnerTexts()).map(clean).map((t) => (t.match(/^Add a component to (.+)$/) || [])[1]).filter(Boolean);
    throw friendly({ message: `The entry has no dynamic zone "${zone}". Its dynamic zones: ${listed(zones)}.`, hint: 'A dynamic zone is named as its heading reads ("blocks"); it has the button "Add a component to blocks".' });
  }
  return { box, label: zone };
}

/** The names of the zone's components, in their order ("Quote", "Rich text"), and the list items. */
async function components(world, zone) {
  const field = await zoneOrFail(world, zone);
  const items = field.box.locator('li').filter({ has: world.page.locator('h3') });
  const names = (await items.evaluateAll((lis) => lis.map((li) => { const b = li.querySelector('h3 button'); return (b ? b.textContent : '') || ''; }))).map(clean);
  return { field, items, names };
}

/** The list item of a component, by its name and its rank among the components of that name ("the second"). */
async function componentItem(world, zone, name, rank = 1) {
  const { items, names } = await components(world, zone);
  let seen = 0;
  for (let i = 0; i < names.length; i += 1) {
    if (same(componentName(names[i]), name) || same(names[i], name)) {
      seen += 1;
      if (seen === rank) return { item: items.nth(i), index: i, names };
    }
  }
  throw friendly({ message: `The dynamic zone "${zone}" holds no ${rank > 1 ? `component ${rank} named ` : ''}"${name}". It holds ${listed(names)}.`, hint: 'A component is named by its display name, as the zone shows it ("Quote").' });
}

const ORDINAL = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };

/**
 * Add a component to a dynamic zone: "Add a component to <zone>", the
 * component in the picker (its category opened when it is folded), and
 * "Empty component" (a component that starts with blank fields).
 *
 * Example #1: When I add the "Quote" component to "blocks"
 * Example #2: And I add the "Rich text" component to "blocks"
 * Example #3: When I add the "Media" component to "blocks"
 * Example #4: When I add the "Quote" component to "blocks"
 * Example #5: And I add the "Rich text" component to "blocks"
 */
When(/^I add the "([^"]*)" component to "([^"]*)"$/, { timeout: 60000 }, async function (component, zone) {
  const page = this.page;
  const field = await zoneOrFail(this, zone);
  const before = (await components(this, zone)).names.length;
  await field.box.getByRole('button', { name: `Add a component to ${field.label}`, exact: true }).click();
  const picker = field.box.getByText('Pick one component', { exact: true });
  await picker.waitFor({ state: 'visible', timeout: budget(this) });
  let button = field.box.getByRole('button', { name: component, exact: true });
  if (!(await button.count())) {
    // A folded category: open each until the component shows.
    const categories = field.box.locator('h3 button[aria-expanded="false"]');
    for (let i = 0; i < await categories.count() && !(await button.count()); i += 1) await categories.nth(i).click();
    button = field.box.getByRole('button', { name: component, exact: true });
  }
  if (!(await button.count())) {
    const offered = (await field.box.locator('[role="region"] button').allInnerTexts()).map(clean).filter(Boolean);
    await field.box.getByRole('button', { name: 'Close', exact: true }).click().catch(() => {});
    throw friendly({ message: `The dynamic zone "${field.label}" offers no component "${component}". It offers ${listed(offered)}.`, hint: 'A component is named by its display name, as the picker shows it.' });
  }
  await button.first().click();
  // The admin asks whether the component starts empty or takes the content of another entry.
  const empty = page.getByRole('menuitem', { name: /^Empty component/ });
  if (await empty.first().isVisible({ timeout: 2000 }).catch(() => false)) await empty.first().click();
  await eventually(this, async () => (await components(this, zone)).names, (names) => names.length === before + 1,
    (names) => ({ message: `After adding "${component}", the dynamic zone "${field.label}" holds ${listed(names)}.`, hint: hintFor(this, 'The admin adds the component at the end of the zone, open.') }));
});

/**
 * Set a field of a component of a dynamic zone, found by the component's name
 * (and its rank, "the second Quote", when the zone holds more than one) and
 * the field's label.
 *
 * Example #1: When I set "body" to "A quotation for the test." in the "Quote" component of "blocks"
 * Example #2: And I set "author" to "A tester" in the "Quote" component of "blocks"
 * Example #3: When I set "body" to "Some **bold** words." in the "Rich text" component of "blocks"
 * Example #4: When I set "body" to "Another quotation." in the second "Quote" component of "blocks"
 * Example #5: When I set "author" to "Another tester" in the second "Quote" component of "blocks"
 */
When(/^I set "([^"]*)" to "([^"]*)" in the (?:(first|second|third|fourth|fifth) )?"([^"]*)" component of "([^"]*)"$/, { timeout: 60000 }, async function (label, value, rank, component, zone) {
  const { item } = await componentItem(this, zone, component, ORDINAL[rank] || 1);
  const toggle = item.locator('h3 button').first();
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
  await setField(this, item, label, value.replace(/\\n/g, '\n'), `the "${component}" component`);
});

/**
 * A field of a component of a dynamic zone shows a value.
 *
 * Example #1: Then "body" should be set to "A quotation for the test." in the "Quote" component of "blocks"
 * Example #2: Then "author" should be set to "A tester" in the "Quote" component of "blocks"
 * Example #3: And "body" should be set to "Some **bold** words." in the "Rich text" component of "blocks"
 * Example #4: Then "body" should be set to "Another quotation." in the second "Quote" component of "blocks"
 * Example #5: Then "author" should be set to "A harbour master" in the "Quote" component of "blocks"
 */
Then(/^"([^"]*)" should be set to "([^"]*)" in the (?:(first|second|third|fourth|fifth) )?"([^"]*)" component of "([^"]*)"$/, async function (label, value, rank, component, zone) {
  const { item } = await componentItem(this, zone, component, ORDINAL[rank] || 1);
  const toggle = item.locator('h3 button').first();
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
  await eventually(this, () => readField(this, item, label, `the "${component}" component`), (v) => same(v, value),
    (v) => ({ message: `"${label}" of the "${component}" component is set to "${v}", not "${value}".`, hint: 'The field is read as the component shows it.' }));
});

/**
 * Move a component of a dynamic zone up or down by a number of places, with
 * the keyboard ("Drag", space, the arrow keys, space), and wait for the
 * admin's announcement that it was dropped.
 *
 * Example #1: When I move the "Quote" component of "blocks" down
 * Example #2: When I move the "Rich text" component of "blocks" up
 * Example #3: And I move the "Quote" component of "blocks" down 2 places
 * Example #4: When I move the "Media" component of "blocks" up 2 places
 * Example #5: When I move the "Quote" component of "blocks" up
 */
When(/^I move the "([^"]*)" component of "([^"]*)" (up|down)(?: (\d+|one|two|three) places?)?$/, { timeout: 60000 }, async function (component, zone, direction, places) {
  const page = this.page;
  const steps = places ? count(places) : 1;
  const { item, index, names } = await componentItem(this, zone, component);
  const target = direction === 'down' ? index + steps : index - steps;
  if (target < 0 || target >= names.length) {
    throw friendly({ message: `The "${component}" component is at place ${index + 1} of ${names.length} in "${zone}": it cannot move ${direction} ${steps} place${steps === 1 ? '' : 's'}.`, hint: `The zone holds ${listed(names)}.` });
  }
  const drag = item.getByRole('button', { name: 'Drag', exact: true }).first();
  await drag.focus();
  await page.keyboard.press('Space');
  await eventually(this, () => page.locator('[aria-live]').allInnerTexts(), (texts) => texts.some((t) => /grabbed/i.test(t)),
    () => ({ message: `The "${component}" component was not picked up with the keyboard.`, hint: 'The admin announces "grabbed" when a component is picked up with the space bar on its "Drag" button.' }), 5000);
  for (let i = 0; i < steps; i += 1) await page.keyboard.press(direction === 'down' ? 'ArrowDown' : 'ArrowUp');
  await page.keyboard.press('Space');
  await eventually(this, () => page.locator('[aria-live]').allInnerTexts(), (texts) => texts.some((t) => new RegExp(`dropped\\. Final position in list: ${target + 1} of ${names.length}`).test(t)),
    (texts) => ({ message: `The "${component}" component was not dropped at place ${target + 1}: the admin announced ${listed(texts.filter((t) => /grabbed|dropped|position/i.test(t)))}.`, hint: 'The admin announces "dropped. Final position in list: N of M".' }), 5000);
  await eventually(this, async () => (await components(this, zone)).names, (now) => now.length === names.length && same(componentName(now[target]), componentName(names[index])),
    (now) => ({ message: `After the move, the dynamic zone "${zone}" holds ${listed(now)}.`, hint: 'The zone redraws its components in their new order.' }));
});

/**
 * Remove a component from a dynamic zone (its "Delete" button), by its name
 * and its rank.
 *
 * Example #1: When I remove the "Quote" component from "blocks"
 * Example #2: And I remove the "Rich text" component from "blocks"
 * Example #3: When I remove the second "Quote" component from "blocks"
 * Example #4: When I remove the "Media" component from "blocks"
 * Example #5: When I remove the first "Quote" component from "blocks"
 */
When(/^I remove the (?:(first|second|third|fourth|fifth) )?"([^"]*)" component from "([^"]*)"$/, { timeout: 60000 }, async function (rank, component, zone) {
  const { item, names } = await componentItem(this, zone, component, ORDINAL[rank] || 1);
  const remove = item.locator('h3').getByRole('button', { name: /^Delete( - .*)?$/ }).first();
  await remove.click();
  await eventually(this, async () => (await components(this, zone)).names, (now) => now.length === names.length - 1,
    (now) => ({ message: `After "Delete", the dynamic zone "${zone}" still holds ${listed(now)}.`, hint: 'The admin takes the component out of the zone at once (the entry still has to be saved).' }));
});

/**
 * The components a dynamic zone holds, in their order, by their names; or
 * that it holds none.
 *
 * Example #1: Then the "blocks" dynamic zone should hold "Quote", "Rich text" and "Media"
 * Example #2: Then the "blocks" dynamic zone should hold "Rich text" and "Quote"
 * Example #3: And the "blocks" dynamic zone should hold "Quote"
 * Example #4: Then the "blocks" dynamic zone should hold nothing
 * Example #5: Then the "blocks" dynamic zone should hold "Media", "Quote" and "Rich text"
 */
Then(/^the "([^"]*)" dynamic zone should hold (nothing|"[^"]*"(?:(?:, | and )"[^"]*")*)$/, async function (zone, list) {
  const wanted = list === 'nothing' ? [] : quotedList(list);
  await eventually(this, async () => (await components(this, zone)).names.map(componentName),
    (names) => names.length === wanted.length && names.every((n, i) => same(n, wanted[i])),
    (names) => ({ message: `The dynamic zone "${zone}" holds ${listed(names)}, not ${wanted.length ? listed(wanted) : 'nothing'} in that order.`, hint: 'The components are read in their order, by their display names.' }));
});
