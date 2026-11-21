import { redirect } from "next/navigation";

// The clinic is a section of the one page now (/patient#clinic).
export default function Page() {
  redirect("/patient#clinic");
}
