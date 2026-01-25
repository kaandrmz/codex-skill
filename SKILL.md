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

## How to Use

### Step 1: Prepare the Prompt

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

### Step 2: Run the Script

The skill directory is at: `~/.claude/skills/codex-orchestrator`

**For a new review (without codebase access):**
```bash
echo '{"action":"new","prompt":"YOUR PROMPT HERE","topic":"brief description"}' | \
  npx --prefix ~/.claude/skills/codex-orchestrator tsx ~/.claude/skills/codex-orchestrator/scripts/codex.ts
```

**For a new review (with codebase access):**
```bash
echo '{"action":"new","prompt":"Review the auth module","workingDirectory":"/path/to/project"}' | \
  npx --prefix ~/.claude/skills/codex-orchestrator tsx ~/.claude/skills/codex-orchestrator/scripts/codex.ts
```

**To continue a previous thread:**
```bash
echo '{"action":"continue","prompt":"How should I fix that issue?"}' | \
  npx --prefix ~/.claude/skills/codex-orchestrator tsx ~/.claude/skills/codex-orchestrator/scripts/codex.ts
```

### Step 3: Parse the Response

The script returns JSON:
```json
{
  "success": true,
  "threadId": "019bf59c-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "response": "Codex's analysis...",
  "canContinue": true
}
```

On error:
```json
{
  "success": false,
  "error": "Error message",
  "canContinue": false
}
```

### Step 4: Present to User

Format Codex's response clearly:
- Quote or summarize Codex's main points
- Highlight agreements or disagreements with your own analysis
- Note any actionable suggestions

## Input Format

```json
{
  "action": "new" | "continue",
  "prompt": "The review request or follow-up question",
  "context": "Optional: additional context to prepend to prompt",
  "topic": "Optional: brief description for state tracking",
  "workingDirectory": "Optional: path to project for codebase access"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `action` | Yes | `"new"` to start fresh, `"continue"` to resume thread |
| `prompt` | Yes | The question or review request |
| `context` | No | Extra context prepended to prompt |
| `topic` | No | Description saved in state for reference |
| `workingDirectory` | No | Project path - gives Codex file access |

## Examples

### Example 1: Security Review (inline code)
User: "Have codex check this auth function for security issues"

```bash
echo '{
  "action": "new",
  "prompt": "Review this authentication function for security vulnerabilities:\n\nfunction authenticate(username, password) {\n  const query = `SELECT * FROM users WHERE username=\"${username}\"`;\n  return db.execute(query);\n}",
  "topic": "auth function security review"
}' | npx --prefix ~/.claude/skills/codex-orchestrator tsx ~/.claude/skills/codex-orchestrator/scripts/codex.ts
```

### Example 2: Codebase Review
User: "Have codex review the payment processing module"

```bash
echo '{
  "action": "new",
  "prompt": "Review the payment processing module in src/payments/ for security and correctness",
  "workingDirectory": "/Users/dev/ecommerce-app",
  "topic": "payment module review"
}' | npx --prefix ~/.claude/skills/codex-orchestrator tsx ~/.claude/skills/codex-orchestrator/scripts/codex.ts
```

### Example 3: Follow-up Question
User: "Ask codex how to fix that SQL injection"

```bash
echo '{
  "action": "continue",
  "prompt": "How should I fix the SQL injection vulnerability you identified? Show me the corrected code."
}' | npx --prefix ~/.claude/skills/codex-orchestrator tsx ~/.claude/skills/codex-orchestrator/scripts/codex.ts
```

### Example 4: Multi-turn Review Session
```
Turn 1: echo '{"action":"new","prompt":"Review this sorting algorithm","topic":"sort review"}' | ...
Turn 2: echo '{"action":"continue","prompt":"What about edge cases with empty arrays?"}' | ...
Turn 3: echo '{"action":"continue","prompt":"Can you suggest a more efficient approach?"}' | ...
```

## Error Handling

If the script fails:
1. Check OPENAI_API_KEY is set in `.env`
2. Verify npm install was run in the skill directory
3. Check the error message in the JSON response

Common errors:
- `"OPENAI_API_KEY environment variable not set"` → Check `.env` file
- `"Invalid JSON input"` → Check JSON formatting (escape special chars)
- Network errors → Check internet connection
- `"Not inside a trusted directory"` → Use `workingDirectory` for a git repo

## Notes

- Each Codex call uses OpenAI API credits
- Responses may take a few seconds
- Thread state is saved in `scripts/state.json`
- You control thread lifecycle via `action` field
- Codebase access requires `workingDirectory` pointing to a valid path
