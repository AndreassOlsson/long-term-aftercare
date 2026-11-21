import { logout } from "@/lib/actions";
import type { Role } from "@/lib/auth";

export function Shell({
  role,
  heading,
  children,
}: {
  role: Role;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{heading}</h1>
        <form action={logout.bind(null, role)}>
          <button className="text-sm underline">Log out</button>
        </form>
      </header>
      {children}
    </main>
  );
}
