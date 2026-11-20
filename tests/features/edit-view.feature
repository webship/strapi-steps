@edit
Feature: The edit view of an entry
  As an editor
  I want to fill in every kind of field of an entry and save it
  So that the content is complete before it is published

  # Each entry a scenario makes is deleted after it, whatever happens in it.

  @critical
  Scenario: An editor makes an entry with each kind of field
    Given there is no "Article" entry "Editor test article"
    And I am a logged in user with the "editor" user
    When I create a new "Article" entry
    And I set "title" to "Editor test article"
    And I regenerate the "slug"
    And I set these fields:
      | summary  | A short summary of the test article.     |
      | content  | A first paragraph.\nA second paragraph. |
      | featured | true                                     |
    And I choose "Guides" in the "category" relation
    And I choose the asset "meadow.png" for "cover"
    And I save the entry
    Then I should see the notification "Saved document"
    And the status of the entry should be "Draft"
    And "title" should be set to "Editor test article"
    And "slug" should be set to "editor-test-article"
    And "featured" should be set to "true"
    And "content" should be set to "A first paragraph. A second paragraph."
    And the "category" relation should list "Guides"
    And "cover" should hold the asset "meadow.png"
    And there should be an "Article" entry "Editor test article"

  Scenario: Changing a relation and a media field
    Given there is an "Article" entry "Relation test article" with:
      | category | News |
    And I am a logged in user with the "editor" user
    And I am on the "Article" list
    When I search the list for "Relation test article"
    And I open "Relation test article" from the list
    Then the "category" relation should list "News"
    When I remove "News" from the "category" relation
    And I choose "Events" in the "category" relation
    And I choose the asset "harbour-cover.png" in the folder "Covers" for "cover"
    And I save the entry
    Then the "category" relation should list "Events"
    And the "category" relation should not list "News"
    And "cover" should hold the asset "harbour-cover.png"
    When I remove the asset "harbour-cover.png" from "cover"
    And I save the entry
    Then "cover" should hold no asset

  Scenario: A required field refuses the publication
    Given I am a logged in user with the "editor" user
    When I create a new "Article" entry
    And I set "summary" to "This one has no title."
    And I publish the entry
    Then I should see the notification "There are validation errors in your document"
    And the "title" field should show the error "This value is required."
    When I leave the entry without saving
    Then the list should count 24 entries

  Scenario: The single type, changed and left without saving
    Given I am a logged in user with the "editor" user
    When I open the "Homepage" single type
    Then the status of the entry should be "Published"
    And "title" should be set to "Welcome to the city"
    And "metaTitle" should be set to "Welcome to the city"
    When I set "intro" to "A change that is not kept."
    And I leave the entry without saving
    And I open the "Homepage" single type
    Then "intro" should be set to "News, guides and events from around the city."

  Scenario: Deleting an entry
    Given there is an "Article" entry "Delete test article"
    And I am a logged in user with the "editor" user
    And I am on the "Article" list
    When I search the list for "Delete test article"
    And I open "Delete test article" from the list
    And I delete the entry
    Then I should see the notification "Deleted document"
    And there should be no "Article" entry "Delete test article"
