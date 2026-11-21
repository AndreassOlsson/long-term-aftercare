"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { seenAnswers } from "./seen";

const items = [
  { href: "/patient", label: "Home", icon: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { href: "/patient/history", label: "History", icon: "M3 20h18M5 16l4-5 4 3 6-8" },
  { href: "/patient/clinic", label: "Clinic", icon: "M4 5h16v11H9l-5 4z" },
  { href: "/patient/settings", label: "Settings", icon: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3" },
];

export function Nav({ answered }: { answered: { id: string; updatedAt: string }[] }) {
  const pathname = usePathname();
  const [fresh, setFresh] = useState(0);
  useEffect(() => {
    const update = () => {
      const seen = seenAnswers();
      setFresh(answered.filter((a) => seen[a.id] !== a.updatedAt).length);
    };
    update();
    window.addEventListener("lta-seen", update);
    return () => window.removeEventListener("lta-seen", update);
  }, [answered]);

  // Checking in and preparing a request are focused tasks: no tabs in the way.
  if (pathname.startsWith("/patient/checkin") || pathname.startsWith("/patient/clinic/new")) return null;

  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface">
      <ul className="mx-auto flex max-w-md">
        {items.map((item) => {
          const active = item.href === "/patient" ? pathname === "/patient" : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-16 flex-col items-center justify-center gap-1 text-sm ${active ? "font-semibold text-accent" : "text-muted"}`}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={item.icon} />
                </svg>
                {item.label}
                {item.label === "Clinic" && fresh > 0 && (
                  <span className="absolute right-[28%] top-2 rounded-full bg-alert px-1.5 text-xs font-semibold text-accent-ink" aria-label={`${fresh} new answer`}>
                    {fresh}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
