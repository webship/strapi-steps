'use strict';

// The session: logging in by a handle of the users registry (the session of an
// account is taken over from earlier in the run when it has one) or through
// the login form, a refused login, a visitor, logging out, and who is signed
// in. The admin logs in with an email address and allows 5 logins of an
// account in 5 minutes from one address: a step that meets the limit waits
// once for its window to end.

const { Given, When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const {
  budget,
  clean,
  same,
  mentions,
  listed,
  adminUrl,
  open,
  adminReady,
  eventually,
  pageSummary,
  hintFor,
  CUT_HINT,
  resolveUser,
  emailOf,
  signedInAccount,
  profileButton,
  onLoginPage,
  submitLogin,
  logInAs,
  keepSession,
  forgetSession,
  withApi,
} = require('./strapi-helpers');

const LOGIN_TIMEOUT = { timeout: 420000 };

/**
 * Log in to the admin as an account of the users registry, by its handle. An
 * account that logged in earlier in the run takes its session over; else the
 * login form is filled in, and the session is kept for the next scenarios.
 *
 * Example #1: Given I am a logged in user with the "editor" user
 * Example #2: Given I am a logged in user with the "administrator" user
 * Example #3: Given I am a logged in user with the "author" user
 * Example #4: And I am a logged in user with the "editor" user
 * Example #5: Given I am a logged in user with the "administrator" user
 */
Given(/^I am a logged in user with the "([^"]*)" user$/, LOGIN_TIMEOUT, async function (handle) {
  await logInAs(this, handle);
});

/**
 * Be a visitor: no session in the browser, on the admin's login page (the
 * site's root sends a visitor there too).
 *
 * Example #1: Given I am not logged in
 * Example #2: And I am not logged in
 * Example #3: Given I am not logged in
 * Example #4: When I am not logged in
 * Example #5: Given I am not logged in
 */
Given(/^I am not logged in$/, async function () {
  await this.page.context().clearCookies();
  this.__strapiSession = null;
  this.__strapiUser = null;
  await open(this, adminUrl(this, 'auth/login'));
  if (!(await onLoginPage(this))) {
    throw friendly({ message: `The admin's login page did not open: ${await pageSummary(this)}.`, hint: hintFor(this, 'Check launchUrl and adminPath in cucumber.js.') });
  }
});

/**
 * Log in through the login form as an account of the users registry, by its
 * handle: its email address and password are filled in and sent. The session
 * is kept for the next scenarios.
 *
 * Example #1: When I log in as "editor" with the login form
 * Example #2: When I log in as "administrator" with the login form
 * Example #3: When I log in as "author" with the login form
 * Example #4: And I log in as "editor" with the login form
 * Example #5: When I log in as "author" with the login form
 */
When(/^I log in as "([^"]*)" with the login form$/, LOGIN_TIMEOUT, async function (handle) {
  const user = resolveUser(this, handle);
  const outcome = await submitLogin(this, user.email, user.password);
  if (!outcome.account || !same(outcome.account.email, user.email)) {
    throw friendly({
      message: `The login form did not log in "${handle}" (${user.email}): ${listed(outcome.errors)}.`,
      hint: outcome.cut ? CUT_HINT : 'Check the email address and the password of the account in worldParameters.users, and that the build of the site made it active.',
    });
  }
  this.__strapiUser = user;
  await keepSession(this, user);
});

/**
 * Send the login form with an email address and a password, whatever comes of
 * it: a refusal is read by the next step. Use it for the refusals; an account
 * of the users registry logs in with "I log in as ... with the login form".
 *
 * Example #1: When I log in with the email "nobody@example.com" and the password "Wrong-password-1"
 * Example #2: When I log in with the email "editor@example.com" and the password "Not-the-password-1"
 * Example #3: When I log in with the email "not-an-address" and the password "Wrong-password-1"
 * Example #4: And I log in with the email "nobody@example.org" and the password "Wrong-password-2"
 * Example #5: When I log in with the email "" and the password ""
 */
When(/^I log in with the email "([^"]*)" and the password "([^"]*)"$/, LOGIN_TIMEOUT, async function (email, password) {
  const outcome = await submitLogin(this, email, password);
  this.__strapiLogin = outcome;
  if (outcome.account) {
    this.__strapiUser = { handle: email, email, password };
  }
});

/**
 * The login form refused the login and shows why: its alert ("Invalid
 * credentials") or a field's own error ("This value is required.").
 *
 * Example #1: Then the login should be refused with "Invalid credentials"
 * Example #2: Then the login should be refused with "This value is required."
 * Example #3: Then the login should be refused with "This is not a valid email."
 * Example #4: And the login should be refused with "Invalid credentials"
 * Example #5: Then the login should be refused with "Invalid credentials"
 */
Then(/^the login should be refused with "([^"]*)"$/, async function (message) {
  const outcome = this.__strapiLogin;
  if (!outcome) {
    throw friendly({ message: 'No login was sent in this scenario.', hint: 'Send one first: When I log in with the email "nobody@example.com" and the password "Wrong-password-1"' });
  }
  if (outcome.account) {
    throw friendly({ message: `The login was not refused: the admin logged in ${outcome.account.email}.`, hint: 'The email address and the password belong to an account of the site.' });
  }
  if (!(await onLoginPage(this))) {
    throw friendly({ message: `After the refused login the page is not the login page: ${await pageSummary(this)}.`, hint: hintFor(this, 'The admin stays on its login page when it refuses a login.') });
  }
  if (!outcome.errors.some((e) => mentions(e, message))) {
    throw friendly({ message: `The login was refused, but not with "${message}". The login page says: ${listed(outcome.errors)}.`, hint: outcome.cut ? CUT_HINT : 'The admin says "Invalid credentials" for a wrong email address or password, and "This value is required." under an empty field.' });
  }
});

