import { TextSize } from "@/components/patient/text-size";
import { Card } from "@/components/ui/card";
import { hasKey, MODEL } from "@/lib/agents/run";
import { logout } from "@/lib/actions";
import { PATIENTS } from "@/lib/patients";

export default function Page() {
  const ai = hasKey();
  return (
    <>
      <h1 className="text-2xl font-semibold">Settings</h1>
      <Card title="You">
        <p className="text-lg font-medium">{PATIENTS[0].name}</p>
      </Card>
      <TextSize />
      <Card title="Who reads your words">
        <p>
          {ai
            ? `The questions, the reading of your check-ins, the suggestions and the drafted requests are written by Claude (${MODEL}).`
            : "No AI key is set on this deployment, so a built-in stand-in does the reading, the questions, the suggestions and the drafts. It is simpler and only looks for words. Every screen says which one answered."}
        </p>
      </Card>
      <form action={logout.bind(null, "patient")}>
        <button className="min-h-12 w-full rounded-xl border border-line bg-surface px-4 font-medium">Log out</button>
      </form>
    </>
  );
}
