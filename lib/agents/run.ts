import Anthropic from "@anthropic-ai/sdk";
import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import type { BetaContentBlockParam } from "@anthropic-ai/sdk/resources/beta";

// Both agents are the same small loop: Claude gets a job and a few tools to
// look things up in the patient's record, calls them as it sees fit, and
// hands back its result by calling one last tool. The SDK's tool runner
// drives the loop.

export const MODEL = process.env.ANALYSIS_MODEL ?? "claude-opus-5-5";
export const hasKey = () => Boolean(process.env.ANTHROPIC_API_KEY);

const MAX_TURNS = 8;

export async function runAgent(options: {
  system: string;
  content: string | BetaContentBlockParam[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tools differ in input type
  tools: BetaRunnableTool<any>[];
}): Promise<void> {
  const client = new Anthropic();
  const final = await client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: options.system,
    tools: options.tools,
    messages: [{ role: "user", content: options.content }],
    max_iterations: MAX_TURNS,
  });
  if (final.stop_reason === "refusal") {
    throw new Error("The model declined the request");
  }
}

/** Plain one-shot text, for the case summary. */
export async function askText(system: string, content: string): Promise<string> {
  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system,
    messages: [{ role: "user", content }],
  });
  const text = response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();
  if (response.stop_reason === "refusal" || !text) {
    throw new Error(`No text came back (stop reason: ${response.stop_reason})`);
  }
  return text;
}