/**
 * Log out through the profile menu of the main navigation ("Log out"), and
 * forget the account's session.
 *
 * Example #1: When I log out
 * Example #2: And I log out
 * Example #3: When I log out
 * Example #4: Then I log out
 * Example #5: When I log out
 */
When(/^I log out$/, async function () {
  const page = this.page;
  const account = await signedInAccount(this);
  if (!account) {
    throw friendly({ message: `No account is logged in, so there is nothing to log out of: ${await pageSummary(this)}.`, hint: 'Log in first: Given I am a logged in user with the "editor" user' });
  }
  const button = profileButton(page);
  await button.click();
  await withApi(this, (method, url) => method === 'POST' && /\/admin\/logout(\?|$)/.test(url),
    () => page.getByRole('menuitem', { name: 'Log out', exact: true }).click(), { what: 'the logout' });
  await page.waitForURL(/\/auth\/login/, { timeout: budget(this) }).catch(() => {});
  await adminReady(this);
  forgetSession(this, account.email);
  this.__strapiUser = null;
  if (!(await onLoginPage(this))) {
    throw friendly({ message: `After "Log out" the admin did not show its login page: ${await pageSummary(this)}.`, hint: hintFor(this, 'The admin ends the session and opens its login page.') });
  }
});

/**
 * An account is signed in to the admin: its profile menu names it. With a
 * handle of the users registry (or an email address), the menu shows that
 * account's email address.
 *
 * Example #1: Then I should be logged in
 * Example #2: Then I should be logged in as "editor"
 * Example #3: And I should be logged in as "administrator"
 * Example #4: Then I should be logged in as "author"
 * Example #5: Then I should be logged in as "editor@example.com"
 */
Then(/^I should be logged in(?: as "([^"]*)")?$/, async function (who) {
  const page = this.page;
  const button = profileButton(page);
  try {
    await button.waitFor({ state: 'visible', timeout: budget(this) });
  } catch {
    throw friendly({ message: `No account is logged in: ${await pageSummary(this)}.`, hint: hintFor(this, 'The admin shows the signed-in account in the profile menu at the foot of its main navigation.') });
  }
  await button.click();
  const menu = page.getByRole('menu').last();
  await menu.waitFor({ state: 'visible', timeout: budget(this) });
  const text = clean(await menu.innerText());
  await page.keyboard.press('Escape');
  if (who) {
    const email = emailOf(this, who);
    if (!mentions(text, email)) {
      throw friendly({ message: `The admin is logged in, but not as "${who}" (${email}): its profile menu reads "${text}".`, hint: 'Log out first, or log in as that account: Given I am a logged in user with the "editor" user' });
    }
  }
});

/**
 * No account is signed in: the admin shows its login page, and its API knows
 * no session in this browser.
 *
 * Example #1: Then I should not be logged in
 * Example #2: And I should not be logged in
 * Example #3: Then I should not be logged in
 * Example #4: Then I should not be logged in
 * Example #5: And I should not be logged in
 */
Then(/^I should not be logged in$/, async function () {
  await adminReady(this);
  const account = await signedInAccount(this);
  if (account) {
    throw friendly({ message: `An account is logged in: ${account.email}.`, hint: 'Log out first: When I log out' });
  }
  if (!(await onLoginPage(this))) {
    throw friendly({ message: `No account is logged in, but the page is not the login page: ${await pageSummary(this)}.`, hint: hintFor(this, 'A visitor of the admin is sent to its login page.') });
  }
});

/**
 * The page is the admin's login page: the fields "Email" and "Password" and
 * the button "Login".
 *
 * Example #1: Then I should be on the admin login page
 * Example #2: And I should be on the admin login page
 * Example #3: Then I should be on the admin login page
 * Example #4: Then I should be on the admin login page
 * Example #5: And I should be on the admin login page
 */
Then(/^I should be on the admin login page$/, async function () {
  const page = this.page;
  await eventually(this, async () => ({
    email: await page.getByRole('textbox', { name: 'Email', exact: true }).count(),
    password: await page.locator('form input[name="password"]').count(),
    button: await page.getByRole('button', { name: 'Login', exact: true }).count(),
  }), (s) => s.email && s.password && s.button, async (s) => ({
    message: `The page is not the admin's login page (${[s.email ? '' : 'no "Email" field', s.password ? '' : 'no "Password" field', s.button ? '' : 'no "Login" button'].filter(Boolean).join(', ')}): ${await pageSummary(this)}.`,
    hint: hintFor(this, 'The admin\'s login page is at /admin/auth/login; a visitor of any admin address is sent there.'),
  }));
});
