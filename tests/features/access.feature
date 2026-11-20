@access
Feature: What each account may do
  As the owner of the site
  I want each role to see and do only what it is given
  So that an author or an editor cannot change what is not theirs

  Scenario: The editor sees the content but not the builder or the roles
    Given I am a logged in user with the "editor" user
    Then the main navigation should list "Content Manager"
    And the main navigation should list "Media Library"
    And the main navigation should not list "Content-Type Builder"
    And the settings menu should not list "Roles"
    And the settings menu should not list "API Tokens"

  Scenario: The administrator sees every section
    Given I am a logged in user with the "administrator" user
    Then the main navigation should list "Content-Type Builder"
    And the settings menu should list "Roles" under "Administration panel"
    And the settings menu should list "Roles" under "Users & Permissions plugin"
    And the settings menu should list "API Tokens"

  # The browser logs the refused requests (403): no error of the site.
  @js-off
  Scenario: The author may not open the roles
    Given I am a logged in user with the "author" user
    Then I should not be allowed to open "/admin/settings/roles"

  Scenario: An author makes a draft, and may not publish it
    Given there is no "Article" entry "Author test article"
    And I am a logged in user with the "author" user
    And I am on the "Article" list
    Then the list should be empty
    When I create a new "Article" entry
    And I set "title" to "Author test article"
    And I save the entry
    Then I should see the notification "Saved document"
    And the status of the entry should be "Draft"
    And I should not be able to publish the entry
