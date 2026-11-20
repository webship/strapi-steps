@dynamic-zone
Feature: The dynamic zone of an entry
  As an editor
  I want to add, fill in, move and remove the components of a dynamic zone
  So that an article is built from the blocks it needs

  Scenario: Reading the components of an entry
    Given I am a logged in user with the "editor" user
    And I am on the "Article" list
    When I search the list for "Harbour lights at dusk"
    And I open "Harbour lights at dusk" from the list
    Then the "blocks" dynamic zone should hold "Quote", "Rich text" and "Media"
    And "author" should be set to "A harbour master" in the "Quote" component of "blocks"
    And "body" should be set to "The lights come on **one by one**, from the lighthouse to the market." in the "Rich text" component of "blocks"

  Scenario: Adding, moving and removing components
    Given there is an "Article" entry "Dynamic zone test article"
    And I am a logged in user with the "editor" user
    And I am on the "Article" list
    When I search the list for "Dynamic zone test article"
    And I open "Dynamic zone test article" from the list
    Then the "blocks" dynamic zone should hold nothing
    When I add the "Quote" component to "blocks"
    And I set "body" to "A quotation for the test." in the "Quote" component of "blocks"
    And I set "author" to "A tester" in the "Quote" component of "blocks"
    And I add the "Rich text" component to "blocks"
    And I set "body" to "Some **bold** words." in the "Rich text" component of "blocks"
    And I add the "Media" component to "blocks"
    Then the "blocks" dynamic zone should hold "Quote", "Rich text" and "Media"
    When I move the "Quote" component of "blocks" down 2 places
    Then the "blocks" dynamic zone should hold "Rich text", "Media" and "Quote"
    When I move the "Media" component of "blocks" up
    Then the "blocks" dynamic zone should hold "Media", "Rich text" and "Quote"
    When I remove the "Media" component from "blocks"
    And I save the entry
    Then I should see the notification "Saved document"
    And the "blocks" dynamic zone should hold "Rich text" and "Quote"
    And "author" should be set to "A tester" in the "Quote" component of "blocks"
