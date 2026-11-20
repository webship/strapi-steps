@media
Feature: The Media Library
  As an editor
  I want to upload files, put them in folders and give them their details
  So that the entries have the images they need

  # The files and folders a scenario makes are deleted after it.

  Scenario: The folders and the files of the library
    Given I am a logged in user with the "editor" user
    And I am on the media library
    Then the folder should count 3 items
    And the media library should show "Covers"
    And the media library should show "meadow.png"
    When I open the folder "Covers" in the media library
    Then the folder should count 2 items
    And the media library should show "harbour-cover.png"
    And the media library should not show "meadow.png"
    When I open the folder "Home" in the media library
    Then the media library should show "mountains.png"

  Scenario: The details of a file
    Given I am a logged in user with the "editor" user
    And I am on the media library
    When I open the details of "meadow.png"
    Then the "Dimensions" of the file should be "640 × 400"
    And the "Extension" of the file should be "png"
    And "Alternative text" should be set to "A green meadow" in the file details
    When I close the file details
    Then the media library should show "meadow.png"

  Scenario: Uploading a file, giving it an alternative text, deleting it
    Given I am a logged in user with the "editor" user
    And I am on the media library
    When I upload "test-lighthouse.png" to the media library
    Then the media library should show "test-lighthouse.png"
    And the folder should count 4 items
    When I open the details of "test-lighthouse.png"
    Then the "Dimensions" of the file should be "320 × 200"
    And the "Created by" of the file should be "Editor Webship"
    When I set "Alternative text" to "A white ring on blue" in the file details
    And I save the file details
    And I close the file details
    And I open the details of "test-lighthouse.png"
    Then "Alternative text" should be set to "A white ring on blue" in the file details
    When I close the file details
    And I delete "test-lighthouse.png" from the media library
    Then the media library should not show "test-lighthouse.png"
    And there should be no file "test-lighthouse.png" in the media library

  # The browser logs the refused upload (400): no error of the site.
  @js-off
  Scenario: An image whose data is broken is refused
    Given I am a logged in user with the "editor" user
    And I am on the media library
    When I upload "broken-image.png" to the media library
    Then the upload should be refused with "File is not a valid image"
    And there should be no file "broken-image.png" in the media library

  Scenario: A folder made and deleted
    Given I am a logged in user with the "editor" user
    And I am on the media library
    When I create the folder "Test folder" in the media library
    Then the media library should show "Test folder"
    When I open the folder "Test folder" in the media library
    Then the folder should count 0 items
    When I open the folder "Home" in the media library
    And I delete "Test folder" from the media library
    Then the media library should not show "Test folder"
