# WikiParallel

WikiParallel is a browser-only tool for borrowing ideas across disciplines. You
type a **Challenge** — a problem in plain language, such as "handling a sudden
surge of users" — and mark its **Home Field**, the one of eleven Vital Articles
top-level Fields the problem already belongs to. WikiParallel embeds the
Challenge in your browser and compares it against the **Corpus** (about 1,000
Wikipedia Vital Articles Level 3 pages, each reduced to its **Lead Section** and
embedded once at build time). It returns **Parallels**: articles whose Lead
Section is close to the Challenge in embedding space but that sit in a *different*
Field, each shown with its **Closeness** (0–100) and a link to the source
article. Excluding the Home Field is how the tool skips the obvious answers and
surfaces the same underlying problem as seen by another discipline.

There is no backend: `corpus.json` is fetched on load and the `gte-small`
embedding model runs client-side via transformers.js, so the Challenge text
never leaves the machine (see [`docs/adr/0001-browser-only-no-backend.md`](docs/adr/0001-browser-only-no-backend.md)).

## Requirements

- Node.js 20 or newer (the build and the test runner use built-in `node --test`).
- Network access on the first build (to fetch the article list and Lead Sections
  from Wikipedia) and on the first search in the browser (to download the model).

## Setup

```sh
npm install
```

## Build the Corpus

```sh
node build/build.mjs        # or: npm run build
```

This runs two stages behind one entry point:

1. **List stage** — fetch Wikipedia's Vital Articles Level 3 list and derive the
   `{ field, title, url }` list. The Field names and their order are read from
   the live list here.
2. **Corpus stage** — fetch each article's Lead Section and section headings and
   embed the Lead Section with `gte-small`.

The result is written to `corpus.json` at the repo root (about 10 MB, ~1,000
records). Wikipedia responses are cached under `build/cache/`, so a second run
needs no network and produces an equivalent file.

`corpus.json` is **generated, not committed** — it is listed in `.gitignore`. A
fresh clone has no Corpus until you run the build, and the app shows a "run the
build" message until it exists.

Related build commands:

- `npm run build:list` — run only the list stage, printing the article list.
- `node build/eval.mjs` — rank eight hand-written Challenges against the built
  Corpus and print the Parallels; see [`docs/evaluation.md`](docs/evaluation.md).

## Run the app

WikiParallel is a static site — serve the repo root with any static file server:

```sh
npm run serve        # python3 -m http.server 8000
```

Then open <http://localhost:8000>. Enter a Challenge, pick a Home Field, and
choose **Find Parallels**. The first search downloads the `gte-small` model
(~34 MB) from the jsDelivr CDN; the browser caches it for every visit after.

## Tests and type-checking

```sh
npm test             # node --test
npm run typecheck    # tsc --noEmit
```

## Licensing

- **Code** — MIT. See [`LICENSE`](LICENSE).
- **Wikipedia article text** — the Lead Sections stored in `corpus.json` and
  shown in the app as evidence for each Parallel come from Wikipedia and are used
  under [Creative Commons Attribution-ShareAlike (CC BY-SA)](https://creativecommons.org/licenses/by-sa/4.0/).
  The app footer carries this notice and every Parallel links to its source
  Wikipedia article for attribution.
