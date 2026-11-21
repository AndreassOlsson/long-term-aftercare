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

This is the skeleton only. The timeline itself is not built yet.

- `app/` the pages (Next.js App Router). `/patient` and `/doctor` are placeholders behind the login.
- `lib/auth.ts` the fixed-password login. Call `requireRole("patient")` or `requireRole("doctor")` at the top of any protected page or route.
- `lib/patients.ts` the list of patients, which is Maria.
- `app/api/health` shows which commit is live and which environment variables the deployment can see (never their values).

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

Every pull request and every push to `main` runs lint, typecheck and build (`.github/workflows/ci.yml`).

`.github/workflows/deploy.yml` deploys to Vercel: a push to `main` goes to production, a pull request gets a preview URL posted as a comment. Vercel's own git deploys are switched off in `vercel.json`, because on the free plan they skip commits from anyone but the account owner.

## One-time setup on Vercel and GitHub

1. On vercel.com, import this repository as a new project (framework Next.js, defaults).
2. In the project, under Settings then Environment Variables, add `PATIENT_PASSWORD`, `DOCTOR_PASSWORD` and `SESSION_SECRET` (any long random string) for Production and Preview.
3. In the project, under Storage, create a Blob store and connect it. That sets `BLOB_READ_WRITE_TOKEN` by itself. Images and timeline entries will live there.
4. In GitHub, under Settings then Secrets and variables then Actions, add three repository secrets:
   - `VERCEL_TOKEN` from vercel.com/account/tokens
   - `VERCEL_ORG_ID` the Team ID under the Vercel team's Settings
   - `VERCEL_PROJECT_ID` the Project ID under the project's Settings
5. Push to `main`, then open `/api/health` on the production URL: all four values under `configured` should be `true`.

Until step 4 is done the deploy workflow skips itself and stays green.
