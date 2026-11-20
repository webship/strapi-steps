@must-fail
Feature: Assertions of the edit view that must fail
  Each scenario asserts something that is not true on the test site: its last step must fail with
  the message its description announces, and a hint. The scenarios only read.

  Scenario: The wrong status of an entry
    Fails with: The status of the entry is "Published", not "Draft".
    Given I am a logged in user with the "editor" user
    And I am on the "Article" list
    When I search the list for "Harbour lights at dusk"
    And I open "Harbour lights at dusk" from the list
    Then the status of the entry should be "Draft"

  Scenario: The wrong value of a field
    Fails with: "title" is set to "Harbour lights at dusk", not "Another title".
    Given I am a logged in user with the "editor" user
    And I am on the "Article" list
    When I search the list for "Harbour lights at dusk"
    And I open "Harbour lights at dusk" from the list
    Then "title" should be set to "Another title"

  Scenario: An entry a relation does not list
    Fails with: does not list "Guides". It lists "News".
    Given I am a logged in user with the "editor" user
    And I am on the "Article" list
    When I search the list for "Harbour lights at dusk"
    And I open "Harbour lights at dusk" from the list
    Then the "category" relation should list "Guides"

  Scenario: A media field that is not empty
    Fails with: The field "cover" holds "harbour-cover.png".
    Given I am a logged in user with the "editor" user
    And I am on the "Article" list
    When I search the list for "Harbour lights at dusk"
    And I open "Harbour lights at dusk" from the list
    Then "cover" should hold no asset

  Scenario: The wrong components of a dynamic zone
    Fails with: The dynamic zone "blocks" holds "Quote", "Rich text", "Media", not "Quote" in that order.
    Given I am a logged in user with the "editor" user
    And I am on the "Article" list
    When I search the list for "Harbour lights at dusk"
    And I open "Harbour lights at dusk" from the list
    Then the "blocks" dynamic zone should hold "Quote"

  Scenario: A field the entry does not have
    Fails with: There is no field "subtitle" in the form.
    Given I am a logged in user with the "editor" user
    And I am on the "Article" list
    When I search the list for "Harbour lights at dusk"
    And I open "Harbour lights at dusk" from the list
    And I set "subtitle" to "A subtitle"
