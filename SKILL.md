---
name: codex-orchestrator
description: Orchestrate OpenAI Codex for code review and second opinions. Use when user asks to "use codex", "ask codex", "have codex review", "get codex's opinion", "double check with codex", or wants a second AI opinion on code.
---

# Codex Orchestrator

Invoke OpenAI Codex as a second opinion tool for code review, verification, and alternative approaches.

## When to Use

Trigger this skill when the user:
- Explicitly mentions "codex" (e.g., "have codex review this")
- Asks for a "second opinion" on code
- Wants code "double checked" by another AI
- Asks to "verify" or "validate" code with Codex

## Multi-Turn Usage

You can use this skill across multiple turns in a conversation:
1. First call: Start a new thread with `"action": "new"`
2. Follow-up calls: Continue the same thread with `"action": "continue"`

**You decide** when to start fresh vs continue:
- Use `"new"` when reviewing different code or switching topics
- Use `"continue"` for follow-up questions about the same review

This allows iterative refinement: ask Codex to review, then ask follow-ups, then ask for specific fixes - all in the same thread maintaining context.

## Codebase Access

Codex can access the user's codebase if you provide `workingDirectory`:

```json
{
  "action": "new",
  "prompt": "Review the authentication module for security issues",
  "workingDirectory": "/Users/username/project"
}
```

When `workingDirectory` is set:
- Codex can read files in that directory
- Codex understands the project structure
- Reviews are more contextual and accurate

**Use codebase access when:**
- Reviewing code that references other files
- Analyzing architecture or patterns across files
- The user's code depends on project context

---

## Input Methods (in order of preference)

### Method 1: File-Based Input (RECOMMENDED)

**Use this for ANY prompt containing code, quotes, backticks, or special characters.**

This method eliminates all shell escaping issues by having Claude write JSON to a file first, then pass the file path to the script.

```bash
# Step 1: Write JSON to a temp file using the Write tool
# Step 2: Call the script with --input-file
npx --prefix ~/.claude/skills/codex-orchestrator tsx ~/.claude/skills/codex-orchestrator/scripts/codex.ts --input-file /tmp/codex_input.json
```

**Example workflow:**
1. Use the Write tool to create `/tmp/codex_input.json`:
   ```json
   {
     "action": "new",
     "prompt": "Review this code:\n\n```tsx\nfunction Test() {\n  return <div className=\"test\">{`value`}</div>;\n}\n```",
     "topic": "React component review"
   }
   ```
2. Run: `npx --prefix ~/.claude/skills/codex-orchestrator tsx ~/.claude/skills/codex-orchestrator/scripts/codex.ts --input-file /tmp/codex_input.json`

### Method 2: Prompt File (for very large prompts)

When the prompt itself is very large (e.g., entire files), use `--prompt-file` or `promptFile` to read the prompt from a separate file:

**Via CLI argument:**
```bash
npx --prefix ~/.claude/skills/codex-orchestrator tsx ~/.claude/skills/codex-orchestrator/scripts/codex.ts \
  --input-file /tmp/codex_input.json \
  --prompt-file /tmp/prompt.txt
```

**Via JSON field:**
```json
{
  "action": "new",
  "promptFile": "/tmp/prompt.txt",
  "topic": "large code review"
}
```

The `--prompt-file` CLI argument takes precedence over both `prompt` and `promptFile` in the JSON.

### Method 3: Simple CLI Arguments (for trivial prompts only)

For simple prompts without any special characters:

```bash
npx --prefix ~/.claude/skills/codex-orchestrator tsx ~/.claude/skills/codex-orchestrator/scripts/codex.ts Review this sorting algorithm for efficiency
```

This automatically creates `{"action": "new", "prompt": "Review this sorting algorithm for efficiency"}`.

### Method 4: Stdin JSON (LEGACY - avoid for complex prompts)

Only use for simple prompts without special characters. Requires careful JSON escaping.

```bash
echo '{"action":"new","prompt":"Simple prompt here"}' | \
  npx --prefix ~/.claude/skills/codex-orchestrator tsx ~/.claude/skills/codex-orchestrator/scripts/codex.ts
```

**JSON Escaping Reference (when using stdin):**

These characters MUST be escaped in the prompt value:
- `"` → `\"`
- `\` → `\\`
- newlines → `\n`
- tabs → `\t`
- backticks → `` ` `` (no escaping needed in JSON, but watch shell escaping)

**Warning:** Shell escaping combined with JSON escaping creates multiple layers that easily break with code snippets.

---

## Validation Mode

Use `--validate` to test input parsing without calling the Codex API:

```bash
npx --prefix ~/.claude/skills/codex-orchestrator tsx ~/.claude/skills/codex-orchestrator/scripts/codex.ts \
  --validate --input-file /tmp/codex_input.json
```

Returns:
```json
{
  "valid": true,
  "action": "new",
  "promptLength": 1234,
  "hasContext": false,
  "hasTopic": true,
  "hasWorkingDirectory": false
}
```

This is useful for debugging input issues before making API calls.

---

## Preparing the Prompt

