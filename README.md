# CLF-C02 Study

Spaced-repetition flashcards and study modules for the **AWS Certified Cloud Practitioner (CLF-C02)** exam. No backend, no accounts, no build step: it is a static site that keeps your progress in your browser.

## What you get

Two separate ways to study, joined by a nudge:

- **Test**: practice questions only. Pick a length (10, 20, 30, 50, 65 or your own) and a topic, answer, read the explanation, move on. There is no daily cap, so you can do a full 65-question run in one go.
  - **Timer**: *Exam pace* counts down at the real exam's rate (about 83 seconds a question, 90 minutes for 65) and ends the test when it runs out; *Stopwatch* counts up; or turn it off. It only counts time spent answering and pauses while you read an explanation or switch tabs.
- **Study**: the notecards (115 "which AWS service is this?" service cards and 43 core-concept cards), plus a reading page for each of the 19 official exam task statements.
- **The nudge**: when you miss questions, the results screen sends you to the notecards behind them (the services those questions mention and the concepts for their topic). Home and Study also show a "Study these notecards first" prompt while you are still getting a topic wrong.

Underneath:

- **Spaced repetition**: cards you miss return within minutes or days; cards you know return after growing gaps (1d, 3d, 8d, 20d...). It applies to both questions and notecards.
- **Mastery tracking**: every card is *new*, *learning*, *familiar* or *nailed*, with a separate *struggling* flag. Progress rolls up by exam domain and by task statement.
- **Exam-date pacing**: set your exam date and review gaps are capped so every card comes back before the day.
- Keyboard shortcuts: in a test `A`-`E` answer and `Enter` moves on (`2` = "I guessed", `4` = "too easy"); on notecards `Space` reveals and `1`-`4` rate; `Z` undoes.
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

In a test a wrong answer is automatically *Again* and a right answer is *Good* (or *Hard* / *Easy* if you tap "I guessed" / "Too easy"). On notecards you rate yourself *Again / Hard / Good / Easy*. A missed question is not re-asked within the same test; it returns in the next one. Mastery: **familiar** at a 7+ day interval, **nailed** at 14+ days (both shrink if your exam is closer than that). **Struggling** means 2+ lapses and not yet nailed. Tests have no new-question limit; notecards introduce 20 new cards a day by default, drawn across domains in proportion to exam weight.

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
