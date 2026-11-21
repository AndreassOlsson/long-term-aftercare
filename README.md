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

The hub for the aftercare that runs for years after a fitting. This is the patient's side (phone first); the clinician's side is `/doctor`.

**Patient (`/patient`):** four tabs.

- **Home** says in plain words how things have been lately, has one main action (check in, or read the clinic's answer), shows the suggestions drawn from her own record each with its reason and the days it rests on, and proposes a request when the record shows a sustained change.
- **Check in** (`/patient/checkin`): the questions first (the question agent reads her record and asks about patterns, to make her reflect), then she types, talks or adds a picture. The metrics agent reads the measures out of what she said; the screen shows them in words and she can correct any of them. An entry from which no measure can be read is never saved (checked in `analyzeCheckin` and again in `commitCheckin`).
- **History** (`/patient/history`): how well it has been working, over years, in a window that moves; the combined line comes apart into itching, comfort and mobility; any day opens its words and pictures.
- **Clinic** (`/patient/clinic`): ask for a check-up (the request agent prepares it from the record; she edits and sends it through `saveRequest`), and see where each request stands and what the clinician answered.

What she reads are words, never the stored 1 to 5 (`wordFor` in `lib/metrics.ts`). A check-in that mentions a wound or signs of infection is answered with "contact the clinic" and an offer of a request, never self-care advice; that rule is code (`lib/agents/safety.ts`), not a prompt. Every agent has a stand-in for when no key is set or the call fails, and the screen says which answered.

Where things live:

- `lib/metrics.ts` the three metrics (itchiness, comfort, perceived mobility) and how they combine. Every score is 1 to 5 with 5 as the good end; the combined score is their mean. Change the metrics here.
- `lib/agents/` the agents and the case summary (questions, metrics, request draft; `lib/suggestions.ts` is the fourth agent, with `agents/safety.ts` the rule that keeps wounds out of self-care advice). Each asks Claude when `ANTHROPIC_API_KEY` is set and otherwise falls back to a simple stand-in, so the flow works without a key.
  - `question-agent.ts` prepares today's targeted questions before the patient writes: it looks up recent and long-term datapoints, the patient's earlier words and pictures, and the questions already asked, then picks one to three. Prepared once per day and kept.
  - `metrics-agent.ts` **the analysis placeholder.** Turns today's entry into a score per metric, and can look at earlier days to read "worse than yesterday" against the record.
  - `tools.ts` what an agent can look up in a patient's record; `run.ts` the shared loop (the Anthropic SDK's tool runner).
- `lib/metrics-csv.ts` the finalized scores, one row per day, in `patients/<id>/metrics.csv`. The graphs and both agents read this file.
- `lib/assessment.ts` what happens when the patient presses Done.
- `lib/storage.ts` where the CSV, the entries (text, questions) and the pictures are kept: the Vercel Blob store when its token is present, the `.data/` folder on disk otherwise.
- `lib/seed.ts` three years of made-up weekly history for Maria, with drawn placeholder pictures (`lib/seed-pictures.ts`), so the graphs are not empty. The first real entry writes it into the CSV together with the new row.
- `components/patient/` the patient's screens; `components/timeline.tsx` is the older graph the clinician's side still uses.
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
3b. Add `ANTHROPIC_API_KEY` as an environment variable to switch the agents from the stand-ins to Claude.
4. In GitHub, under Settings then Secrets and variables then Actions, add three repository secrets:
   - `VERCEL_TOKEN` from vercel.com/account/tokens
   - `VERCEL_ORG_ID` the Team ID under the Vercel team's Settings
   - `VERCEL_PROJECT_ID` the Project ID under the project's Settings
5. Push to `main`, then open `/api/health` on the production URL: all values under `configured` should be `true`.

Until step 4 is done the deploy workflow skips itself and stays green.

## The patient check

`npm run build`, then `node scripts/check-patient.mjs` drives the built app in a phone-sized browser through login, a check-in with text and a picture, the recorded measures and a correction, a suggestion with its reason, a request prepared, edited and sent, and that request read back from the record; it also shows that two random letters are not saved. It starts its own server with a fresh `.data` folder and writes 390 px screenshots to `patient-screens/` (or `$SCREENS`). With `ANTHROPIC_API_KEY` set the agents run on Claude; without it the stand-ins answer.
