@builder
Feature: The Content-Type Builder, read only
  As an administrator
  I want to read the models of the content types and components
  So that I know what the content is made of, without changing the schema

  Scenario: The model of a collection type
    Given I am a logged in user with the "administrator" user
    When I open the model of "Article"
    Then the model should have the fields:
      | title    | Text                 | required |
      | slug     | UID                  |          |
      | summary  | Text                 |          |
      | content  | Rich text (Blocks)   |          |
      | cover    | Media                |          |
      | category | Relation (manyToOne) |          |
      | featured | Boolean              |          |
      | blocks   | Dynamic zone         |          |
    And the "blocks" dynamic zone of the model should offer "Quote", "Rich text" and "Media"
    And the model should not allow changes

  Scenario: The model of a single type and of a component
    Given I am a logged in user with the "administrator" user
    When I open the model of "Homepage"
    Then the model should have the fields:
      | title | Text      | required |
      | intro | Text      |          |
      | seo   | Component |          |
    When I open the model of the "Quote" component
    Then the model should have the fields:
      | body   | Text | required |
      | author | Text |          |
    And the model should not allow changes
