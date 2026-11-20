@list
Feature: The list of a collection type
  As an editor
  I want to find entries in the list of their content type
  So that I can work on the right ones

  # The sample content of the build: 24 articles (3 pages of 10), 4 categories, 5 articles in French too.

  @critical
  Scenario: The list counts and shows the entries, with their status
    Given I am a logged in user with the "editor" user
    And I am on the "Article" list
    Then the list should count 24 entries
    And the list should have 10 rows
    And the list should have 3 pages
    And the list should be on page 1
    And the list should have the column "title"
    And the list should have the column "status"
    And the first row of the list should be "A city that walks"
    And the list should show "Harbour lights at dusk"
    And the list should not show "Why the old bridge matters"
    And the "Harbour lights at dusk" row should show "harbour-lights-at-dusk" in the "slug" column
    And the status of "Harbour lights at dusk" in the list should be "Published"
    And the status of "Choosing walking boots" in the list should be "Modified"
    And the status of "Autumn concerts in the park" in the list should be "Draft"

  Scenario: Searching the list
    Given I am a logged in user with the "editor" user
    And I am on the "Article" list
    When I search the list for "river"
    Then the list should count 3 entries
    And the list should show the entries:
      | A guide to river walks         |
      | Lantern parade along the river |
      | The river festival returns     |
    When I clear the search of the list
    Then the list should count 24 entries

  Scenario: A search that finds nothing
    Given I am a logged in user with the "editor" user
    And I am on the "Article" list
    When I search the list for "nothing at all like this"
    Then the list should count 0 entries
    And the list should be empty

  Scenario: Sorting the list
    Given I am a logged in user with the "editor" user
    And I am on the "Article" list
    When I sort the list by "title" in descending order
    Then the first row of the list should be "Why the old bridge matters"
    When I sort the list by "title"
    Then the first row of the list should be "A city that walks"
    When I sort the list by "id" in ascending order
    Then the first row of the list should be "Harbour lights at dusk"

  Scenario: Filtering the list by status and by a relation
    Given I am a logged in user with the "editor" user
    And I am on the "Article" list
    When I filter the list where "Status" "is" "Draft (never published)"
    Then the list should count 4 entries
    And the list should have the filter "Status is draft"
    And the list should show "Market day in the square"
    When I remove the filter "Status is draft"
    Then the list should count 24 entries
    When I filter the list where "category" "is" "Guides"
    Then the list should count 6 entries
    And the list should show "Choosing walking boots"
    And the list should not show "Harbour lights at dusk"

  Scenario: Choosing the columns of the list
    Given I am a logged in user with the "editor" user
    And I am on the "Article" list
    When I show the "category" column
    Then the list should have the column "category"
    And the "Harbour lights at dusk" row should show "News" in the "category" column
    When I hide the "summary" column
    Then the list should not have the column "summary"
    When I reset the columns of the list
    Then the list should have the column "summary"
    And the list should not have the column "category"

  Scenario: The pages of the list
    Given I am a logged in user with the "editor" user
    And I am on the "Article" list
    When I go to page 3 of the list
    Then the list should be on page 3
    And the list should have 4 rows
    And the first row of the list should be "The harbour run, ten kilometres"
    When I show 20 entries per page
    Then the list should have 2 pages
    And the list should have 20 rows

  Scenario: The list in another locale
    Given I am a logged in user with the "editor" user
    And I am on the "Article" list
    When I switch the list to "French (fr)"
    Then the list should count 5 entries
    And the list should show "Lumières du port au crépuscule"
    And the list should not show "Harbour lights at dusk"
    When I switch the list to "English (en)"
    Then the list should count 24 entries