Build a context-aware prompt based on what the user wants:

**For security review:**
```
Review this code for security vulnerabilities, injection risks, and unsafe patterns:

[CODE HERE]
```

**For bug hunting:**
```
Analyze this code critically. Look for edge cases, potential bugs, and logic errors:

[CODE HERE]
```

**For performance review:**
```
Review this code for performance issues, inefficiencies, and optimization opportunities:

[CODE HERE]
```

**For general review (default):**
```
Review this code and provide feedback on correctness, clarity, and potential improvements:

[CODE HERE]
```

---

## Complete Examples

### Example 1: Security Review with Code (File-Based)

User: "Have codex check this auth function for security issues"

**Step 1:** Write the input JSON to a temp file:
```json
{
  "action": "new",
  "prompt": "Review this authentication function for security vulnerabilities:\n\n```javascript\nfunction authenticate(username, password) {\n  const query = `SELECT * FROM users WHERE username=\"${username}\"`;\n  return db.execute(query);\n}\n```",
  "topic": "auth function security review"
}
```

**Step 2:** Run:
```bash
npx --prefix ~/.claude/skills/codex-orchestrator tsx ~/.claude/skills/codex-orchestrator/scripts/codex.ts --input-file /tmp/codex_input.json
```

### Example 2: Codebase Review

User: "Have codex review the payment processing module"

```json
{
  "action": "new",
  "prompt": "Review the payment processing module in src/payments/ for security and correctness",
  "workingDirectory": "/Users/dev/ecommerce-app",
  "topic": "payment module review"
}
```

### Example 3: Follow-up Question

User: "Ask codex how to fix that SQL injection"

```json
{
  "action": "continue",
  "prompt": "How should I fix the SQL injection vulnerability you identified? Show me the corrected code."
}
```

### Example 4: Large Code Review with Prompt File

For reviewing entire files, write the code to a prompt file:

**Step 1:** Write the prompt to `/tmp/prompt.txt`:
```
Review this entire module for bugs and security issues:

[paste the entire file content here]
```

**Step 2:** Write minimal JSON to `/tmp/codex_input.json`:
```json
{
  "action": "new",
  "topic": "module review"
}
```

**Step 3:** Run with both files:
```bash
npx --prefix ~/.claude/skills/codex-orchestrator tsx ~/.claude/skills/codex-orchestrator/scripts/codex.ts \
  --input-file /tmp/codex_input.json \
  --prompt-file /tmp/prompt.txt
```

### Example 5: Multi-turn Review Session

```
Turn 1: Write {"action":"new","prompt":"Review this sorting algorithm","topic":"sort review"} to file, run with --input-file
Turn 2: Write {"action":"continue","prompt":"What about edge cases with empty arrays?"} to file, run with --input-file
Turn 3: Write {"action":"continue","prompt":"Can you suggest a more efficient approach?"} to file, run with --input-file
```

---

## Response Format

The script returns JSON:

**Success:**
```json
{
  "success": true,
  "threadId": "019bf59c-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "response": "Codex's analysis...",
  "canContinue": true
}
```

**Error:**
```json
{
  "success": false,
  "error": "Error message with details",
  "canContinue": false
}
```

---

## Input Format Reference

```json
{
  "action": "new" | "continue",
  "prompt": "The review request or follow-up question",
  "promptFile": "Optional: path to file containing the prompt",
  "context": "Optional: additional context to prepend to prompt",
  "topic": "Optional: brief description for state tracking",
  "workingDirectory": "Optional: path to project for codebase access"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `action` | Yes | `"new"` to start fresh, `"continue"` to resume thread |
| `prompt` | Yes* | The question or review request (*not required if using `promptFile`) |
| `promptFile` | No | Path to file containing the prompt (alternative to `prompt`) |
| `context` | No | Extra context prepended to prompt |
| `topic` | No | Description saved in state for reference |
| `workingDirectory` | No | Project path - gives Codex file access |

---

## CLI Arguments Reference

| Argument | Description |
|----------|-------------|
| `--input-file <path>` | Read JSON input from file (RECOMMENDED) |
| `--prompt-file <path>` | Read prompt content from file |
| `--validate` | Test input parsing without calling Codex API |

---

## Error Handling

If the script fails:
1. Check OPENAI_API_KEY is set in `.env`
2. Verify npm install was run in the skill directory
3. Check the error message in the JSON response

Common errors:
- `"OPENAI_API_KEY environment variable not set"` → Check `.env` file
- `"Invalid JSON input: ..."` → JSON parsing failed (use --input-file to avoid escaping issues)
- `"Failed to read input file ..."` → Check file path exists and is readable
- `"Invalid action ..."` → action must be "new" or "continue"
- Network errors → Check internet connection
- `"Not inside a trusted directory"` → Use `workingDirectory` for a git repo

---

## Notes

- Each Codex call uses OpenAI API credits
- Responses may take a few seconds
- Thread state is saved in `scripts/state.json`
- You control thread lifecycle via `action` field
- Codebase access requires `workingDirectory` pointing to a valid path
- **Always prefer `--input-file` for prompts containing code**
