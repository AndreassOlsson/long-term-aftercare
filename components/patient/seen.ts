// Which of the clinic's answers this browser has already opened. The request
// contract has no "read" state, so this is kept on the phone itself.
const KEY = "lta-seen-answers";

export function seenAnswers(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function markSeen(id: string, updatedAt: string) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...seenAnswers(), [id]: updatedAt }));
    window.dispatchEvent(new Event("lta-seen"));
  } catch {
    /* private mode: the answer simply shows as new again */
  }
}
