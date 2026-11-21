const tones = {
  neutral: "bg-page text-muted border-line",
  accent: "bg-accent-soft text-accent border-accent-soft",
  warn: "bg-warn-soft text-warn border-warn-soft",
  alert: "bg-alert-soft text-alert border-alert-soft",
};

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: keyof typeof tones;
  children: React.ReactNode;
}) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}
