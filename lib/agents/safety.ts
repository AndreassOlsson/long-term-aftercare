// The one rule that must not depend on a prompt: a check-in that mentions a
// wound or signs of infection is never answered with self-care advice. The
// patient is told to contact the clinic and offered a request instead. Every
// place that could hand out advice asks this first.

const PATTERNS: RegExp[] = [
  /\bwounds?\b/i,
  /\binfect/i,
  /\bpus\b/i,
  /\bdischarge\b/i,
  /\bfever/i,
  /\bblister/i,
  /\bopen (sore|skin|cut)/i,
  /\bbroken skin\b/i,
  /\bbleed/i,
  /\bswollen\b|\bswelling\b/i,
  /\bfoul\b|\bsmells?\b/i,
  /\bhot to (the )?touch\b/i,
  /\bred streak/i,
  /\bsår\b|\binfektion|\bvätskar|\bblödning/i,
];

export const mentionsWoundOrInfection = (text: string): boolean =>
  PATTERNS.some((pattern) => pattern.test(text));

export const CONTACT_CLINIC =
  "You mentioned something that could be a wound or a sign of infection. Please contact the clinic about it; this is not something to treat at home. You can ask for a check-up here, and the app will prepare it from what you wrote.";
