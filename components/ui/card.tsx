export function Card({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-4 ${className}`}>
      {title && <h2 className="mb-2 text-sm font-medium text-muted">{title}</h2>}
      {children}
    </section>
  );
}
