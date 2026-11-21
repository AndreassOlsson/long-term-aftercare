# Demo walk-through

From Maria's check-in to the clinician's answer reaching her phone. About
five minutes. You need two browser windows: a phone-sized one for Maria
(`/patient`, password from `PATIENT_PASSWORD`) and a desktop one for the
clinician (`/doctor`, password from `DOCTOR_PASSWORD`). Locally the example
passwords are `maria` and `doctor`.

## Before you start

1. Open `/doctor` and log in. Open **Demo tools** (top right) and choose
   **Reset to the starting state**, then confirm. Maria's record is now the
   made-up six weeks, with a good stretch and then two weeks of sliding, and
   the inbox says nothing is waiting.
2. Check the storage line on the first screen you see as Maria: if a warning
   says no Blob store is connected, entries will not survive on the live
   site; run the demo locally or connect the store first.

## The story, step by step

**1. Maria checks in** (phone window, `/patient`). Say: "Maria is a few
years into her aftercare. She checks in about once a week." Write a short
entry about the socket rubbing and feeling loose, add a picture if you have
one, answer the follow-up question or skip it, and press Done. Say: "Her words
become the same few measures every time. She can see and correct them."

**2. She asks for a check-up** (phone window). Say: "The app has seen the
figures sliding and offers to prepare a request." Open the suggestion, read
what it prepared (what changed and since when, her words, the pictures),
change anything you like and send it.

**3. The clinician's inbox** (desktop window, `/doctor`). Say: "The clinician
sees what needs an answer first, with why. The other patients are
placeholders." Point at the request at the top, marked New, and at Maria's
line in the list below: the combined figure, down from where it usually is,
and since when.

**4. The request as a case.** Open it. Say: "No phone call needed: what
changed and since when, the figures, her own words, her pictures over time."
Click one of the dates under "The days it rests on": that day's figures and
her words open in a side panel. Say: "Every claim leads to the day it rests
on." Opening the request marked it Seen; the badge shows it.

**5. Answering.** Offer a time (the box is filled with a suggestion), add a
note if you like, press **Send the time**. The answer appears on the request
with its time. Say: "The answer is saved on the request."

**6. It reaches Maria** (phone window). Reload her home screen: the request
shows as answered with the time offered.

**7. The whole record** (optional, desktop). From the inbox open Maria
Andersson: the summary (each claim links to a day, and it says whether the AI
or the stand-in wrote it), the graphs for the combined figure and each
measure, with a range picker, the entries and the pictures over time. Every
figure runs from 1 to 5 and 5 is always the good end. Nothing on these
screens is a diagnosis: the app records and passes on what Maria reports.

**8. Run it again.** **Demo tools**, **Reset to the starting state**.

## If something fails

- **The network is down or the site is slow.** Run it locally: `npm install`,
  `cp .env.example .env.local`, `npm run dev`, open `http://localhost:3000`.
  Data is then kept in the `.data/` folder and nothing needs the network
  except the optional AI.
- **There is no AI key, or the AI call fails.** Nothing breaks. The agents
  fall back to their stand-ins and the summary says "Written by the built-in
  stand-in". Say so if asked: "the stand-in reads keywords; with a key it is
  Claude."
- **The patient's side is not working, or you want to skip it.** On the
  clinician side open **Demo tools**, choose **Add a sample request**, and
  carry on from step 3. It is the same kind of request Maria's phone sends.
- **A send on the clinician's side fails.** The page shows a red message and
  keeps what you wrote; press Send again. Nothing is half saved.
- **The inbox shows something stale.** Reload the page. If the demo is in a
  mess, reset (step 1).
- **Login does not work.** Check the three environment variables in the
  README. Locally, `.env.local` must exist.
- **The live site shows no entries after a reload.** No Blob store is
  connected, so the site forgot them. Run it locally instead.

## Checking it without a browser in hand

`npm run build` then `node scripts/check-clinician.mjs` drives the built
clinician side through steps 3 to 5 and the reset, and exits non-zero on any
failure.
