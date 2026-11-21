import { redirect } from "next/navigation";

// Settings is a section of the one page now (/patient#settings).
export default function Page() {
  redirect("/patient#settings");
}
