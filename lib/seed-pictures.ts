// Drawn placeholder pictures for the made-up history: a stylised patch of
// skin, redder the worse the day. Never a real photograph. Served by
// /api/images for keys named patients/<id>/images/seed-<name>.jpg.

const TONES: Record<string, { red: number; label: string }> = {
  "seed-fit": { red: 0.0, label: "Placeholder drawing: the socket, fresh fit" },
  "seed-mark": { red: 0.35, label: "Placeholder drawing: a faint red mark" },
  "seed-rub": { red: 0.6, label: "Placeholder drawing: red, rubbed skin" },
  "seed-sore": { red: 0.85, label: "Placeholder drawing: sore, irritated skin" },
};

export function seedPictureSvg(name: string): string | null {
  const tone = TONES[name];
  if (!tone) return null;
  const alpha = (0.15 + tone.red * 0.7).toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
<rect width="400" height="300" fill="#efe6dd"/>
<path d="M60 300 C70 200 120 120 200 110 C290 100 340 190 350 300 Z" fill="#e2c6ae"/>
<ellipse cx="215" cy="190" rx="${60 + tone.red * 40}" ry="${40 + tone.red * 30}" fill="#c0392b" fill-opacity="${alpha}"/>
<ellipse cx="215" cy="190" rx="${30 + tone.red * 20}" ry="${20 + tone.red * 14}" fill="#a82a1d" fill-opacity="${(Number(alpha) * 0.8).toFixed(2)}"/>
<path d="M30 40 h340 v32 h-340 z" fill="#ffffff" fill-opacity="0.75"/>
<text x="200" y="62" text-anchor="middle" font-family="sans-serif" font-size="15" fill="#444">${tone.label}</text>
</svg>`;
}
