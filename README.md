# Codex Orchestrator

A Claude Code skill that lets Claude invoke OpenAI Codex for second opinions on code.

## Setup

1. **Ensure you have Node.js 18+**
   ```bash
   node --version  # Should be 18.x or higher
   ```

2. **Set your OpenAI API key**
   ```bash
   export OPENAI_API_KEY="your-key-here"
   ```

   Or add to your shell profile (~/.zshrc, ~/.bashrc):
   ```bash
   echo 'export OPENAI_API_KEY="your-key-here"' >> ~/.zshrc
   ```

3. **Install dependencies**
   ```bash
   cd ~/.claude/skills/codex-orchestrator
   npm install
   ```

## Usage

Once set up, just ask Claude Code to use Codex:

- "Write a function to parse CSV, then have codex review it"
- "Use codex to double check this code for bugs"
- "Get codex's opinion on my implementation"

Claude Code will automatically invoke the skill when you mention Codex or ask for a second opinion.

## Manual Testing

Test the script directly:

```bash
cd ~/.claude/skills/codex-orchestrator

# Simple test
echo '{"action":"new","prompt":"What is 2+2?"}' | npx tsx scripts/codex.ts

# Code review test
echo '{"action":"new","prompt":"Review this: function add(a,b){return a+b}"}' | npx tsx scripts/codex.ts
```

## Files

- `SKILL.md` - Instructions for Claude Code
- `scripts/codex.ts` - Main orchestration script
- `scripts/state.json` - Thread persistence (auto-created)
- `package.json` - Dependencies

## Troubleshooting

**"OPENAI_API_KEY not set"**
- Make sure you've exported the key in your current shell
- Verify with: `echo $OPENAI_API_KEY`

**"Cannot find module @openai/codex-sdk"**
- Run `npm install` in this directory

**Script hangs**
- Check your internet connection
- Codex may take a few seconds to respond

## Cost

Each Codex invocation uses your OpenAI API credits. Monitor usage at https://platform.openai.com/usage
