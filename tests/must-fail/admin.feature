@must-fail
Feature: Assertions of the Media Library, the builder and the settings that must fail
  Each scenario asserts something that is not true on the test site: its last step must fail with
  the message its description announces, and a hint. The scenarios only read.

  Scenario: The wrong count of a folder
    Fails with: The folder reads "Home (3 items)": not 5 items.
    Given I am a logged in user with the "editor" user
    And I am on the media library
    Then the folder should count 5 items

  Scenario: The wrong dimensions of a file
    Fails with: The file's "Dimensions" is "640 × 400", not "100 × 100".
    Given I am a logged in user with the "editor" user
    And I am on the media library
    When I open the details of "meadow.png"
    Then the "Dimensions" of the file should be "100 × 100"

  Scenario: The wrong plan
    Fails with: The site's plan is "Community", not "Enterprise".
    Given I am a logged in user with the "administrator" user
    Then the plan of the site should be "Enterprise"

  Scenario: A permission the role has
    Fails with: The role allows "Publish" on "Article".
    Given I am a logged in user with the "administrator" user
    When I go to the settings page "Roles" under "Administration panel"
    And I open "Editor" from the settings list
    Then the role should not allow "Publish" on "Article"

  Scenario: The wrong role of an account
    Fails with: The account editor@example.com has the role(s) "Editor", not "Author".
    Given I am a logged in user with the "administrator" user
    Then the account "editor" should have the role "Author"

  Scenario: A section the editor does not have
    Fails with: The main navigation does not list "Content-Type Builder".
    Given I am a logged in user with the "editor" user
    Then the main navigation should list "Content-Type Builder"

  Scenario: The wrong fields of a model
    Fails with: The model has the fields
    Given I am a logged in user with the "administrator" user
    When I open the model of the "Quote" component
    Then the model should have the fields:
      | body | Text | required |
