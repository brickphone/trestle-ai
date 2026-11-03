# Type comparison font assets

Roman variable TTF files, downloaded November 2, 2026 from the official
[Google Fonts repository](https://github.com/google/fonts/tree/main/ofl).
The adjacent OFL files are the original licenses. No paid font files are included.

| Local file          | Upstream directory | Verified numeric behavior                  |
| ------------------- | ------------------ | ------------------------------------------ |
| instrument-sans.ttf | instrumentsans     | `tnum`, digits all 600 font units          |
| hanken-grotesk.ttf  | hankengrotesk      | Default tabular digits, all 560 font units |
| ibm-plex-sans.ttf   | ibmplexsans        | Default tabular digits, all 600 font units |

The regression test shapes all ten digits at weights 400, 500 and 600 using
Next's bundled font parser. CSS applies `font-variant-numeric: tabular-nums`.
Fonts are served locally through `next/font/local`; there are no browser
requests to Google Fonts.

`src/app/(app)/dev/type/soehne-reference.png` is a static screenshot of
[Klim's official Söhne specimen](https://klim.co.nz/fonts/soehne/), captured
November 2, 2026. It is a reference, not an installed font or license purchase.
Klim's [FAQ](https://klim.co.nz/faqs/) lists a $60 USD base price for the first
style. The actual web license total must be confirmed in the foundry checkout.
