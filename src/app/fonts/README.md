# Fonts

| File                         | Family                            | Source       | Licence                                                                                                                         |
| ---------------------------- | --------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `instrument-serif-400.woff2` | Instrument Serif 400              | Google Fonts | SIL Open Font License 1.1. Copyright 2022 The Instrument Serif Project Authors (https://github.com/Instrument/instrument-serif) |
| `instrument-sans.woff2`      | Instrument Sans, variable 400–500 | Google Fonts | SIL Open Font License 1.1. Copyright 2022 The Instrument Sans Project Authors (https://github.com/Instrument/instrument-sans)   |

Licence text: https://openfontlicense.org/open-font-license-official-text/

One family in two cuts, chosen from the user's shortlist of pairings (DESIGN.md §3): Instrument Serif sets every title, Instrument Sans everything else. Inter, used before, was judged too common.

Both files start from Google Fonts' `latin` WOFF2 files and are subset with fontTools, which roughly halves them (about 9 KB and 17 KB). The sans is first narrowed from its 400–700 weight range to 400–500, the only weights the site uses:

```
fonttools varLib.instancer instrument-sans-latin.woff2 wght=400:500 -o sans-var.ttf

pyftsubset sans-var.ttf --unicodes="<the set below>" --layout-features="kern,tnum" \
  --flavor=woff2 --no-hinting --desubroutinize --name-IDs="1,2,4,6" \
  --drop-tables+=gasp --output-file=instrument-sans.woff2

pyftsubset instrument-serif-400-latin.woff2 --unicodes="<the set below>" \
  --layout-features="kern" --flavor=woff2 --no-hinting --desubroutinize \
  --name-IDs="1,2,4,6" --drop-tables+=gasp --output-file=instrument-serif-400.woff2
```

They contain only (`U+0020-007E,U+00A0,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2022,U+2026,U+00B7,U+00A9,U+00E9,U+2192`):

- printable ASCII
- a no-break space
- the en and em dashes, curly quotes, bullet, ellipsis, middle dot, ©, é and →

That is everything English and Kiswahili text on the site uses, and the subsetting keeps the public pages under 200 KB (NFR-2). Kerning is kept in both; the sans keeps tabular figures (`tnum`, for times, phone numbers and references), which the serif does not have.

If a page needs a character outside that set, the browser draws it in the fallback font. To add characters, subset the files again with the larger set and check that the page-weight tests still pass.
