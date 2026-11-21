import { Checkin } from "@/components/patient/checkin";

// The agents run inside this page's actions and can take a while.
export const maxDuration = 300;

export default function Page() {
  return <Checkin />;
}
