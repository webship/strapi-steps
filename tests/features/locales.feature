@locales
Feature: The locales of an entry
  As an editor
  I want to give an entry its other locale, filled in from the first
  So that the site has its content in English and French

  Scenario: An entry filled in in French from its English
    Given there is a published "Article" entry "Locale test article"
    And I am a logged in user with the "editor" user
    And I am on the "Article" list
    When I search the list for "Locale test article"
    And I open "Locale test article" from the list
    Then the entry should be in "English (en)"
    When I switch the entry to "French (fr)"
    Then the entry should be in "French (fr)"
    And "title" should be set to ""
    When I fill the entry in from "English (en)"
    Then "title" should be set to "Locale test article"
    When I set "title" to "Article de test des langues"
    And I save the entry
    And I publish the entry
    Then the status of the entry should be "Published"
    And there should be an "Article" entry "Article de test des langues" in "French (fr)"
    When I switch the entry to "English (en)"
    Then "title" should be set to "Locale test article"

  Scenario: The list and an entry in French
    Given I am a logged in user with the "editor" user
    And I am on the "Article" list
    When I switch the list to "French (fr)"
    Then the list should count 5 entries
    When I open "Lumières du port au crépuscule" from the list
    Then the entry should be in "French (fr)"
    And "slug" should be set to "lumieres-du-port-au-crepuscule"
