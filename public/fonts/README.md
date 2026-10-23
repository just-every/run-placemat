# Fonts

Two families, self-hosted under the SIL Open Font License 1.1, each with its
licence text beside the files:

- **Hanken Grotesk** (`hanken-grotesk/`, variable weight 100–900): the
  wordmark, headings (800), body copy and the app interface. Latin and Latin
  Extended WOFF2 subsets from Fontsource's `@fontsource-variable/hanken-grotesk`
  5.3.0; upstream: https://github.com/marcologous/hanken-grotesk.
- **JetBrains Mono** (`jetbrains-mono/`, 400 and 500): commands in the run
  site's terminal and code cards. Latin WOFF2 subsets from Fontsource's
  `@fontsource/jetbrains-mono` 5.3.0; upstream:
  https://github.com/JetBrains/JetBrainsMono.

Every document links `/fonts/fonts.css` once (`src/base/font-head.ts` for the
app and Base pages, `src/site/shell.ts` for the run site) and preloads only the
Latin Hanken Grotesk face. The `@font-face` rules are in `public/rer-theme.css`
with the `--rer-*` theme tokens, the one file rer's theme reader and the
installer take; `fonts.css` holds the rest of the look and names the families
as `--pm-display`, `--pm-ui` and `--pm-mono`. Do not import either CSS file
from a component.
