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
  // Parse CLI arguments
  const args = process.argv.slice(2);
  const inputFileIndex = args.indexOf("--input-file");
  const promptFileIndex = args.indexOf("--prompt-file");
  const validateMode = args.includes("--validate");

  let inputData = "";

  // Priority 1: --input-file (RECOMMENDED - avoids all shell escaping)
  if (inputFileIndex !== -1 && args[inputFileIndex + 1]) {
    const inputPath = args[inputFileIndex + 1];
    try {
      inputData = readFileSync(inputPath, "utf-8");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      output({
        success: false,
        error: `Failed to read input file "${inputPath}": ${errorMessage}`,
        canContinue: false,
      });
      process.exit(1);
    }
  }
  // Priority 2: stdin (if available)
  else if (!process.stdin.isTTY) {
    inputData = readFileSync(process.stdin.fd, "utf-8");
  }
  // Priority 3: simple CLI args (prompt as arguments)
  else if (args.length > 0 && !args[0].startsWith("--")) {
    inputData = JSON.stringify({ action: "new", prompt: args.join(" ") });
  }
  // No input provided
  else {
    output({
      success: false,
      error: "No input provided. Use --input-file, pipe JSON to stdin, or pass prompt as argument.",
      canContinue: false,
    });
    process.exit(1);
  }

  let input: Input;
  try {
    input = JSON.parse(inputData);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    const preview = inputData.slice(0, 200);
    output({
      success: false,
      error: `Invalid JSON input: ${errorMessage}. Preview: ${JSON.stringify(preview)}`,
      canContinue: false,
    });
    process.exit(1);
  }

  // Handle --prompt-file: read prompt content from a separate file
  if (promptFileIndex !== -1 && args[promptFileIndex + 1]) {
    const promptPath = args[promptFileIndex + 1];
    try {
      input.prompt = readFileSync(promptPath, "utf-8");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      output({
        success: false,
        error: `Failed to read prompt file "${promptPath}": ${errorMessage}`,
        canContinue: false,
      });
      process.exit(1);
    }
  }
  // Also support promptFile in JSON input
  else if ((input as Input & { promptFile?: string }).promptFile) {
    const promptPath = (input as Input & { promptFile?: string }).promptFile!;
    try {
      input.prompt = readFileSync(promptPath, "utf-8");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      output({
        success: false,
        error: `Failed to read prompt file "${promptPath}": ${errorMessage}`,
        canContinue: false,
      });
      process.exit(1);
    }
  }

  // Validate action field
  if (!["new", "continue"].includes(input.action)) {
    output({
      success: false,
      error: `Invalid action "${input.action}". Must be "new" or "continue".`,
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

  // Validate mode: test input parsing without calling Codex API
  if (validateMode) {
    console.log(JSON.stringify({
      valid: true,
      action: input.action,
      promptLength: input.prompt.length,
      hasContext: !!input.context,
      hasTopic: !!input.topic,
      hasWorkingDirectory: !!input.workingDirectory,
    }, null, 2));
    process.exit(0);
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
