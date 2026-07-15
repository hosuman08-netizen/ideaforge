# IdeaForge — pitch → fund (demo)

A single-page demo where users submit ideas (text or voice), the community votes,
and backers fund the best ones with in-app Credits.

> **Fictional demo.** All tokens and Credits are in-app only. There is no real money,
> investment, return, or equity of any kind. 18+.

## Core loop
- **Submit**: title + public teaser (keywords + high-level problem) + a protected full pitch.
  An optional voice pitch adds a "pitch energy" score that boosts visibility.
- **Discover**: everyone sees teasers and keywords. The full pitch stays hidden.
- **Unlock**: pay a small Credit cost to read the full pitch. ~70% of the fee goes to the
  submitter, so submitters earn from serious interest.
- **Vote**: a finite daily budget (10/day), one vote per idea, toggleable.
- **Fund**: choose an amount in Credits; stake and ownership % are tracked; ideas hit a
  goal and become funded (funding is capped at the goal — no overfunding).
- **Activity**: a local log of your submissions, unlocks, votes, and investments, plus a
  timestamped submission receipt for prior-art reference.

## Protection model
Only the idea owner and backers who have unlocked (or invested in) an idea can see its
full pitch. Everyone else sees the teaser and keywords only.

## Ranking
Hot score = community votes + funding momentum + a small pitch-energy nudge. No random
placement — ranking reflects real signals.

## Tech
Client-only. Plain HTML/CSS/JS, `localStorage` for state, minimal PWA manifest and
service-worker stub. No backend, no external dependencies.

- `index.html` — layout
- `script.js` — app logic
- `style.css` — styling
- `manifest.json` / `sw.js` — PWA scaffolding

## Run
Open `index.html` in a browser, or serve the folder statically
(e.g. `python3 -m http.server`).
