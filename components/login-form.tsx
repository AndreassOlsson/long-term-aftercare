import Link from "next/link";
import { login } from "@/lib/actions";
import { isConfigured, type Role } from "@/lib/auth";

export function LoginForm({
  role,
  title,
  failed,
}: {
  role: Role;
  title: string;
  failed: boolean;
}) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-12">
      <Link href="/" className="mb-10 self-start text-slate underline-offset-4 hover:underline">
        Long-term aftercare
      </Link>
      <h1 className="text-[1.75rem] font-bold leading-tight">{title}</h1>
      <p className="mt-2 text-slate">
        {role === "patient"
          ? "Enter the password you were given at your fitting."
          : "Enter the clinic password."}
      </p>

      {!isConfigured(role) && (
        <p className="mt-6 rounded-lg bg-caution px-4 py-3 text-sm leading-relaxed">
          Login is not set up here yet. Add the passwords as environment
          variables, as the README describes.
        </p>
      )}

      <form action={login.bind(null, role)} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-2 font-semibold">
          Password
          <input
            name="password"
            type="password"
            required
            autoFocus
            aria-invalid={failed || undefined}
            aria-describedby={failed ? "login-error" : undefined}
            className="rounded-lg border-2 border-rule bg-paper px-4 py-3 text-lg font-normal outline-none focus:border-ink aria-invalid:border-alert"
          />
        </label>
        {failed && (
          <p id="login-error" className="text-alert">
            That password did not match. Check it and try again.
          </p>
        )}
        <button className="mt-2 rounded-lg bg-ink px-4 py-3.5 text-lg font-semibold text-paper hover:bg-ink-soft">
          Log in
        </button>
      </form>
    </main>
  );
}
