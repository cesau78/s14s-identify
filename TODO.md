# In Progress - near completion
- create a collection for source systems named "sources" and appropriate rest api's
  - add a field for "EntraAD Group" so we can put a group name in to later secure
  - we'll add a UI later for resolution of collisions which will have a souce system identifier of "S14S - Identify"
  - this will drive a registration process for source systems and help us lock down what data a reviewer has access to.
  - each source system should allow for multiple reviewers (first,last,email) to be specified
  - add a unique index to customer.alias.source and customer.alias.source_identifier
    - when a post receives a collision, a determination must be made if the received data aligns with the current customer or if a split needs to be performed.  If the split Provide meaningful messages when a collision occurs that allows the requester to fix the operation by 

# Next
- move nickname record to formal name to be tokenized only: the aggregate record should not introduce altered data that derived from an algorithm.  However, the formal name is what should be tokenized for consistency.
  - add a boolean field to indicate source of truth, which should be used when determining what the resolved (top-level) record should reflect.  Otherwise, the last in should win.
    - add an effective date to both the alias and the customer.  If a requester supplies no effective date, the current date should be supplied.
  - the formal record should relect a merging of alias record where the merging of non-source-of-truth records are then overlaid by the merging of source-of-truth-records the latest source of truth records.  Each post applies a layer.
    - the requester should always be able to return their specific record by appending source=

- update logic flow diagrams
  - make separate diagrams for POST /customers

- the current logic only saves the score for one of the two algorithms used.  i'd like to save the scores for both in separate fields so we can better understand how things are working.  we might need to use a combination when making a determination about matching, but ultimately we might be ablle to better triage scenarios where a name is a good match, but an address isnt - "do we need to update the address, or is it a different person"?


- add a ui for conflict resolution
- add security filters to /customers that restricts the view by the calling source system.  The alias record needs to be attached to the calling source system to return a customer.
  - /customers?under_review=true resource needs to only show records with a source system confidence greater than the review_threshold


- instead of having to manually adjust the feedback, I'd like have it auto-adjust based on the reviews (merges and splits).