@publish
Feature: Draft and publish
  As an editor
  I want to publish an entry, change it, and take the changes back or unpublish it
  So that the published content is the content I chose

  Scenario: An entry published, changed, its changes discarded, then unpublished
    Given there is a published "Article" entry "Publish test article"
    And I am a logged in user with the "editor" user
    And I am on the "Article" list
    When I search the list for "Publish test article"
    Then the status of "Publish test article" in the list should be "Published"
    When I open "Publish test article" from the list
    And I set "summary" to "A change made after the publication."
    And I save the entry
    Then I should see the notification "Saved document"
    And the status of the entry should be "Modified"
    When I view the published version of the entry
    Then the form should be read only
    And "summary" should be set to ""
    When I view the draft of the entry
    Then "summary" should be set to "A change made after the publication."
    When I discard the changes of the entry
    Then I should see the notification "Changes discarded"
    And the status of the entry should be "Published"
    And "summary" should be set to ""
    When I unpublish the entry
    Then I should see the notification "Unpublished document"
    And the status of the entry should be "Draft"

  Scenario: A draft published from its edit view
    Given there is an "Article" entry "Draft test article"
    And I am a logged in user with the "editor" user
    And I am on the "Article" list
    When I search the list for "Draft test article"
    And I open "Draft test article" from the list
    Then the status of the entry should be "Draft"
    And I should be able to publish the entry
    When I publish the entry
    Then I should see the notification "Published document"
    And the status of the entry should be "Published"
    And I should not be able to publish the entry

  Scenario: Publishing, unpublishing and deleting several entries from the list
    Given there is a published "Article" entry "Bulk test article one"
    And there is a published "Article" entry "Bulk test article two"
    And there is an "Article" entry "Bulk test article three"
    And I am a logged in user with the "editor" user
    And I am on the "Article" list
    When I search the list for "Bulk test article"
    Then the list should count 3 entries
    When I select "Bulk test article one" in the list
    And I select "Bulk test article two" in the list
    Then the selection should read "2 entries selected"
    And the selection should offer "Unpublish"
    When I unpublish the selected entries
    Then the status of "Bulk test article one" in the list should be "Draft"
    And the status of "Bulk test article two" in the list should be "Draft"
    When I select all entries on the page
    Then the selection should read "3 entries selected"
    When I publish the selected entries
    Then the status of "Bulk test article one" in the list should be "Published"
    And the status of "Bulk test article three" in the list should be "Published"
    When I select all entries on the page
    And I delete the selected entries
    Then the list should count 0 entries
    And there should be no "Article" entry "Bulk test article two"
