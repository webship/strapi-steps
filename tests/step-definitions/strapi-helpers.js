'use strict';

// Shared plumbing of the admin steps: addresses, the request the browser cut,
// waiting for the admin's own loading states and for the admin API call of an
// action, the notifications, the users registry and the session cache, the
// Content Manager's list and edit view, the fields found by their labels, and
// the test-data client that makes and deletes test entries, files and folders
// through the admin's own API as the data administrator of the users registry.
//
// This file registers no step. The admin is a single-page app: a page change
// draws the page, then loads its data from the admin's API. While it loads, the
// admin marks its main area busy (`aria-busy="true"`) and shows a loader
// ("Loading content"); a list shows the loader in its table. The steps wait for
// those states to end and for the answer of the API call an action sends,
// never for a fixed time.

const { friendly, smartSettle } = require('webship-js/tests/step-definitions/webship');

// ---------------------------------------------------------------------------
// Budgets and text
// ---------------------------------------------------------------------------

/** The per-assertion wait budget: `minWaitTime.page` from cucumber.js, at least 15 seconds. */
function budget(world) {
  return Math.max((world && world.minWaitTime && world.minWaitTime.page) || 0, 15000);
}

/** White space collapsed and trimmed; the invisible marks some texts carry removed. */
function clean(text) {
  return String(text === null || text === undefined ? '' : text).replace(/[­​-‏‪-‮⁠﻿]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * A text as a comparison sees it: cleaned, in lower case, the typographic
 * quotes the same as the straight ones, and the mark of a required field
 * ("title*") or a closing colon dropped.
 */
function normal(text) {
  return clean(text).replace(/[“”„"]/g, '"').replace(/[‘’‚']/g, "'").replace(/["']/g, "'").replace(/\s*[*:]$/, '').toLowerCase();
}

/** Whether a text contains another, as `normal` reads them. */
function mentions(text, part) {
  return normal(text).includes(normal(part));
}

/** Whether two texts are the same, as `normal` reads them. */
function same(a, b) {
  return normal(a) === normal(b);
}

/** A list for an error message: `"a", "b", "c"` or `(none)`. */
function listed(values) {
  const items = [...new Set((values || []).map(clean).filter(Boolean))];
  return items.length ? items.map((item) => `"${item}"`).join(', ') : '(none)';
}

/** Escape a literal string for use in a RegExp. */
function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The quoted strings of a list in a step: `"a", "b" and "c"` -> ['a', 'b', 'c']. */
function quotedList(text) {
  return [...String(text).matchAll(/"([^"]*)"/g)].map((m) => m[1]);
}

/** A number of a step: `2`, or a word from one to twenty. */
function count(text) {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  const t = String(text).trim().toLowerCase();
  return /^\d+$/.test(t) ? parseInt(t, 10) : words.indexOf(t);
}

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

/** The site root without a trailing slash. */
function siteRoot(world) {
  return String(world.launchUrl || (world.parameters && world.parameters.launchUrl) || '').replace(/\/+$/, '');
}

/** The path of the admin (`worldParameters.adminPath`, /admin by default), without a trailing slash. */
function adminPath(world) {
  const value = String((world.parameters && world.parameters.adminPath) || '/admin').trim();
  return '/' + value.replace(/^\/+|\/+$/g, '');
}

/** An address under the admin: `adminUrl(world, 'auth/login')`. */
function adminUrl(world, rel = '') {
  const tail = String(rel).replace(/^\/+/, '');
  return siteRoot(world) + adminPath(world) + (tail ? '/' + tail : '');
}

/** An address of the site from a path (absolute addresses stay as they are). */
function absolute(world, href) {
  if (/^https?:\/\//.test(href)) return href;
  return siteRoot(world) + (String(href).startsWith('/') ? '' : '/') + href;
}

/** The path of the page's address, without the admin's path: '/content-manager/...'. */
function adminRoute(world) {
  try {
    const p = new URL(world.page.url()).pathname;
    return p.startsWith(adminPath(world)) ? p.slice(adminPath(world).length) || '/' : p;
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// The request the browser cut
// ---------------------------------------------------------------------------

/** The hint of a failure where the browser cut a request. */
const CUT_HINT = 'The request was cut, or the site\'s name did not resolve, because the network of the machine changed (a container starting); nothing is wrong with the scenario. Run it again. On a shared machine, run the suite in the project\'s container (cmd-tools-testing.sh <project> --run in the Webship Workspace), where the network of the host does not reach.';

/**
 * Whether the browser cut a request of this page: it shows its own error page
 * (chrome-error://, a network change aborted the page's request), or a request
 * to the site failed with a network error since `since` (a time stamp).
 * Returns a sentence for an error message, or ''.
 */
function cutRequest(world, since = 0) {
  const url = String((world.page && world.page.url()) || '');
  if (url.startsWith('chrome-error://')) {
    return `the browser shows its own error page (${url}): the request was cut before the site answered`;
  }
  const failed = (world.__strapiFailedRequests || []).filter((f) => f.at >= since && /ERR_NETWORK_CHANGED|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION_RESET|ERR_NAME_NOT_RESOLVED|ERR_ADDRESS_UNREACHABLE/.test(f.error));
  if (failed.length) {
    const f = failed[failed.length - 1];
    return `the browser lost the request ${f.method} ${f.url.replace(siteRoot(world), '')} (${f.error}): it was cut before the site answered`;
  }
  return '';
}

/** The hint for a failure: the cut request's when the browser cut one, else the one given. */
function hintFor(world, hint, since = 0) {
  return cutRequest(world, since) ? CUT_HINT : hint;
}

// ---------------------------------------------------------------------------
// Waiting for the admin
// ---------------------------------------------------------------------------

/** Whether the admin shows a loading state: its main area busy, or a loader ("Loading content"). */
async function isLoading(page) {
  return page.evaluate(() => {
    if (document.querySelector('main[aria-busy="true"], [aria-busy="true"][role="main"]')) return true;
    const loaders = [...document.querySelectorAll('main *, [role="dialog"] *')].filter((e) => e.childElementCount === 0 && /^Loading content\.?$/.test((e.textContent || '').trim()));
    return loaders.length > 0;
  }).catch(() => false);
}

/**
 * Wait until the admin is ready to use: the document has loaded, no loading
 * state is on screen, and the page has settled the way webship-js's own steps
 * settle (no request in flight, no pending timer, a quiet page).
 */
async function adminReady(world, timeout) {
  const page = world.page;
  const limit = timeout || budget(world);
  const deadline = Date.now() + limit;
  await page.waitForLoadState('domcontentloaded', { timeout: limit }).catch(() => {});
  while (Date.now() < deadline) {
    if (!(await isLoading(page))) break;
    await page.waitForTimeout(100);
  }
  await smartSettle(page, Math.min(3000, Math.max(500, deadline - Date.now())));
  while (Date.now() < deadline) {
    if (!(await isLoading(page))) return;
    await page.waitForTimeout(100);
  }
}

/**
 * Move the mouse off the main navigation: its icons show a tooltip while the
 * mouse is over them, and a tooltip lies over the links beside the
 * navigation (it takes the click meant for them).
 */
async function clearTooltips(page) {
  const size = page.viewportSize() || { width: 1280, height: 800 };
  await page.mouse.move(Math.round(size.width * 0.75), Math.round(size.height - 5)).catch(() => {});
  await page.locator('[data-radix-popper-content-wrapper] [role="tooltip"], [role="tooltip"]').first().waitFor({ state: 'detached', timeout: 1500 }).catch(() => {});
}

/** Open an address of the admin and wait until it is ready. A cut request is tried again once. */
async function open(world, url) {
  const page = world.page;
  const go = () => page.goto(url, { waitUntil: 'domcontentloaded', timeout: budget(world) * 2 });
  try {
    await go();
  } catch (err) {
    if (/ERR_NETWORK_CHANGED|chrome-error:\/\/chromewebdata|ERR_ABORTED|ERR_NAME_NOT_RESOLVED/.test(String(err && err.message))) {
      await page.waitForTimeout(500);
      await go().catch(() => {});
    } else {
      throw friendly({ message: `Could not open ${url}.`, cause: err, hint: 'Check launchUrl in cucumber.js and that the site is running (ddev describe).' });
    }
  }
  if (cutRequest(world)) {
    await page.waitForTimeout(500);
    await go().catch(() => {});
  }
  await adminReady(world);
}

/**
 * Run an action and wait for the answer of the admin API call it sends: the
 * first request whose method and address `test` accepts. The request must
 * start within `startWindow` ms of the action (an action sends its request at
 * once; a list the admin has in its cache sends none), then its answer is
 * awaited within the budget. Returns the response, or null when no request
 * went out; a request the browser cut fails the step and says so.
 */
async function withApi(world, test, action, { timeout, startWindow = 2500, required = false, what = 'the request' } = {}) {
  const page = world.page;
  const since = Date.now();
  const limit = timeout || budget(world);
  const started = page.waitForRequest((r) => {
    try { return test(r.method(), r.url(), r); } catch { return false; }
  }, { timeout: required ? limit : startWindow }).catch(() => null);
  await action();
  const request = await started;
  let response = null;
  if (request) {
    response = await Promise.race([
      request.response().catch(() => null),
      new Promise((resolve) => setTimeout(() => resolve(null), limit)),
    ]);
  }
  if (!response) {
    const cut = cutRequest(world, since);
    if (cut) throw friendly({ message: `The admin did not get the answer of ${what}: ${cut}.`, hint: CUT_HINT });
    if (required) {
      throw friendly({
        message: request ? `The admin got no answer to ${what} within ${Math.round(limit / 1000)} seconds.` : `The admin did not send ${what}.`,
        hint: 'The action did not reach the server, or the server did not answer: look at the screenshot of the failure for a dialog or a message that stopped it.',
      });
    }
  }
  await adminReady(world);
  return response;
}

/** Poll a reading until it satisfies a check, or fail with the last reading. */
async function eventually(world, read, check, explain, timeout) {
  const deadline = Date.now() + (timeout || budget(world));
  let value;
  for (;;) {
    value = await read();
    if (check(value)) return value;
    if (Date.now() > deadline) throw friendly(withCut(world, await explain(value)));
    await world.page.waitForTimeout(150);
  }
}

/** A failure that says so when the browser cut a request of the scenario: what the page lacks may never have come. */
function withCut(world, failure) {
  const cut = cutRequest(world);
  if (!cut || /cut before the site answered/.test(failure.message || '')) return failure;
  return Object.assign({}, failure, { message: `${failure.message} In this scenario ${cut}.`, hint: CUT_HINT });
}

/** The main heading of the page, as a person reads it. */
async function heading(page) {
  return clean(await page.locator('main h1, h1').first().innerText({ timeout: 2000 }).catch(() => ''));
}

/** What the page on screen says about itself, for an error message. */
async function pageSummary(world) {
  const cut = cutRequest(world);
  if (cut) return cut;
  const page = world.page;
  const title = clean(await page.title().catch(() => ''));
  const h1 = await heading(page);
  return `the page shows "${h1 || '(no heading)'}" (title "${title}") at ${page.url()}`;
}

// ---------------------------------------------------------------------------
// Notifications and dialogs
// ---------------------------------------------------------------------------

/** The notifications on screen (the admin's toasts, top of the page): their texts. */
async function notifications(page) {
  return (await page.locator('[data-sonner-toast]').evaluateAll((els) => els.map((li) => {
    const box = li.querySelector('[role="status"], [role="alert"]') || li;
    return (box.textContent || '').trim();
  })).catch(() => [])).map(clean).filter(Boolean);
}

/**
 * Wait for a notification that contains `text` (the admin shows each for a few
 * seconds). The notifications seen since the step started are remembered by a
 * listener on the page, so one that came and went is not missed.
 */
async function waitForNotification(world, text, timeout) {
  const page = world.page;
  const deadline = Date.now() + (timeout || budget(world));
  for (;;) {
    const seen = [...(world.__strapiToasts || []), ...(await notifications(page))];
    if (seen.some((t) => mentions(t, text))) return true;
    if (Date.now() > deadline) return false;
    await page.waitForTimeout(100);
  }
}

/** Remember every notification the admin shows on this page (a MutationObserver in the page). */
async function watchNotifications(world) {
  const page = world.page;
  world.__strapiToasts = world.__strapiToasts || [];
  if (page.__strapiToastWatch) return;
  page.__strapiToastWatch = true;
  await page.exposeBinding('__webshipStrapiToast', (source, text) => {
    const t = clean(text);
    if (t && !world.__strapiToasts.includes(t)) world.__strapiToasts.push(t);
  }).catch(() => {});
  const install = () => {
    const report = () => {
      document.querySelectorAll('[data-sonner-toast]').forEach((li) => {
        const box = li.querySelector('[role="status"], [role="alert"]') || li;
        const t = (box.textContent || '').trim();
        if (t && window.__webshipStrapiToast) window.__webshipStrapiToast(t);
      });
    };
    if (window.__webshipStrapiToastObserver) return;
    // The document itself is observed: an init script runs before the page has its <html> element.
    window.__webshipStrapiToastObserver = new MutationObserver(report);
    window.__webshipStrapiToastObserver.observe(document, { childList: true, subtree: true, characterData: true });
    report();
  };
  await page.addInitScript(install).catch(() => {});
  await page.evaluate(install).catch(() => {});
}

/** Forget the notifications seen so far (before an action whose notification a step waits for). */
function forgetNotifications(world) {
  world.__strapiToasts = [];
}

/** The open dialog with a name (its accessible name, or its first heading), or the last open one: a locator, or null. */
async function openDialog(page, name) {
  for (const role of ['alertdialog', 'dialog']) {
    if (!name) continue;
    const named = page.getByRole(role, { name });
    const n = await named.count().catch(() => 0);
    for (let i = n - 1; i >= 0; i -= 1) {
      if (await named.nth(i).isVisible().catch(() => false)) return named.nth(i);
    }
  }
  const dialogs = page.locator('[role="dialog"], [role="alertdialog"]');
  const n = await dialogs.count();
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = dialogs.nth(i);
    if (!(await d.isVisible().catch(() => false))) continue;
    if (!name) return d;
    const label = clean(await d.getAttribute('aria-label').catch(() => '')) || clean(await d.locator('h1, h2, h3').first().innerText({ timeout: 500 }).catch(() => ''));
    if (mentions(label, name)) return d;
  }
  return null;
}

/** Click the button of a confirmation dialog the action opened ("Confirm" by default). */
async function confirmDialog(world, button = 'Confirm', timeout) {
  const page = world.page;
  const deadline = Date.now() + (timeout || 5000);
  for (;;) {
    const dialog = await openDialog(page);
    if (dialog) {
      const target = dialog.getByRole('button', { name: button, exact: true });
      if (await target.count()) {
        await target.first().click();
        return true;
      }
    }
    if (Date.now() > deadline) return false;
    await page.waitForTimeout(100);
  }
}

// ---------------------------------------------------------------------------
// The users registry and the session cache
// ---------------------------------------------------------------------------

/** The account a handle of the users registry stands for: { handle, email, password }. */
function resolveUser(world, handle) {
  const users = (world.parameters && world.parameters.users) || {};
  const entry = users[handle];
  if (!entry) {
    throw friendly({
      message: `The user "${handle}" is not in the users registry. Known users: ${Object.keys(users).join(', ') || '(none)'}.`,
      hint: `Add it to worldParameters.users in cucumber.js: users: { ${handle}: { email: '${handle}@example.com', password: process.env.${String(handle).toUpperCase()}_PASSWORD } }. The account itself is made once by the build of the site, never by a feature.`,
    });
  }
  const email = entry.email || entry.username;
  if (!email || !entry.password) {
    throw friendly({
      message: `The user "${handle}" has no ${email ? 'password' : 'email address'} in the users registry.`,
      hint: `Set worldParameters.users.${handle}.email and .password in cucumber.js (the admin logs in with the email address).`,
    });
  }
  return { handle, email, password: entry.password };
}

/** A handle of the users registry stands for its email address; anything else is an email address. */
function emailOf(world, who) {
  const users = (world.parameters && world.parameters.users) || {};
  return users[who] ? resolveUser(world, who).email : who;
}

// The sessions of the accounts that logged in during this run, by site and
// account: the admin's cookies (its access token and its refresh token) after
// a login through the form.
const SESSIONS = new Map();

function sessionKey(world, email) {
  return `${siteRoot(world)}|${String(email).toLowerCase()}`;
}

function reuseSessions(world) {
  return !(world.parameters && world.parameters.reuseSessions === false);
}

/**
 * The account the admin says is signed in: it asks the admin's API with the
 * page's own token (the call the admin makes on every page). Returns
 * { email, firstname, lastname, roles } or null.
 */
async function signedInAccount(world) {
  const page = world.page;
  return page.evaluate(async (base) => {
    const token = (document.cookie.match(/(?:^|; )jwtToken=([^;]+)/) || [])[1] || localStorage.getItem('jwtToken') || sessionStorage.getItem('jwtToken');
    if (!token) return null;
    try {
      const r = await fetch(base + '/users/me', { headers: { Authorization: 'Bearer ' + decodeURIComponent(token).replace(/^"|"$/g, '') } });
      if (!r.ok) return null;
      const json = await r.json();
      const u = json && json.data;
      return u ? { email: u.email, firstname: u.firstname, lastname: u.lastname, roles: (u.roles || []).map((x) => x.name) } : null;
    } catch {
      return null;
    }
  }, adminPath(world)).catch(() => null);
}

/** The main navigation's profile button ("AW Administrator Webship"): there when an account is signed in. */
function profileButton(page) {
  return page.getByRole('navigation').first().locator('button[aria-haspopup="menu"]').last();
}

/** Whether the page is the admin's login page. */
async function onLoginPage(world) {
  return /\/auth\/login/.test(adminRoute(world)) || (await world.page.locator('form input[name="email"]').count().catch(() => 0)) > 0
    && (await world.page.locator('form input[name="password"]').count().catch(() => 0)) > 0;
}

const LOGIN_HINT = 'The admin login page has the fields "Email" and "Password" and the button "Login". Check launchUrl and adminPath in cucumber.js, and the account\'s email address and password in worldParameters.users.';

/**
 * Wait for the end of the window the admin's login limit gives (5 logins of
 * an account in 5 minutes from one address), from the X-RateLimit-Reset of
 * its answer, at most 6 minutes.
 */
async function waitForLoginLimit(world, response) {
  let until = 0;
  try {
    const reset = parseInt((response && response.headers()['x-ratelimit-reset']) || '0', 10);
    if (reset > 0) until = (reset > 1e12 ? reset : reset * 1000) + 1000;
  } catch { /* no header */ }
  const wait = Math.min(Math.max((until || Date.now() + 300000) - Date.now(), 1000), 360000);
  process.stderr.write(`\n[strapi-steps] The admin refused more logins of this account for now (its limit: 5 in 5 minutes). Waiting ${Math.round(wait / 1000)} s for the window to end, once.\n`);
  await world.page.waitForTimeout(wait);
}

/**
 * Fill in and send the admin login form, then read its outcome: the account
 * the admin then signs in, or the errors the login page shows.
 *
 * @returns {Promise<{account: (object|null), errors: string[], status: number, cut: boolean}>}
 */
async function submitLogin(world, email, password, { again = true, limitWaited = false, rememberMe = false } = {}) {
  const page = world.page;
  await page.context().clearCookies();
  world.__strapiSession = null;
  world.__strapiUser = null;
  await open(world, adminUrl(world, 'auth/login'));
  try {
    await page.locator('form input[name="email"]').waitFor({ state: 'visible', timeout: budget(world) });
  } catch (err) {
    throw friendly({ message: `The admin login form did not appear: ${await pageSummary(world)}.`, cause: err, hint: hintFor(world, LOGIN_HINT) });
  }
  await page.locator('form input[name="email"]').fill(email);
  await page.locator('form input[name="password"]').fill(password);
  if (rememberMe) {
    const box = page.getByRole('checkbox', { name: 'Remember me' });
    if ((await box.getAttribute('aria-checked').catch(() => 'false')) !== 'true') await box.click();
  }
  const since = Date.now();
  // The answer of the login request, or the form's own errors when the admin sends none (an empty field).
  const answered = page.waitForResponse((r) => r.request().method() === 'POST' && /\/admin\/login(\?|$)/.test(r.url()), { timeout: budget(world) }).catch(() => null);
  await page.locator('form').getByRole('button', { name: 'Login', exact: true }).click();
  let response = null;
  const deadline = Date.now() + budget(world);
  let settled = false;
  answered.then((r) => { response = r; settled = true; });
  while (!settled && Date.now() < deadline) {
    if ((await fieldErrors(page, page.locator('main'))).length) break;
    await page.waitForTimeout(100);
  }
  if (!settled && (await fieldErrors(page, page.locator('main'))).length === 0) response = await answered;
  await adminReady(world);
  const status = response ? response.status() : 0;
  if (!response && cutRequest(world, since)) {
    if (again) return submitLogin(world, email, password, { again: false, limitWaited, rememberMe });
    return { account: null, errors: [cutRequest(world, since)], status, cut: true };
  }
  if (status === 429 && !limitWaited) {
    await waitForLoginLimit(world, response);
    return submitLogin(world, email, password, { again, limitWaited: true, rememberMe });
  }
  if (status === 200) {
    await page.waitForURL((u) => !/\/auth\//.test(u.pathname), { timeout: budget(world) }).catch(() => {});
    await adminReady(world);
    const account = await signedInAccount(world);
    return { account, errors: account ? [] : ['the admin opened no page for the account'], status, cut: false };
  }
  const errors = await loginErrors(world);
  return { account: null, errors: errors.length ? errors : [`the admin answered the login with ${status || 'nothing'}`], status, cut: false };
}

/** The errors the login page shows: its alert ("Invalid credentials") and the fields' own errors. */
async function loginErrors(world) {
  const page = world.page;
  const deadline = Date.now() + 5000;
  for (;;) {
    const alerts = (await page.locator('main [role="alert"]').allInnerTexts().catch(() => [])).map(clean).filter(Boolean);
    const fields = await fieldErrors(page, page.locator('main'));
    const all = [...alerts, ...fields.map((f) => `${f.label}: ${f.error}`)];
    if (all.length || Date.now() > deadline) return all;
    await page.waitForTimeout(100);
  }
}

/** Take over the session an account opened earlier in this run. */
async function restoreSession(world, user) {
  const key = sessionKey(world, user.email);
  const cookies = SESSIONS.get(key);
  if (!cookies || !reuseSessions(world)) return false;
  const context = world.page.context();
  await context.clearCookies();
  await context.addCookies(cookies);
  await open(world, adminUrl(world));
  const account = await signedInAccount(world);
  if (account && same(account.email, user.email) && !(await onLoginPage(world))) {
    world.__strapiSession = key;
    world.__strapiUser = user;
    return true;
  }
  SESSIONS.delete(key);
  await context.clearCookies();
  return false;
}

/** Keep the cookies of the browser's session for the account (its access and refresh tokens). */
async function keepSession(world, user) {
  if (!reuseSessions(world)) return;
  const key = sessionKey(world, user.email);
  const host = new URL(siteRoot(world)).hostname;
  const cookies = (await world.page.context().cookies()).filter((c) => host.endsWith(c.domain.replace(/^\./, '')));
  SESSIONS.set(key, cookies);
  world.__strapiSession = key;
}

/**
 * Log in as an account of the users registry, by its handle: take over its
 * session when it has one from earlier in the run, else log in through the
 * form and keep the session for the next scenario.
 */
async function logInAs(world, handle) {
  const user = resolveUser(world, handle);
  if (await restoreSession(world, user)) return user;
  const outcome = await submitLogin(world, user.email, user.password);
  if (!outcome.account || !same(outcome.account.email, user.email)) {
    throw friendly({
      message: `Could not log in to the admin as "${handle}" (${user.email}): ${listed(outcome.errors)}.`,
      hint: outcome.cut ? CUT_HINT : 'Check the email address and the password of the account in worldParameters.users, and that the build of the site made the account and made it active.',
    });
  }
  world.__strapiUser = user;
  await keepSession(world, user);
  return user;
}

/** Forget the session of the browser in the session cache (it ended), or every session of an account. */
function forgetSession(world, email) {
  if (email) SESSIONS.delete(sessionKey(world, email));
  if (world.__strapiSession) SESSIONS.delete(world.__strapiSession);
  world.__strapiSession = null;
}

/** The account of the registry this scenario logged in as, or a failure that says to log in first. */
function currentUser(world) {
  if (world.__strapiUser) return world.__strapiUser;
  throw friendly({
    message: 'No account of the users registry is logged in in this scenario.',
    hint: 'Log in first: Given I am a logged in user with the "editor" user',
  });
}

/** Make sure an account is signed in before a step that works in the admin. */
function requireLogin(world) {
  currentUser(world);
}

// ---------------------------------------------------------------------------
// Forms: fields found by their labels
// ---------------------------------------------------------------------------

/**
 * The label of a field as a person reads it: the label's own text without the
 * mark of a required field, and for a relation without its count
 * ("category (1)" is "category").
 */
function labelText(text) {
  return clean(text).replace(/\s*\*$/, '').replace(/\s*\(\d+\)$/, '');
}

/** The errors the fields of a form show: [{ label, error }]. */
async function fieldErrors(page, scope) {
  return scope.evaluate((root) => {
    const out = [];
    root.querySelectorAll('[aria-invalid="true"]').forEach((el) => {
      const ids = String(el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      const error = ids.map((id) => document.getElementById(id)).filter(Boolean).map((e) => e.textContent.trim()).filter((t) => t && !/^max\.|^min\./i.test(t)).pop() || '';
      let label = '';
      if (el.id) {
        const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (l) label = l.textContent;
      }
      if (!label && el.getAttribute('aria-labelledby')) {
        const l = document.getElementById(el.getAttribute('aria-labelledby'));
        if (l) label = l.textContent;
      }
      if (!label) label = el.getAttribute('aria-label') || el.getAttribute('name') || '';
      out.push({ label: label.replace(/\s*\*$/, '').trim(), error });
    });
    return out;
  }).catch(() => []);
}

let MARK = 0;

/**
 * Find the field a person names by its label ("title", "metaTitle", "category";
 * the mark of a required field and a relation's count left out) inside `scope`
 * (a locator: the form, a component), and say what kind it is:
 * text, textarea, toggle, select, relation, media, blocks, markdown, date or other.
 *
 * @returns {Promise<{box: import('playwright').Locator, field: import('playwright').Locator, kind: string, label: string}|null>}
 */
async function findField(page, scope, label) {
  const mark = `wsf-${process.pid}-${(MARK += 1)}`;
  const found = await scope.evaluate((root, args) => {
    const [wanted, markValue] = args;
    const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim().replace(/\s*\*$/, '').replace(/\s*\(\d+\)$/, '').toLowerCase();
    const visible = (el) => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
    const labels = [...root.querySelectorAll('label, [id$="-label"]')].filter((l) => norm(l.textContent) === norm(wanted) && visible(l));
    for (const l of labels) {
      // The control the label names: its "for", or the element it labels by id.
      let control = l.getAttribute('for') ? document.getElementById(l.getAttribute('for')) : null;
      if (!control && l.id) control = document.querySelector(`[aria-labelledby="${CSS.escape(l.id)}"]`);
      if (!control && l.id) control = document.querySelector(`[aria-labelledby~="${CSS.escape(l.id)}"]`);
      // The field's box: the largest ancestor that holds no other field's label (a field has one
      // label; above its box are the labels of the next fields).
      let box = l;
      while (box.parentElement && box.parentElement !== root && box.parentElement.querySelectorAll('label').length === 1) box = box.parentElement;
      let kind = 'other';
      const slate = box.querySelector('[data-slate-editor="true"]');
      const cm = box.querySelector('.CodeMirror');
      const assets = [...box.querySelectorAll('button')].some((b) => /^Add asset$/.test((b.textContent || '').trim()));
      const textInput = control && /^(INPUT|TEXTAREA)$/.test(control.tagName) && !['file', 'hidden', 'checkbox'].includes(control.type) && control.getAttribute('type') !== 'relation';
      if (assets && !textInput) { kind = 'media'; control = null; }
      else if (slate) { control = slate; kind = 'blocks'; }
      else if (cm) { control = cm; kind = 'markdown'; }
      else if (control && control.tagName === 'INPUT' && control.getAttribute('type') === 'relation') kind = 'relation';
      else if (control && control.tagName === 'INPUT' && control.type === 'checkbox') kind = 'toggle';
      else if (control && control.tagName === 'TEXTAREA') kind = 'textarea';
      else if (control && control.getAttribute('role') === 'combobox' && control.tagName !== 'INPUT') kind = 'select';
      else if (control && control.tagName === 'INPUT' && control.getAttribute('role') === 'combobox') kind = /date|time/i.test(control.getAttribute('placeholder') || '') ? 'date' : 'combobox';
      else if (control && control.tagName === 'INPUT') kind = 'text';
      if (!control && kind !== 'media') continue;
      // A field marked by an earlier call keeps its mark: the locators made from it stay good.
      const target = control || box;
      const kept = target.getAttribute('data-webship-field') || (box && box.getAttribute('data-webship-field-box'));
      const value = kept || markValue;
      target.setAttribute('data-webship-field', value);
      if (box) box.setAttribute('data-webship-field-box', value);
      return { kind, label: l.textContent.replace(/\s*\*$/, '').trim(), mark: value };
    }
    return null;
  }, [label, mark]).catch(() => null);
  if (!found) return null;
  return {
    field: page.locator(`[data-webship-field="${found.mark}"]`).first(),
    box: page.locator(`[data-webship-field-box="${found.mark}"]`).first(),
    kind: found.kind,
    label: found.label,
  };
}

/** The labels of the fields in a scope, for an error message. */
async function fieldLabels(scope) {
  return (await scope.evaluate((root) => [...root.querySelectorAll('label')].filter((l) => l.offsetWidth || l.offsetHeight).map((l) => l.textContent.replace(/\s*\*$/, '').replace(/\s*\(\d+\)$/, '').trim())).catch(() => [])).filter(Boolean);
}

/** The field or a failure that lists the fields there are. */
async function fieldOrFail(world, scope, label, where = 'the form') {
  const field = await findField(world.page, scope, label);
  if (field) return field;
  throw friendly({
    message: `There is no field "${label}" in ${where}. Its fields: ${listed(await fieldLabels(scope))}.`,
    hint: hintFor(world, 'A field is named by its label as the edit view shows it (the attribute\'s name unless the view was configured: "title", "metaTitle"), without the "*" of a required field.'),
  });
}

const YES = /^(yes|true|on|checked|ticked|1)$/i;
const NO = /^(no|false|off|unchecked|unticked|0)$/i;

/** Replace the text of a rich-text editor (the blocks editor or the Markdown editor) by typing it. */
async function typeInEditor(world, field, value) {
  const page = world.page;
  if (field.kind === 'markdown') {
    await field.field.locator('.CodeMirror-code, .CodeMirror-scroll').first().click();
  } else {
    await field.field.click();
  }
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  const lines = String(value).split(/\\n|\n/);
  for (let i = 0; i < lines.length; i += 1) {
    if (i > 0) await page.keyboard.press('Enter');
    if (lines[i]) await page.keyboard.type(lines[i]);
  }
}

/** The text a rich-text editor holds. */
async function editorText(field) {
  if (field.kind === 'markdown') {
    return clean(await field.field.evaluate((cm) => (cm.CodeMirror ? cm.CodeMirror.getValue() : cm.innerText)).catch(() => ''));
  }
  return clean(await field.field.innerText().catch(() => ''));
}

/** Choose an option of a list box the admin opened (a select, a combobox): by its text. */
async function chooseOption(world, text, label) {
  const page = world.page;
  const option = page.locator('[role="listbox"] [role="option"]').filter({ hasText: new RegExp(`^\\s*${escapeRegExp(clean(text))}\\s*$`, 'i') });
  try {
    await option.first().waitFor({ state: 'visible', timeout: budget(world) });
  } catch {
    const offered = await page.locator('[role="listbox"] [role="option"]').allInnerTexts().catch(() => []);
    await page.keyboard.press('Escape').catch(() => {});
    throw friendly({ message: `"${label}" offers no "${text}". It offers: ${listed(offered)}.`, hint: hintFor(world, 'An option is named by its text as the list shows it.') });
  }
  await option.first().click();
}

/** Set a field, by its kind, to a value as a person would. */
async function setField(world, scope, label, value, where = 'the form') {
  const page = world.page;
  const field = await fieldOrFail(world, scope, label, where);
  const disabled = await field.field.evaluate((el) => !!(el.disabled || el.getAttribute('aria-disabled') === 'true' || el.closest('[aria-disabled="true"]'))).catch(() => false);
  if (disabled) {
    throw friendly({ message: `The field "${field.label}" is read only here, so "${value}" cannot be set.`, hint: 'The published version of an entry and the fields an account may not change are read only; edit the draft ("draft" tab).' });
  }
  switch (field.kind) {
    case 'toggle': {
      const wanted = YES.test(value) ? true : NO.test(value) ? false : null;
      if (wanted === null) throw friendly({ message: `The field "${field.label}" is a true/false switch: set it to "true" or "false", not "${value}".`, hint: 'Example: When I set "featured" to "true"' });
      if ((await field.field.isChecked()) !== wanted) await field.field.click({ force: true });
      break;
    }
    case 'select':
      await field.field.click();
      await chooseOption(world, value, field.label);
      break;
    case 'relation':
      await chooseRelation(world, field, value);
      break;
    case 'blocks':
    case 'markdown':
      await typeInEditor(world, field, value);
      break;
    case 'media':
      throw friendly({ message: `The field "${field.label}" holds files: choose one with the media step.`, hint: `Example: When I choose the asset "meadow.png" for "${field.label}"` });
    default:
      await field.field.fill(String(value));
  }
  await smartSettle(page, 1500);
  return field;
}

/** The value of a field as the form shows it. */
async function readField(world, scope, label, where = 'the form') {
  const field = await fieldOrFail(world, scope, label, where);
  switch (field.kind) {
    case 'toggle':
      return (await field.field.isChecked()) ? 'true' : 'false';
    case 'select':
      return clean(await field.field.innerText());
    case 'relation':
      return (await relationItems(field)).join(', ');
    case 'media':
      return (await mediaItems(field)).join(', ');
    case 'blocks':
    case 'markdown':
      return editorText(field);
    default:
      return clean(await field.field.inputValue().catch(async () => field.field.innerText()));
  }
}

// ---------------------------------------------------------------------------
// Relations and media
// ---------------------------------------------------------------------------

/** The entries a relation field lists (its chosen entries). */
async function relationItems(field) {
  return (await field.box.locator('ol li, ul li').evaluateAll((lis) => lis.map((li) => {
    const b = li.querySelector('button, a');
    return (b ? b.textContent : li.textContent) || '';
  })).catch(() => [])).map(clean).filter((t) => t && !/^Remove$/i.test(t));
}

/** Choose an entry in a relation field: type its name, wait for the admin's search answer, choose it. */
async function chooseRelation(world, field, value) {
  const page = world.page;
  const input = field.field;
  const searched = (method, url) => {
    if (method !== 'GET' || !/\/content-manager\/relations\//.test(url)) return false;
    try { return new URL(url).searchParams.get('_q') === String(value); } catch { return false; }
  };
  await withApi(world, searched, async () => { await input.click(); await input.fill(String(value)); }, { what: `the search of the relation "${field.label}"` });
  const option = page.locator('[role="listbox"] [role="option"]').filter({ hasText: new RegExp(`^\\s*${escapeRegExp(clean(value))}\\s*$`, 'i') });
  try {
    await option.first().waitFor({ state: 'visible', timeout: budget(world) });
  } catch {
    const offered = (await page.locator('[role="listbox"] [role="option"]').allInnerTexts().catch(() => [])).map(clean).filter((t) => t && !/^Create a relation$/i.test(t));
    await input.fill('').catch(() => {});
    throw friendly({ message: `The relation "${field.label}" finds no entry "${value}". It offers: ${listed(offered)}.`, hint: hintFor(world, 'A related entry is named by the text the relation shows for it (its main field). An entry an account may not read is not offered.') });
  }
  await option.first().click();
  await eventually(world, () => relationItems(field), (items) => items.some((t) => same(t, value)),
    (items) => ({ message: `After choosing "${value}", the relation "${field.label}" lists ${listed(items)}.`, hint: 'The admin adds a chosen entry to the list under the field.' }));
}

/** The files a media field holds (their names). */
async function mediaItems(field) {
  return (await field.box.locator('button').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label') || b.textContent || ''))).map(clean)
    .map((t) => (t.match(/^Remove (.+)$/) || [])[1]).filter(Boolean);
}

// ---------------------------------------------------------------------------
// The Content Manager: content types, the list, the edit view
// ---------------------------------------------------------------------------

/** The Content Manager's own navigation: its links, by name ({ name, href, kind }). */
async function contentManagerLinks(world) {
  const nav = world.page.getByRole('navigation', { name: 'Content Manager' });
  return (await nav.locator('a[href]').evaluateAll((as) => as.map((a) => ({ name: (a.textContent || '').trim(), href: a.getAttribute('href') })))).map((l) => ({
    ...l,
    kind: /\/single-types\//.test(l.href) ? 'single' : 'collection',
  }));
}

/** Open the Content Manager, then one of its content types by its name, and wait for its page. */
async function openContentType(world, name) {
  requireLogin(world);
  const page = world.page;
  if (!/^\/content-manager/.test(adminRoute(world))) {
    // The main navigation's "Content Manager", as a person goes there; a full page load when it is not on screen.
    const main = page.getByRole('navigation').first().getByRole('link', { name: 'Content Manager', exact: true });
    if (await main.isVisible().catch(() => false)) {
      await main.click();
      await clearTooltips(page);
      await page.waitForURL((u) => /\/content-manager/.test(u.pathname), { timeout: budget(world) }).catch(() => {});
      await adminReady(world);
    } else {
      await open(world, adminUrl(world, 'content-manager'));
    }
  }
  const nav = page.getByRole('navigation', { name: 'Content Manager' });
  // The navigation lists the content types once the admin has read them.
  const links = await eventually(world, () => contentManagerLinks(world), (all) => all.some((l) => same(l.name, name)),
    async (all) => ({
      message: `The Content Manager has no content type "${name}". It lists ${listed(all.map((l) => l.name))}.`,
      hint: hintFor(world, 'A content type is named as the Content Manager lists it (its display name: "Article", "Homepage"); an account sees only the types it may read.'),
    }));
  const link = links.find((l) => same(l.name, name));
  const uid = decodeURIComponent((link.href.match(/(?:collection|single)-types\/([^/?#]+)/) || [])[1] || '');
  const kindPath = link.kind === 'single' ? 'single-types' : 'collection-types';
  const here = () => { try { return decodeURIComponent(new URL(page.url()).pathname).replace(/\/+$/, '').endsWith(`/${kindPath}/${uid}`); } catch { return false; } };
  // The Content Manager opens on its first collection type: a list already on screen is not opened again.
  if (!here()) {
    await withApi(world, (method, url) => method === 'GET' && url.includes(`/content-manager/${kindPath}/${uid}`),
      () => nav.getByRole('link', { name: link.name, exact: true }).click(), { what: `the ${link.kind === 'single' ? 'entry' : 'list'} of "${link.name}"` });
  }
  await page.waitForURL((u) => decodeURIComponent(u.pathname).includes(`/${kindPath}/${uid}`), { timeout: budget(world) }).catch(() => {});
  if (link.kind === 'collection') await listReady(world);
  else await editViewReady(world);
  return { ...link, uid };
}

/** The list's table, once it has its rows or its empty state (not while it loads). */
async function listReady(world) {
  const page = world.page;
  await eventually(world, async () => {
    if (await isLoading(page)) return 'loading';
    const main = page.getByRole('main');
    if (await main.getByText(/^No content found$/).count().catch(() => 0)) return 'empty';
    if (await main.locator('table tbody tr').count().catch(() => 0)) return 'rows';
    if (await main.getByText(/^You don't have the permissions to access that content$/).count().catch(() => 0)) return 'refused';
    return 'loading';
  }, (state) => state !== 'loading', async () => ({ message: `The list did not finish loading: ${await pageSummary(world)}.`, hint: hintFor(world, 'Open a list first: Given I am on the "Article" list') }));
}

/** Whether the page is a Content Manager list. */
async function onList(world) {
  return /^\/content-manager\/collection-types\/[^/]+\/?$/.test(adminRoute(world));
}

/** Fail unless the page is a Content Manager list. */
async function listOrFail(world) {
  if (!(await onList(world))) {
    throw friendly({ message: `This step works on a list of the Content Manager, but ${await pageSummary(world)}.`, hint: 'Open the list first: Given I am on the "Article" list' });
  }
  await listReady(world);
}

/** The count the list reads above its table ("24 entries found"): a number, or null. */
async function listCount(page) {
  const texts = await page.getByRole('main').locator('p').allInnerTexts().catch(() => []);
  for (const t of texts) {
    const m = clean(t).match(/^(\d+) entr(?:y|ies) found$/i);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

/** The column headings of the list (the attribute names, as the header shows them). */
async function listColumns(page) {
  return (await page.getByRole('main').locator('table thead th').evaluateAll((ths) => ths.map((th) => (th.textContent || '').trim())).catch(() => [])).map(clean).filter(Boolean);
}

/** The rows of the list: their cells' texts, by column, and the row locator. */
async function listRows(page) {
  const columns = await listColumns(page);
  const raw = await page.getByRole('main').locator('table tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => {
    const status = td.querySelector('[role="status"]');
    return (status ? status.textContent : td.textContent || '').trim();
  }))).catch(() => []);
  // The first cell is the row's check box, which has no heading.
  return raw.filter((cells) => cells.length > 1).map((cells, index) => {
    const byColumn = {};
    columns.forEach((name, i) => { byColumn[normal(name)] = clean(cells[i + 1] || ''); });
    return { index, cells: cells.map(clean), byColumn };
  });
}

/** The text a row is known by: the list's main field (the first column after the id), else its first text. */
function rowName(row) {
  const keys = Object.keys(row.byColumn).filter((k) => k !== 'id' && k !== 'documentid');
  return row.byColumn[keys[0]] || row.cells.find((c) => c && !/^\d+$/.test(c)) || '';
}

/** The row that shows an entry by its name (any cell with exactly that text). */
async function listRow(world, name) {
  const page = world.page;
  const rows = await listRows(page);
  const row = rows.find((r) => r.cells.some((c) => same(c, name)));
  if (!row) return null;
  return { ...row, locator: page.getByRole('main').locator('table tbody tr').nth(row.index) };
}

/** The row of an entry or a failure that lists the rows there are. */
async function listRowOrFail(world, name) {
  await listOrFail(world);
  const row = await listRow(world, name);
  if (row) return row;
  const rows = await listRows(world.page);
  throw friendly({ message: `The list shows no "${name}". It shows ${listed(rows.map(rowName))}.`, hint: hintFor(world, 'An entry is named by the text of one of its cells (its title). Only the current page is read: search the list or go to another page.') });
}

/** The edit view's header status ("Draft", "Published", "Modified"). */
async function entryStatus(page) {
  return clean(await page.getByRole('main').getByRole('status').first().innerText({ timeout: 2000 }).catch(() => ''));
}

/** The side panel of the edit view ("Entry": Publish, Save, More document actions). */
function sidePanel(page) {
  return page.getByRole('complementary').filter({ has: page.getByRole('heading', { name: 'Entry', exact: true }) }).first();
}

/** Whether the page is an edit view (an entry of a collection type, a new entry, or a single type). */
async function onEditView(world) {
  return /^\/content-manager\/(collection-types\/[^/]+\/[^/?#]+|single-types\/[^/?#]+)/.test(adminRoute(world));
}

/** Wait for the edit view: the form drawn, the side panel there. */
async function editViewReady(world) {
  const page = world.page;
  await adminReady(world);
  await eventually(world, async () => (await sidePanel(page).count()) > 0 && !(await isLoading(page)), (ok) => ok,
    async () => ({
      message: (await sidePanel(page).count()) > 0
        ? `The edit view did not finish loading: ${await pageSummary(world)}.`
        : `The edit view did not open: ${await pageSummary(world)}.`,
      hint: hintFor(world, 'An entry opens from its list; an account may open only the entries it may read.'),
    }));
}

/** Fail unless the page is an edit view. */
async function editViewOrFail(world) {
  if (!(await onEditView(world))) {
    throw friendly({ message: `This step works in the edit view of an entry, but ${await pageSummary(world)}.`, hint: 'Open an entry first: When I open "Harbour lights at dusk" from the list' });
  }
  await editViewReady(world);
}

/** The form of the edit view: the panel of the selected tab ("draft"), else the main area. */
function editForm(page) {
  return page.getByRole('main').locator('[role="tabpanel"][data-state="active"], [role="tabpanel"]:not([hidden])').first();
}

// ---------------------------------------------------------------------------
// Dynamic zones
// ---------------------------------------------------------------------------

/** The components of a dynamic zone, by their names on screen ("Quote - An explorer"), with their items. */
async function zoneItems(world, zone) {
  const page = world.page;
  const form = editForm(page);
  const field = await findField(page, form, zone);
  if (!field) return null;
  const names = await field.box.locator('li').evaluateAll((lis) => lis.filter((li) => li.querySelector(':scope > div h3, h3')).map((li) => {
    const h = li.querySelector('h3 button');
    return (h ? h.textContent : '') || '';
  })).catch(() => []);
  return { field, names: names.map(clean).filter(Boolean) };
}

/**
 * The box of a dynamic zone, by its name: the zone has no label of its own,
 * its name is the heading over its components ("blocks (3)") and its button
 * reads "Add a component to blocks". Returns a locator, or null.
 */
async function zoneBox(page, scope, zone) {
  const mark = `wsz-${process.pid}-${(MARK += 1)}`;
  const found = await scope.evaluate((root, args) => {
    const [wanted, markValue] = args;
    const norm = (t) => String(t || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    const button = [...root.querySelectorAll('button')].find((b) => norm(b.textContent) === norm(`Add a component to ${wanted}`));
    if (!button) return false;
    let box = button.parentElement;
    for (let i = 0; i < 10 && box; i += 1) {
      const heads = [...box.querySelectorAll('span')].filter((sp) => norm(sp.textContent) === norm(wanted));
      if (heads.length) break;
      box = box.parentElement;
    }
    // A box marked by an earlier call keeps its mark: the locators made from it stay good.
    const target = box || button.parentElement;
    if (!target.getAttribute('data-webship-zone')) target.setAttribute('data-webship-zone', markValue);
    return target.getAttribute('data-webship-zone');
  }, [zone, mark]).catch(() => null);
  return found ? page.locator(`[data-webship-zone="${found}"]`).first() : null;
}

/** The component name a person reads ("Quote" of "Quote - An explorer"). */
function componentName(text) {
  return clean(text).replace(/\s+-\s+.*$/, '');
}

// ---------------------------------------------------------------------------
// The test-data client: the admin's own API, as the data administrator
// ---------------------------------------------------------------------------

const CLIENTS = new Map();

/** The handle of the account the test-data steps work as (`worldParameters.dataAdmin`, a Super Admin). */
function dataAdminHandle(world) {
  return (world.parameters && world.parameters.dataAdmin) || 'administrator';
}

/**
 * A client of the admin's API, logged in as the data administrator of the
 * users registry, with a session of its own: the browser's session is never
 * touched. One client per site and account, for the whole run (one login: the
 * admin allows 5 in 5 minutes).
 */
async function dataClient(world) {
  const admin = resolveUser(world, dataAdminHandle(world));
  const key = `${siteRoot(world)}|${admin.email}`;
  if (CLIENTS.has(key)) return CLIENTS.get(key);
  const { request } = require('playwright');
  const context = await request.newContext({ ignoreHTTPSErrors: true, baseURL: siteRoot(world) });
  const retrying = async (fn) => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await fn();
      } catch (err) {
        // A network change on the machine cuts a request now and then, or the site's name does not
        // resolve for a moment (a container network starting): go again, four times, waiting longer
        // each time; then say what happened.
        const passing = /ERR_NETWORK_CHANGED|ECONNRESET|ECONNREFUSED|socket hang up|ETIMEDOUT|EPIPE|EAI_AGAIN/i.test(String(err && err.message));
        if (passing && attempt < 4) {
          await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
          continue;
        }
        if (passing) throw friendly({ message: `The test-data steps could not reach the site: ${String(err.message).split('\n')[0]}.`, cause: err, hint: CUT_HINT });
        throw err;
      }
    }
  };
  let token = null;
  const call = async (method, url, { data, multipart, allow = [] } = {}) => {
    const options = { method, failOnStatusCode: false, headers: token ? { Authorization: `Bearer ${token}` } : {} };
    if (data !== undefined) options.data = data;
    if (multipart) options.multipart = multipart;
    const response = await retrying(() => context.fetch(url, options));
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    if (!response.ok() && !allow.includes(response.status())) {
      const detail = json && json.error ? `${json.error.name}: ${json.error.message}` : text.slice(0, 200);
      throw friendly({ message: `The test-data steps got ${response.status()} from ${method} ${url}: ${detail}.`, hint: `The test-data steps work as worldParameters.dataAdmin ("${dataAdminHandle(world)}"): a Super Admin of the users registry, with its email address and password.` });
    }
    return { status: response.status(), json, headers: response.headers() };
  };
  // One login; if the admin's login limit is reached, wait once for its window to end.
  let answer = await call('POST', '/admin/login', { data: { email: admin.email, password: admin.password }, allow: [400, 401, 429] });
  if (answer.status === 429) {
    const reset = parseInt(answer.headers['x-ratelimit-reset'] || '0', 10);
    const wait = Math.min(Math.max(((reset > 1e12 ? reset : reset * 1000) || Date.now() + 300000) - Date.now() + 1000, 1000), 360000);
    process.stderr.write(`\n[strapi-steps] The admin refused more logins of the data administrator for now. Waiting ${Math.round(wait / 1000)} s, once.\n`);
    await new Promise((r) => setTimeout(r, wait));
    answer = await call('POST', '/admin/login', { data: { email: admin.email, password: admin.password }, allow: [400, 401, 429] });
  }
  token = answer.json && answer.json.data && (answer.json.data.token || answer.json.data.accessToken);
  if (!token) {
    throw friendly({
      message: `The test-data steps could not log in to the admin as "${dataAdminHandle(world)}" (${admin.email}): ${(answer.json && answer.json.error && answer.json.error.message) || `HTTP ${answer.status}`}.`,
      hint: 'worldParameters.dataAdmin names the account the test entries are made and deleted with: a Super Admin of the users registry, with its email address and password.',
    });
  }
  const client = { call, context, admin, types: null };
  CLIENTS.set(key, client);
  return client;
}

/** Close the test-data clients at the end of the run. */
async function closeClients() {
  for (const client of CLIENTS.values()) await client.context.dispose().catch(() => {});
  CLIENTS.clear();
}

/**
 * A content type of the Content Manager by its display name ("Article"):
 * { uid, kind, displayName, mainField, localized, draftAndPublish }.
 */
async function contentTypeInfo(world, name) {
  const client = await dataClient(world);
  if (!client.types) {
    const { json } = await client.call('GET', '/content-manager/init');
    client.types = (json && json.data && json.data.contentTypes) || [];
    client.mainFields = {};
  }
  const type = client.types.find((t) => t.isDisplayed !== false && (same(t.info && t.info.displayName, name) || same(t.uid, name)));
  if (!type) {
    throw friendly({ message: `The site has no content type "${name}". It has ${listed(client.types.filter((t) => t.isDisplayed !== false).map((t) => t.info && t.info.displayName))}.`, hint: 'A content type is named by its display name, as the Content Manager lists it.' });
  }
  if (!client.mainFields[type.uid]) {
    const { json } = await client.call('GET', `/content-manager/content-types/${type.uid}/configuration`);
    client.mainFields[type.uid] = (json && json.data && json.data.contentType && json.data.contentType.settings && json.data.contentType.settings.mainField) || 'id';
  }
  return {
    uid: type.uid,
    kind: type.kind,
    displayName: type.info && type.info.displayName,
    mainField: client.mainFields[type.uid],
    localized: !!(type.pluginOptions && type.pluginOptions.i18n && type.pluginOptions.i18n.localized),
    draftAndPublish: !!(type.options && type.options.draftAndPublish),
  };
}

/** The entries of a content type whose main field is exactly `text`, in a locale: [{ documentId, status, ... }]. */
async function findEntries(world, name, text, locale) {
  const client = await dataClient(world);
  const type = await contentTypeInfo(world, name);
  const params = new URLSearchParams({ page: '1', pageSize: '100' });
  params.set(`filters[$and][0][${type.mainField}][$eq]`, text);
  if (type.localized && locale) params.set('locale', locale);
  const { json } = await client.call('GET', `/content-manager/collection-types/${type.uid}?${params}`);
  return ((json && json.results) || []).map((r) => ({ ...r, uid: type.uid }));
}

/** Delete an entry (every locale) by its document id; one that is gone already is no error. */
async function deleteEntry(world, uid, documentId) {
  const client = await dataClient(world);
  await client.call('DELETE', `/content-manager/collection-types/${uid}/${documentId}?locale=*`, { allow: [404] });
}

/** Delete the entries of a content type named `text` (in every locale the site has). */
async function deleteEntriesNamed(world, name, text) {
  const type = await contentTypeInfo(world, name);
  const locales = type.localized ? await localeCodes(world) : [null];
  for (const locale of locales) {
    for (const entry of await findEntries(world, name, text, locale)) await deleteEntry(world, type.uid, entry.documentId);
  }
}

/** The codes of the site's locales ("en", "fr"). */
async function localeCodes(world) {
  const client = await dataClient(world);
  if (!client.locales) {
    const { json } = await client.call('GET', '/i18n/locales');
    client.locales = (Array.isArray(json) ? json : (json && json.data) || []).map((l) => ({ code: l.code, name: l.name, isDefault: l.isDefault }));
  }
  return client.locales.map((l) => l.code);
}

/** A locale by its name as the admin shows it ("French (fr)") or its code ("fr"): its code. */
async function localeCode(world, name) {
  await localeCodes(world);
  const client = await dataClient(world);
  const locale = client.locales.find((l) => same(l.name, name) || same(l.code, name));
  if (!locale) throw friendly({ message: `The site has no locale "${name}". It has ${listed(client.locales.map((l) => l.name))}.`, hint: 'A locale is named as the admin shows it: "French (fr)".' });
  return locale.code;
}

/** Delete a file of the Media Library by its id; one that is gone already is no error. */
async function deleteFile(world, id) {
  const client = await dataClient(world);
  await client.call('DELETE', `/upload/files/${id}`, { allow: [404] });
}

/** Delete a folder of the Media Library (and what it holds) by its id. */
async function deleteFolder(world, id) {
  const client = await dataClient(world);
  await client.call('POST', '/upload/actions/bulk-delete', { data: { fileIds: [], folderIds: [id] }, allow: [404] });
}

/** The files of the Media Library named `name`: [{ id, name, folderPath }]. */
async function findFiles(world, name) {
  const client = await dataClient(world);
  const params = new URLSearchParams({ page: '1', pageSize: '100' });
  params.set('filters[$and][0][name][$eq]', name);
  const { json } = await client.call('GET', `/upload/files?${params}`);
  return (json && (json.results || json.data)) || [];
}

/** The folders of the Media Library named `name`: [{ id, name }]. */
async function findFolders(world, name) {
  const client = await dataClient(world);
  const params = new URLSearchParams();
  params.set('filters[$and][0][name][$eq]', name);
  params.set('pagination[pageSize]', '100');
  const { json } = await client.call('GET', `/upload/folders?${params}`);
  return (json && json.data) || [];
}

// ---------------------------------------------------------------------------
// Cleaning up after a scenario
// ---------------------------------------------------------------------------

/** Whether the steps clean up after each scenario (`worldParameters.adminCleanUp`, on by default). */
function cleansUp(world) {
  return !(world.parameters && world.parameters.adminCleanUp === false);
}

/** Do something after the scenario, whatever happens in it (in the reverse order of the calls). */
function afterScenario(world, label, fn) {
  if (!world.__strapiCleanUp) world.__strapiCleanUp = [];
  if (world.__strapiCleanUp.some((item) => item.label === label)) return;
  world.__strapiCleanUp.push({ label, fn });
}

module.exports = {
  budget,
  clean,
  normal,
  mentions,
  same,
  listed,
  escapeRegExp,
  quotedList,
  count,
  siteRoot,
  adminPath,
  adminUrl,
  absolute,
  adminRoute,
  CUT_HINT,
  cutRequest,
  hintFor,
  isLoading,
  adminReady,
  clearTooltips,
  open,
  withApi,
  eventually,
  heading,
  pageSummary,
  notifications,
  waitForNotification,
  watchNotifications,
  forgetNotifications,
  openDialog,
  confirmDialog,
  resolveUser,
  emailOf,
  signedInAccount,
  profileButton,
  onLoginPage,
  submitLogin,
  loginErrors,
  logInAs,
  keepSession,
  forgetSession,
  currentUser,
  requireLogin,
  labelText,
  fieldErrors,
  findField,
  fieldLabels,
  fieldOrFail,
  setField,
  readField,
  typeInEditor,
  editorText,
  chooseOption,
  relationItems,
  chooseRelation,
  mediaItems,
  contentManagerLinks,
  openContentType,
  listReady,
  onList,
  listOrFail,
  listCount,
  listColumns,
  listRows,
  rowName,
  listRow,
  listRowOrFail,
  entryStatus,
  sidePanel,
  onEditView,
  editViewReady,
  editViewOrFail,
  editForm,
  zoneItems,
  zoneBox,
  componentName,
  dataAdminHandle,
  dataClient,
  closeClients,
  contentTypeInfo,
  findEntries,
  deleteEntry,
  deleteEntriesNamed,
  localeCodes,
  localeCode,
  deleteFile,
  deleteFolder,
  findFiles,
  findFolders,
  cleansUp,
  afterScenario,
};
