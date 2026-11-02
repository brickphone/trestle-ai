Recorded response fields from the USAspending public API contract examples, retrieved
2026-11-02. Fields are deliberately restricted to the adapter's allowlist; the
recipient/award sample is MCKESSON / H907. `total_obligation` is varied independently
in the test fixture to catch accidental mapping to contract value. These fixtures
are test inputs only and never seed customer or demo organizations.

Sources:

- https://github.com/fedspendingtransparency/usaspending-api/blob/master/usaspending_api/api_contracts/contracts/v2/awards/award_id.md
- https://github.com/fedspendingtransparency/usaspending-api/blob/master/usaspending_api/api_contracts/contracts/v2/autocomplete/recipient.md
- https://github.com/fedspendingtransparency/usaspending-api/blob/master/usaspending_api/api_contracts/contracts/v2/search/spending_by_award.md
