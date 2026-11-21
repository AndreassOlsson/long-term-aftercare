# Demo walk-through

How the team shows it: the clinician's side open on the big screen (desktop),
and a team member using the patient's side on his own phone, as Maria. About
five minutes. The patient's side is `/patient` (password from
`PATIENT_PASSWORD`), the clinician's is `/doctor` (`DOCTOR_PASSWORD`). Locally
the example passwords are `maria` and `doctor`.

## Before you start

1. On the big screen open `/doctor`, log in, open **Demo tools** (top right)
   and choose **Reset to the starting state**, then confirm. Maria's record is
   now three made-up years: a long good stretch, then a slide over the last
   weeks, yesterday bad too, and **today not yet reported**. The inbox says
   nothing is waiting. Leave this window open on the inbox for the whole demo;
   it refreshes itself every few seconds, nobody reloads it.
2. On the phone open `/patient` and log in. Check the storage line on the home
   page: if a warning says no Blob store is connected, entries will not
   survive on the live site; run the demo locally or connect the store first.

## How the patient's side is laid out

Five pages, one per section: **Home**, **History**, **Ideas**, **Clinic**,
**Settings**. Swipe up and down and each one settles on a page; the bar at the
foot shows where you are and a tap on a name goes straight there. Checking in
and preparing a request are focused pages of their own, with no bar in the way.
The home page is the graph across the screen and one thing to do: check in.
Once today is in, it says so and offers to correct today's entry or remove it.
Suggestions are on Ideas; the request and the answers from the clinic are on
Clinic.

## The story, step by step

**1. The record already shows a decline** (big screen). Say: "The clinician
sees, before anything happens, that Maria has been getting worse and that
yesterday was bad too." Point at Maria's line in the list: *Declining*, the
combined figure down from where it usually is, and since when. Nothing is
waiting.

**2. He checks in** (phone, Home). Say: "Maria has not checked in today, so
home asks her to." Press **Check in**. Write that you feel bad today (for
example: "I am feeling bad today, the skin is itchy and sore under the liner
and it is hard to walk."), press **Add a picture** and choose the unhealthy
photo (`public/photos/unhealthy.jpg`, the worst of the three), press
**Continue**.

**3. The app asks one question** (phone). Say: "It has read the entry and the
picture in view of the days before, and it asks one thing: I can see you are
looking bad today as well, have you done anything different, or has it
declined on its own?" Nothing is saved yet.

**4. He answers** (phone). Press **Nothing different** (or type something) and
**Answer**.

**5. The app says what it will enter, and recommends a report** (phone). The
screen says it will enter this as today's entry and shows what it read, and
under that it recommends sending a report to the clinic, with the reason from
the record. At the end there are two choices: **Add to my record**, or **Add to
my record and request a visit**.

**6. He takes the second** (phone). The request opens prepared from the record,
today included: what changed and since when, her words, the picture. Read it,
change anything, press **Send to the clinic**.

**7. It appears on the big screen** (no reload). Say: "The request is in the
clinician's inbox, on top of a record that already showed the decline." Open
it: what changed and since when, the figures, her words, the days (each opens
that day), the pictures over time, with the unhealthy photo from today at the
end. **Download as PDF** gives the request as a document to hand over.

**8. Answering** (big screen). Offer a time (the box is filled with a
suggestion), press **Send the time**. On the phone, **Clinic** shows the
request as answered with the time offered.

**9. The rest of the patient's side** (phone, optional). Home now says she has
checked in today, with **Correct today's entry** and **Remove it**. **History**
has the three years and a day's words and picture (the same three photos along
the timeline: healthy through the long good stretch, medium as it begins to
slide, unhealthy in the bad weeks). **Ideas** has what she can do, each with the
reason. On the request's page on the phone, **Download as PDF** too.

**10. Run it again.** **Demo tools**, **Reset to the starting state**. Today is
not reported again.

A check-in on an ordinary day looks different on purpose: no question, no
recommendation, one choice, **Add to my record**. The question and the
recommendation come only when today is clearly low and the days just before
were low too, and never when she writes about a wound or a sign of infection:
then the app tells her to contact the clinic instead.

## If something fails

- **The network is down or the site is slow.** Run it locally: `npm install`,
  `cp .env.example .env.local`, `npm run dev`, open `http://localhost:3000`.
  Data is then kept in the `.data/` folder and nothing needs the network
  except the optional AI.
- **There is no AI key, or the AI call fails.** Nothing breaks. The agents
  fall back to their stand-ins and each screen says "built-in stand-in, not the
  AI". The stand-in reads keywords; with a key it is Claude, and it also looks
  at the picture.
- **The check-in says it could not read anything.** The stand-in needs a few
  words about how it has been ("feeling bad", "itchy", "hard to walk"). Or pick
  a score yourself under **Or score it yourself**.
- **The question does not come.** It comes when today is low after low days.
  After a reset yesterday is bad, so a clearly bad entry gets it. If you checked
  in already today, remove today's entry on Home first.
- **The patient's side is not working, or you want to skip it.** On the
  clinician side open **Demo tools**, choose **Add a sample request**, and carry
  on from step 7. It is the same kind of request Maria's phone sends.
- **A send on the clinician's side fails.** The page shows a red message and
  keeps what you wrote; press Send again. Nothing is half saved.
- **The inbox shows something stale.** It refreshes by itself every few
  seconds; if the tab was in the background, bring it forward. If the demo is in
  a mess, reset (step 1).
- **Login does not work.** Check the three environment variables in the
  README. Locally, `.env.local` must exist.
- **The live site shows no entries after a reload.** No Blob store is
  connected, so the site forgot them. Run it locally instead.

## Checking it without a browser in hand

`npm run build`, then `node scripts/check-patient.mjs` runs steps 1 to 10 in a
phone-sized browser with a desktop browser as the clinician's, and
`node scripts/check-clinician.mjs` the clinician's side. Both exit non-zero on
any failure.
