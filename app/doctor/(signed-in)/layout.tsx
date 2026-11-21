import Link from "next/link";
import { DemoMenu } from "@/components/clinician/demo-menu";
import { logout } from "@/lib/actions";
import { requireRole } from "@/lib/auth";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireRole("doctor");
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6">
          <Link href="/doctor" className="font-semibold">
            Aftercare <span className="font-normal text-muted">· Clinic</span>
          </Link>
          <nav className="flex flex-1 gap-1 text-sm">
            <Link href="/doctor" className="rounded-lg px-3 py-1.5 hover:bg-page">
              Inbox
            </Link>
          </nav>
          <DemoMenu />
          <form action={logout.bind(null, "doctor")}>
            <button className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-page">Log out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl min-w-0 flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
