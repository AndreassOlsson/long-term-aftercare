# Long-term aftercare

A proof of concept: a patient keeps a timeline of text and images about
life with their orthosis or prosthesis, and their clinician reads it.

There is one mock patient, Maria Andersson, and two fixed logins:

| Route | Who | Password comes from |
|---|---|---|
| `/patient` | Maria | `PATIENT_PASSWORD` |
| `/doctor` | the clinician, who then picks Maria | `DOCTOR_PASSWORD` |

No real patient data goes into this app.

## What is here

The core flow, with the analysis as a placeholder and no styling decisions made.

- **Patient (`/patient`, phone first):** the combined score over time, and a button to do today's assessment: free text, dictation where the browser supports it, and up to three pictures. If the entry says nothing about one of the metrics the patient gets one follow-up question, which they can skip. After saving, the new point lands on the combined graph, which then splits into one graph per metric.
- **Clinician (`/doctor`, desktop):** pick Maria in the sidebar to see the combined graph and a summary of the case; click a date to open the same expanded view the patient has, with that day's picture and notes.

Where things live:

- `lib/metrics.ts` the three metrics (itchiness, comfort, perceived mobility) and how they combine. Every score is 1 to 5 with 5 as the good end; the combined score is their mean. Change the metrics here.
- `lib/analysis.ts` **the placeholder to replace.** It turns an entry into scores and writes the case summary. It asks Claude when `ANTHROPIC_API_KEY` is set and otherwise falls back to a keyword count, so the flow works without a key.
- `lib/assessment.ts` what happens when the patient presses Done.
- `lib/storage.ts` where entries and pictures are kept: the Vercel Blob store when its token is present, the `.data/` folder on disk otherwise.
- `lib/seed.ts` six weeks of made-up history for Maria so the graphs are not empty. A real entry replaces the made-up one for its day.
- `components/timeline.tsx` the graph and its split animation, shared by both sides.
- `lib/auth.ts` the fixed-password login. Call `requireRole("patient")` or `requireRole("doctor")` at the top of any protected page.
- `app/api/health` shows which commit is live and which environment variables the deployment can see (never their values).

One entry per day: doing the assessment again the same day replaces that day's point.

## Run it locally

```bash
cp .env.example .env.local
```

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:3000. The example passwords are `maria` and `doctor`.

## Checks and deploys

Two GitHub Actions workflows in `.github/workflows/` do this. Agents cannot write to that folder, so a change to a workflow has to be committed by a person.

`ci.yml` runs lint, typecheck and build on every pull request and every push to `main`.

`deploy.yml` deploys to Vercel: a push to `main` goes to production, a pull request gets a preview URL posted as a comment. Vercel's own git deploys are switched off in `vercel.json`, because on the free plan they skip commits from anyone but the account owner.

## One-time setup on Vercel and GitHub

1. On vercel.com, import this repository as a new project (framework Next.js, defaults).
2. In the project, under Settings then Environment Variables, add `PATIENT_PASSWORD`, `DOCTOR_PASSWORD` and `SESSION_SECRET` (any long random string) for Production and Preview.
3. In the project, under Storage, create a Blob store with **private** access and connect it. That sets `BLOB_READ_WRITE_TOKEN` by itself. Entries and pictures live there. Without it the live site shows a warning and forgets new entries.
3b. Add `ANTHROPIC_API_KEY` as an environment variable to switch the analysis from the keyword stand-in to Claude.
4. In GitHub, under Settings then Secrets and variables then Actions, add three repository secrets:
   - `VERCEL_TOKEN` from vercel.com/account/tokens
   - `VERCEL_ORG_ID` the Team ID under the Vercel team's Settings
   - `VERCEL_PROJECT_ID` the Project ID under the project's Settings
5. Push to `main`, then open `/api/health` on the production URL: all values under `configured` should be `true`.

Until step 4 is done the deploy workflow skips itself and stays green.
