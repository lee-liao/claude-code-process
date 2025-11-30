# Testing in WSL (Ubuntu)

Since this project uses `tsx` (which relies on `esbuild`), you need to ensure the Linux-specific binaries are installed in your WSL environment.

## 1. Navigate to the Project
In your WSL terminal, navigate to the project directory using the mounted path:

```bash
cd /mnt/d/MyCode/AI/ClaudeAction/claude-code-action/web-api
```

## 2. Prepare the Environment
You likely need to reinstall dependencies to get the Linux binaries for `esbuild` (required by `npm run dev`).

```bash
# Install dependencies (fetches Linux binaries)
npm install

# Check if Claude CLI is installed in WSL
which claude
```

If `claude` is not found, install it globally in WSL:
```bash
npm install -g @anthropic-ai/claude-code
```

## 3. Configuration
Ensure your `.env` file is set up. The code automatically handles the executable name, so `CLAUDE_EXECUTABLE_PATH=claude` works for both Windows and Linux.

## 4. Run the Server
Start the development server:

```bash
npm run dev
```

## 5. Test the API
Open a **new WSL terminal tab** (or use `curl` from Windows pointing to localhost) and run:

### Health Check
```bash
curl http://localhost:3000/health
```

### Submit a Task
```bash
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "taskType": "custom",
    "prompt": "Calculate 5 + 5",
    "maxTurns": 1
  }'
```

## Troubleshooting
- **"esbuild" error**: Run `npm install` again inside WSL.
- **"claude: command not found"**: Install the CLI globally (`npm i -g @anthropic-ai/claude-code`) or check your PATH.
- **Permission denied**: Ensure you have write permissions to the `./temp` directory.
