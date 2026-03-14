# Next
- update logic flow diagrams
  - make separate diagrams for POST /customers

- the current logic only saves the score for one of the two algorithms used.  i'd like to save the scores for both in separate fields so we can better understand how things are working.  we might need to use a combination when making a determination about matching, but ultimately we might be ablle to better triage scenarios where a name is a good match, but an address isnt - "do we need to update the address, or is it a different person"?


- add a ui for conflict resolution
- add security filters to /customers that restricts the view by the calling source system.  The alias record needs to be attached to the calling source system to return a customer.
  - /customers?under_review=true resource needs to only show records with a source system confidence greater than the review_threshold


- instead of having to manually adjust the feedback, I'd like have it auto-adjust based on the reviews (merges and splits).