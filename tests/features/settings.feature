@settings
Feature: The settings: roles, end-user roles, API tokens, accounts
  As an administrator
  I want to read the roles, the API tokens and the accounts of the site
  So that I know who may do what, without changing any of them

  Scenario: The site runs the free edition
    Given I am a logged in user with the "administrator" user
    Then the plan of the site should be "Community"

  Scenario: The admin roles and their permissions
    Given I am a logged in user with the "administrator" user
    When I go to the settings page "Roles" under "Administration panel"
    Then the settings list should show "Editor" with "1 user"
    And the settings list should show "Author" with "Authors can manage the content they have created."
    And the settings list should show "Super Admin"
    When I open "Editor" from the settings list
    Then the role should allow "Publish" on "Article"
    And the role should allow "Read" on "Homepage"
    When I go to the settings page "Roles" under "Administration panel"
    And I open "Author" from the settings list
    Then the role should allow "Create" on "Article"
    And the role should not allow "Publish" on "Article"

  Scenario: The end-user roles
    Given I am a logged in user with the "administrator" user
    When I go to the settings page "Roles" under "Users & Permissions plugin"
    Then the settings list should show "Public" with "Default role given to unauthenticated user."
    And the settings list should show "Authenticated"
    When I open "Public" from the settings list
    Then the role should not allow "find" on "Article"

  Scenario: The API tokens, read only
    Given I am a logged in user with the "administrator" user
    When I go to the settings page "API Tokens"
    Then the settings list should show "Read Only" with "A default API token with read-only permissions"
    And the settings list should show "Full Access"
    When I open "Read Only" from the settings list
    Then the API token should be "Read-only"

  Scenario: The accounts and their roles
    Given I am a logged in user with the "administrator" user
    Then the account "administrator" should have the role "Super Admin"
    And the account "editor" should have the role "Editor"
    And the account "author" should have the role "Author"
    And the settings list should show "editor@example.com" with "Active"
