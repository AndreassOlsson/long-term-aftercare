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
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {!isConfigured(role) && (
        <p className="rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
          Login is not configured in this environment. See the README for the
          environment variables.
        </p>
      )}
      <form action={login.bind(null, role)} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            name="password"
            type="password"
            required
            autoFocus
            className="rounded border border-zinc-300 px-3 py-2 text-base"
          />
        </label>
        {failed && <p className="text-sm text-red-700">Wrong password.</p>}
        <button className="rounded bg-zinc-900 px-3 py-2 font-medium text-white">
          Log in
        </button>
      </form>
    </main>
  );
}
