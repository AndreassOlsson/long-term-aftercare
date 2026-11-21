import { redirect } from "next/navigation";

// The history is a section of the one page now (/patient#history).
export default async function Page({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const { day } = await searchParams;
  redirect(day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? `/patient?day=${day}#history` : "/patient#history");
}
