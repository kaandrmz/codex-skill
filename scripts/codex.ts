import { config } from "dotenv";
import { Codex } from "@openai/codex-sdk";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = join(__dirname, "..");

// Load .env from skill directory (quiet mode to suppress debug output)
config({ path: join(SKILL_DIR, ".env"), debug: false });

const STATE_FILE = join(__dirname, "state.json");

interface State {
  threadId?: string;
  topic?: string;
  lastUsed?: string;
  messageCount?: number;
  workingDirectory?: string;  // Persist for thread continuation
}

interface Input {
  action: "new" | "continue";
  prompt: string;
  context?: string;
  topic?: string;
  workingDirectory?: string;  // Give Codex access to a codebase directory
}

interface Output {
  success: boolean;
  threadId?: string;
  response?: string;
  error?: string;
  canContinue: boolean;
}

function loadState(): State {
  if (existsSync(STATE_FILE)) {
    try {
      return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
    } catch {
      return {};
    }
  }
  return {};
}

function saveState(state: State): void {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function output(data: Output): void {
  console.log(JSON.stringify(data, null, 2));
}

async function main(): Promise<void> {
  // Read input from stdin
  let inputData = "";

  // Check if stdin has data
  if (!process.stdin.isTTY) {
    inputData = readFileSync(process.stdin.fd, "utf-8");
  } else {
    // Fallback: read from command line args
    const args = process.argv.slice(2);
    if (args.length === 0) {
      output({
        success: false,
        error: "No input provided. Pipe JSON or pass prompt as argument.",
        canContinue: false,
      });
      process.exit(1);
    }
    // Simple mode: just a prompt string
    inputData = JSON.stringify({ action: "new", prompt: args.join(" ") });
  }

  let input: Input;
  try {
    input = JSON.parse(inputData);
  } catch {
    output({
      success: false,
      error: "Invalid JSON input",
      canContinue: false,
    });
    process.exit(1);
  }

  if (!input.prompt) {
    output({
      success: false,
      error: "Missing 'prompt' field in input",
      canContinue: false,
    });
    process.exit(1);
  }

  // Check for API key
  if (!process.env.OPENAI_API_KEY) {
    output({
      success: false,
      error: "OPENAI_API_KEY environment variable not set",
      canContinue: false,
    });
    process.exit(1);
  }

  const state = loadState();
  const codex = new Codex({
    apiKey: process.env.OPENAI_API_KEY,
  });

  try {
    let thread;
    let isNewThread = true;

    // Thread options - always skip git check (user explicitly invokes this skill)
    const threadOptions: {
      skipGitRepoCheck: boolean;
      workingDirectory?: string;
    } = {
      skipGitRepoCheck: true,
    };

    // Use workingDirectory from input, or fall back to persisted state for continuations
    const effectiveWorkingDir = input.workingDirectory || state.workingDirectory;
    if (effectiveWorkingDir) {
      threadOptions.workingDirectory = effectiveWorkingDir;
    }

    // Decide whether to continue or start new - Claude Code controls this via action field
    if (input.action === "continue" && state.threadId) {
      thread = codex.resumeThread(state.threadId, threadOptions);
      isNewThread = false;
    } else {
      thread = codex.startThread(threadOptions);
    }

    // Build the full prompt with context if provided
    let fullPrompt = input.prompt;
    if (input.context) {
      fullPrompt = `${input.context}\n\n${input.prompt}`;
    }

    // Run the prompt
    const result = await thread.run(fullPrompt);

    // Extract the final response text
    let responseText: string;
    if (typeof result === "string") {
      responseText = result;
    } else if (result && typeof result === "object" && "finalResponse" in result) {
      responseText = (result as { finalResponse: string }).finalResponse;
    } else {
      responseText = JSON.stringify(result);
    }

    // Update state (persist workingDirectory for continuations)
    const newState: State = {
      threadId: thread.id,
      topic: input.topic || state.topic || "general review",
      lastUsed: new Date().toISOString(),
      messageCount: (isNewThread ? 0 : state.messageCount || 0) + 1,
      workingDirectory: effectiveWorkingDir,
    };
    saveState(newState);

    output({
      success: true,
      threadId: thread.id,
      response: responseText,
      canContinue: true,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    output({
      success: false,
      error: `Codex error: ${errorMessage}`,
      canContinue: false,
    });
    process.exit(1);
  }
}

main();
