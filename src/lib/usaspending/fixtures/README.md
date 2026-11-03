Recorded response fields from the USAspending public API contract examples, retrieved
2026-11-02. Fields are deliberately restricted to the adapter's allowlist; the
recipient/award sample is MCKESSON / H907. `total_obligation` is varied independently
in the test fixture to catch accidental mapping to contract value. These fixtures
are test inputs only and never seed customer or demo organizations.

Sources:

- https://github.com/fedspendingtransparency/usaspending-api/blob/master/usaspending_api/api_contracts/contracts/v2/awards/award_id.md
- https://github.com/fedspendingtransparency/usaspending-api/blob/master/usaspending_api/api_contracts/contracts/v2/autocomplete/recipient.md
- https://github.com/fedspendingtransparency/usaspending-api/blob/master/usaspending_api/api_contracts/contracts/v2/search/spending_by_award.md

`hsnps86tjgm6.json` records public USAspending responses retrieved November 3, 2026
for WEST COAST BUILDING & CONSTRUCTION, INC. It contains both search pages
(100 + 13 awards) and 113 detail responses, restricted to fields the adapter uses.
No dates, descriptions, identifiers or locations in this recording are synthesized.
Tests freeze the application clock at March 1, 2021 to exercise a real mixture of
active/completed awards, then at November 3, 2026 to verify the no-active-contract
case. The raw recording remains unchanged. IGF cleanup happens only in derived
display text; source snapshots retain the original description and raw PIID.

The advanced search API's documented time filter is not a performance-end-date
filter. To avoid dropping old but still-active awards, the adapter exhausts all
search pages, filters by returned performance-end metadata, and hydrates recent
or undated awards. "Show older awards" hydrates all remaining award details.
Detail requests run at most four at a time. A failed or non-advancing page is an
error, never a silently complete partial list. Counts are distinct award IDs for
the exact UEI, not bare task-order numbers.
