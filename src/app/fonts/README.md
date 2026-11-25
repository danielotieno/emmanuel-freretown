# Fonts

| File                     | Family               | Source       | Licence                                                                                                                         |
| ------------------------ | -------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `instrument-serif.woff2` | Instrument Serif 400 | Google Fonts | SIL Open Font License 1.1. Copyright 2022 The Instrument Serif Project Authors (https://github.com/Instrument/instrument-serif) |
| `instrument-sans.woff2`  | Instrument Sans 400  | Google Fonts | SIL Open Font License 1.1. Copyright 2022 The Instrument Sans Project Authors (https://github.com/Instrument/instrument-sans)   |

Licence text: https://openfontlicense.org/open-font-license-official-text/

Both files are subsets, downloaded with Google Fonts' `text=` parameter. They contain only:

- printable ASCII
- a no-break space
- the en and em dashes, curly quotes, bullet, ellipsis, middle dot, ©, é, ← → and ×

That is everything English and Kiswahili text on the site uses, and the subsetting keeps the public pages under 200 KB (NFR-2).

If a page needs a character outside that set, the browser draws it in the fallback font. To add characters, download the files again with the larger set and check that the page-weight tests still pass.
