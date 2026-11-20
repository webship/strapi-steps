@session
Feature: The session of the admin
  As an account of the admin
  I want to log in and out, and be refused with a wrong password
  So that only the accounts of the site work in the admin

  # The accounts are configuration: the build of the site makes them, a scenario logs in by a handle of
  # the users registry in cucumber.js. The admin allows 5 logins of an account in 5 minutes: the other
  # scenarios of the suite take a session over instead of logging in again.

  @critical
  Scenario: A visitor of an admin page is sent to the login page
    Given I am not logged in
    When I go to "/admin/content-manager"
    Then I should be on the admin login page
    And I should not be logged in

  Scenario Outline: The <account> account logs in through the login form
    Given I am not logged in
    When I log in as "<account>" with the login form
    Then I should be logged in as "<account>"

    Examples:
      | account       |
      | administrator |
      | editor        |
      | author        |

  # The browser logs the refused login request (400): no error of the site.
  @js-off
  Scenario: A wrong password is refused
    Given I am not logged in
    When I log in with the email "nobody@example.com" and the password "Wrong-password-1"
    Then the login should be refused with "Invalid credentials"
    And I should not be logged in

  Scenario: An empty login form is refused before it is sent
    Given I am not logged in
    When I log in with the email "" and the password ""
    Then the login should be refused with "This value is required."
    And I should be on the admin login page

  Scenario: An account takes its session over in a later scenario
    Given I am a logged in user with the "editor" user
    Then I should be logged in as "editor"
    And I should see "Hello Editor"

  Scenario: An account logs out
    Given I am a logged in user with the "author" user
    When I log out
    Then I should not be logged in
    And I should be on the admin login page
