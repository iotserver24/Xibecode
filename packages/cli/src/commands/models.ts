/**
 * Models command - list available models from API endpoint
 */
import { Command } from "commander";
import { ConfigManager } from "../utils/config.js";

async function listModelsCommand(options: {
  apiKey?: string;
  baseUrl?: string;
  profile?: string;
}) {
  const config = new ConfigManager(options.profile);
  const apiKey = options.apiKey ?? config.getApiKey();
  const baseUrl = options.baseUrl ?? config.getBaseUrl();
  const model = config.getModel();

  console.log(`\n📦 XibeCode Models (${options.profile || "default"} profile)`);
  console.log("=".repeat(50));

  console.log(
    `API Key:   ${apiKey ? apiKey.substring(0, 8) + "..." + apiKey.slice(-4) : "not set"}`,
  );
  console.log(`Base URL:  ${baseUrl ? baseUrl : "using provider default"}`);
  console.log(`Current Model: ${model}`);

  console.log("\n🔍 Fetching models from API...");

  const normalizedBase = baseUrl ? baseUrl.replace(/\/+$/, "") : "";

  const res = await fetch(`${normalizedBase}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey ?? ""}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    console.log(`\n❌ Fetch failed: ${res.status}`);
    console.log(
      `   Please set your API key with: xibecode config --set-key YOUR_KEY`,
    );
    process.exit(1);
  }

  let models: string[] = [];

  const payloadData = await res.json();
  // Handle both array and single object responses
  if (Array.isArray(payloadData.data)) {
    const modelCandidates: unknown[] = payloadData.data;
    const modelEntries = modelCandidates.filter((m): m is { id: string } => {
        if (typeof m !== "object" || m === null) {
          return false;
        }
        if (!("id" in m)) {
          return false;
        }
        return typeof (m as { id?: unknown }).id === "string";
      });
    models = modelEntries.map((m) => m.id);
  } else if (
    typeof payloadData.data === "object" &&
    payloadData.data !== null &&
    "id" in payloadData.data &&
    typeof (payloadData.data as { id?: unknown }).id === "string"
  ) {
    models = [(payloadData.data as { id: string }).id];
  }

  if (!models.length) {
    console.log(`\n⚠️  No models returned from /models endpoint`);
    process.exit(1);
  }

  console.log(`\n✅ Found ${models.length} model(s):\n`);
  console.table(models.map((m, i) => ({ "#": i + 1, Model: m })));
  console.log(
    `\n🎯 Set default model: xibecode config --set-model ${models[0]}`,
  );
  console.log("\n");
}

const modelsCmd = new Command("models");
modelsCmd
  .description("List available models from the configured API")
  .option("-k, --api-key <key>", "API key (overrides config)")
  .option("-b, --base-url <url>", "Custom base URL")
  .option("--profile <name>", "Config profile to use")
  .action(listModelsCommand);

export { modelsCmd };
