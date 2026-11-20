@must-fail
Feature: Assertions of the session and the list that must fail
  Each scenario asserts something that is not true on the test site: its last step must fail with
  the message its description announces, and a hint. tests/check-must-fail.js runs them.

  Scenario: The wrong account
    Fails with: The admin is logged in, but not as "author"
    Given I am a logged in user with the "editor" user
    Then I should be logged in as "author"

  @js-off
  Scenario: The wrong reason for a refused login
    Fails with: The login was refused, but not with "Account locked"
    Given I am not logged in
    When I log in with the email "nobody@example.com" and the password "Wrong-password-1"
    Then the login should be refused with "Account locked"

  Scenario: The wrong count of the list
    Fails with: The list counts 24 entries, not 25.
    Given I am a logged in user with the "editor" user
    And I am on the "Article" list
    Then the list should count 25 entries

  Scenario: An entry the list does not show
    Fails with: The list does not show "An article nobody wrote".
    Given I am a logged in user with the "editor" user
    And I am on the "Article" list
    Then the list should show "An article nobody wrote"

  Scenario: The wrong first row
    Fails with: The first row of the list is "A city that walks", not "Why the old bridge matters".
    Given I am a logged in user with the "editor" user
    And I am on the "Article" list
    Then the first row of the list should be "Why the old bridge matters"

  Scenario: The wrong status in the list
    Fails with: The status of "Harbour lights at dusk" in the list is "Published", not "Draft".
    Given I am a logged in user with the "editor" user
    And I am on the "Article" list
    Then the status of "Harbour lights at dusk" in the list should be "Draft"

  Scenario: A column the list does not show
    Fails with: The list has no column "category".
    Given I am a logged in user with the "editor" user
    And I am on the "Article" list
    Then the list should have the column "category"

  Scenario: The wrong number of pages
    Fails with: The list has 3 pages, not 4.
    Given I am a logged in user with the "editor" user
    And I am on the "Article" list
    Then the list should have 4 pages
