# CLF-C02 Study

Spaced-repetition flashcards and study modules for the **AWS Certified Cloud Practitioner (CLF-C02)** exam. No backend, no accounts, no build step: it is a static site that keeps your progress in your browser.

## What you get

- **1,208 cards**: 1,050 practice questions, 115 service flashcards ("which AWS service is this?"), and 43 core-concept cards.
- **Spaced repetition**: cards you miss return within minutes; cards you know return after growing gaps (1d, 3d, 8d, 20d...).
- **Mastery tracking**: every card is *new*, *learning*, *familiar* or *nailed*, with a separate *struggling* flag for cards you keep lapsing on. Progress is rolled up by exam domain and by each of the 19 official task statements.
- **Exam-date pacing**: set your exam date and review gaps are capped so every card comes back before the day.
- **Learn modules**: one page per exam task statement with the services and concepts to know, your progress, and a "study this topic" shortcut.
- Two modes for question cards: **Quiz** (pick an answer) or **Flip** (recall, reveal, self-rate). Keyboard shortcuts throughout: `A`-`E` to answer, `Space`/`Enter` to reveal or continue, `1`-`4` to grade, `Z` to undo.
- Export / import your progress as JSON (merge two devices, or back up).

## Run it

It loads data with `fetch`, so it must be served over HTTP (opening `index.html` directly will not work):

```bash
npm run serve        # or: python3 -m http.server 8080
# open http://localhost:8080
```

### Host it (so it works on your phone)

The repo root is the site. On GitHub: **Settings → Pages → Deploy from a branch →** choose your branch and `/ (root)`. Progress is stored per browser, so phone and laptop have separate progress until you export/import.

## How the scheduling works

An Anki/SM-2-style scheduler (`js/scheduler.js`):

| State | Meaning |
|---|---|
| new | never seen |
| learning | short steps: 1m / 10m, then graduates to a 1-day interval |
| review | interval multiplies by the card's ease on *Good* (x1.2 on *Hard*, x1.3 bonus on *Easy*), with small fuzz |
| relearning | after *Again*: interval halves, ease drops 0.2, 10-minute step |

In Quiz mode a wrong answer is automatically *Again*; a right answer lets you choose *Hard / Good / Easy* depending on how sure you were. Mastery: **familiar** at a 7+ day interval, **nailed** at 14+ days (both shrink if your exam is closer than that). **Struggling** means 2+ lapses and not yet nailed. Daily new-card limit defaults to 20, drawn across domains in proportion to exam weight.

"Weighted mastery" on the Today page counts nailed cards fully, familiar at 60%, learning at 25%, weighted by exam domain. It is a progress indicator, **not a pass prediction**.

## Data

`data/questions.json` and `data/modules.json` are generated and committed:

```bash
git clone --depth 1 https://github.com/nastaso/cloudcertprep ../cloudcertprep
npm run build:data -- ../cloudcertprep
```

- `scripts/glossary.mjs`: authored service clues and concept cards (edit this to add or fix flashcards).
- `scripts/exam-guide.mjs`: domains and task statements.
- `scripts/build-data.mjs`: tags each question with the services it mentions and a best-guess task statement (keyword scoring, about 84% matched; the rest show as "Mixed"). Tagging is heuristic, so treat topic labels as approximate.

## Tests

```bash
npm test
```

Covers the scheduler, queue building, persistence/import/export, undo and analytics (Node's built-in test runner, no dependencies).

## Caveats

- The question bank is third-party and AWS changes things. In particular AWS has been revising its Support plans, so check support-related answers against current AWS documentation.
- Progress lives in browser storage. Clearing site data erases it, so export a backup now and then.

See [NOTICE.md](NOTICE.md) for attribution. Unofficial study aid, not affiliated with AWS.
