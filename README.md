# eslomaha.com

Free English classes for adults in Omaha. Static site on Netlify (Comm Team), edited in Pages CMS.

## How it works
- English copy: `content/*.json` (edit in Pages CMS).
- Translations: `content/i18n/<language>.json`. Anything missing falls back to English.
- Dates and times are stored once in `content/classes.json` and written out in every language by the build, so a date change updates all languages.
- Design: `src/template.html`. Browser script: `site.js`. Languages: `src/languages.json`. Settings: `src/config.json`.
- `node build.js` writes `index.html` plus `/es/`, `/fa/` (Dari), `/ps/`, `/ar/`, `/zh/`, `/uk/`, `/sw/`, `/fr/`, `/vi/`. Netlify runs it on every deploy. Never hand-edit the generated HTML.
- "More languages" in the language menu opens the page through Google Translate.

## Forms
The Tuesday registration, Thursday registration and contact forms post to a Google Apps Script web app (`google-apps-script/Code.gs`) that adds a row to the same Google Sheets Squarespace used and emails the program leader.
- Columns are matched by header name. Answers are always saved in English, whatever language the visitor used.
- The web app URL goes in `src/config.json` as `formEndpoint`.
- If Google is unreachable (or no endpoint is set), the form falls back to Netlify Forms so nothing is lost.

## Translations
Machine-assisted. Have native speakers review before relying on them, especially Dari and Pashto. When English wording changes, update the same key in each `content/i18n` file.
