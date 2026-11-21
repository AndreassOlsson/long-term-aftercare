import type { ButtonHTMLAttributes } from "react";

const styles = {
  primary: "bg-accent text-accent-ink hover:opacity-90",
  secondary: "border border-line bg-surface text-ink hover:bg-page",
  quiet: "text-accent underline-offset-2 hover:underline",
};

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof styles }) {
  return (
    <button
      {...props}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 font-medium transition disabled:opacity-50 ${styles[variant]} ${className}`}
    />
  );
}
