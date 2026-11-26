# Fonts

| File              | Family    | Source       | Licence                                                                                             |
| ----------------- | --------- | ------------ | --------------------------------------------------------------------------------------------------- |
| `inter-400.woff2` | Inter 400 | Google Fonts | SIL Open Font License 1.1. Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter) |
| `inter-500.woff2` | Inter 500 | Google Fonts | SIL Open Font License 1.1. Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter) |

Licence text: https://openfontlicense.org/open-font-license-official-text/

Inter is the face tihada.com uses, chosen by the user for titles and body (#96). Both files are static-weight subsets, downloaded with Google Fonts' `text=` parameter (`family=Inter:wght@400` and `wght@500`), then subset again with fontTools to keep only the OpenType features the site uses, which halves them (about 9.5 KB each):

```
pyftsubset inter-400.woff2 --unicodes="*" --layout-features="kern,tnum,ccmp,locl" \
  --flavor=woff2 --no-hinting --desubroutinize --name-IDs="0,1,2,3,4,5,6,13,14" \
  --drop-tables+=STAT,gasp --output-file=inter-400.woff2
```

They contain only:

- printable ASCII
- a no-break space
- the en and em dashes, curly quotes, bullet, ellipsis, middle dot, ©, é, ← → and ×

That is everything English and Kiswahili text on the site uses, and the subsetting keeps the public pages under 200 KB (NFR-2). The variable 400–500 file is the same size as the two static files together, so the static pair is used. Kerning (`kern`) and tabular figures (`tnum`, for times and references) are kept; Inter's stylistic sets and contextual alternates are dropped.

If a page needs a character outside that set, the browser draws it in the fallback font. To add characters, download the files again with the larger set and check that the page-weight tests still pass.
