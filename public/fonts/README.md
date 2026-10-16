# Fonts

Two families, self-hosted under the SIL Open Font License 1.1, each with its
licence beside the files:

- **Gelasio** (`gelasio/`, variable weight 400–700): display type, headings and
  the landing's body copy. Latin and Latin Extended WOFF2 subsets from
  Fontsource's Gelasio distribution; upstream: https://github.com/SorkinType/Gelasio.
- **Be Vietnam Pro** (`be-vietnam-pro/`, 400, 500 and 600): the app interface,
  labels, buttons, pills, tables and every string inside the drawings. Latin and
  Latin Extended WOFF2 subsets from Fontsource; upstream:
  https://github.com/bettergui/BeVietnamPro.

Every document links `/fonts/fonts.css` once (`src/base/font-head.ts` for the
app and Base pages, the run site's pages for the site) and preloads only the
Latin interface face. `public/rer-theme.css` names the families as
`--rer-font-heading` and `--rer-font-body`; do not import this CSS from a
component.
