# Claude Code Web API

A Web API server that enables non-interactive execution of Claude Code through HTTP requests. This allows you to integrate Claude Code capabilities into your applications, workflows, and services.

## Features

- **Non-Interactive Execution**: Run Claude Code without user interaction
- **Predefined Task Templates**: Ready-to-use templates for common tasks

```env
# Server Configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

# Claude Code Configuration
CLAUDE_EXECUTABLE_PATH=claude  # Path to Claude CLI executable
DEFAULT_TIMEOUT=300            # Default timeout in seconds
MAX_CONCURRENT_TASKS=5        # Maximum concurrent tasks
TEMP_DIR=./temp              # Temporary directory for tasks

# Authentication (optional)
ENABLE_AUTH=true
API_KEY=your-secret-api-key

# Rate Limiting
RATE_LIMIT_PER_MINUTE=60

# Claude API
ANTHROPIC_API_KEY=your-anthropic-api-key
```

## Task Templates

The API provides predefined task templates for common scenarios:

### Available Templates

1. **Code Review** (`code-review`)
   - Review code for quality, security, and best practices
   - Output: Issues, recommendations, overall score

2. **Bug Fix** (`bug-fix`)
   - Identify and fix bugs in the codebase
   - Output: Root cause analysis, fix description, verification steps

3. **Feature Implementation** (`feature-implementation`)
   - Implement new features according to specifications
   - Output: Implementation details, files changed, tests added

4. **Documentation** (`documentation`)
   - Generate or update documentation
   - Output: API docs, setup instructions, usage examples

5. **Performance Analysis** (`performance-analysis`)
   - Analyze and optimize code performance
   - Output: Performance issues, optimization recommendations

6. **Security Audit** (`security-audit`)
   - Perform security analysis and identify vulnerabilities
   - Output: Security score, vulnerabilities, remediation steps

## API Endpoints

### Health Check
```http
GET /health
```

Returns server health status and active task count.

### List Templates
```http
GET /templates
GET /templates?category=Development
```

Returns available task templates, optionally filtered by category.

### Get Template
```http
GET /templates/{taskType}
```

Returns details for a specific task template.

### Submit Task
```http
POST /tasks
Content-Type: application/json

{
  "taskType": "code-review",
  "prompt": "Review the authentication module",
  "model": "claude-4-0-sonnet-20250805",
  "maxTurns": 10,
  "allowedTools": "Read,Grep,Edit,Write",
  "timeoutSeconds": 300,
  "outputSchema": {
    "type": "object",
    "properties": {
      "summary": {"type": "string"},
      "issues": {"type": "array"}
    }
  }
}
```

Submits a new task for execution. Returns immediately with task ID.

### Get Task Status
```http
GET /tasks/{taskId}
```

Returns current status, result (if completed), and execution metrics.

### Cancel Task
```http
DELETE /tasks/{taskId}
```

Cancels a running task.

### Server Statistics
```http
GET /stats
```

Returns server statistics and system information.

## Usage Examples

### 1. Code Review

```bash
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "taskType": "code-review",
    "prompt": "Review the src/auth/ directory for security vulnerabilities",
    "maxTurns": 15
  }'
```

Response:
```json
{
  "taskId": "abc123def456",
  "status": "pending",
  "createdAt": "2024-01-01T12:00:00.000Z"
}
```

Check status:
```bash
curl -X GET http://localhost:3000/tasks/abc123def456 \
  -H "Authorization: Bearer your-api-key"
```

### 2. Custom Task

```bash
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "taskType": "custom",
    "prompt": "Create a REST API endpoint for user management with CRUD operations",
    "allowedTools": "Read,Write,Edit,Grep",
    "outputSchema": {
      "type": "object",
      "properties": {
        "endpoints": {"type": "array"},
        "models": {"type": "array"},
        "tests": {"type": "array"}
      },
      "required": ["endpoints"]
    }
  }'
```

### 3. Feature Implementation

```bash
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "taskType": "feature-implementation",
    "prompt": "Read openspec/changes/[change-id]/tasks.md and implement all tasks sequentially.",
	"maxTurns": 20,
    "repoUrl": "https://github.com/DrLinAITeam2/simplest-repo"
  }'
```



## Response Format

### Task Response
```json
{
  "taskId": "abc123def456",
  "status": "completed|failed|pending|running",
  "result": {
    // Claude's output when completed
  },
  "error": "Error message if failed",
  "executionMetrics": {
    "durationMs": 15000,
    "numTurns": 8,
    "totalCostUsd": 0.045,
    "permissionDenials": 0
  },
  "createdAt": "2024-01-01T12:00:00.000Z",
  "startedAt": "2024-01-01T12:00:01.000Z",
  "completedAt": "2024-01-01T12:00:16.000Z"
}
```

PORT=3000
HOST=0.0.0.0
ENABLE_AUTH=true
API_KEY=your-production-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
MAX_CONCURRENT_TASKS=10
RATE_LIMIT_PER_MINUTE=120
```

## Security Considerations

1. **API Key Protection**: Always use HTTPS and protect your API keys
2. **Input Validation**: The API validates all inputs using Zod schemas
3. **Rate Limiting**: Built-in rate limiting prevents abuse
4. **Output Sanitization**: Sensitive information is filtered from outputs
5. **Timeout Protection**: Tasks are automatically terminated after timeout
6. **Tool Restrictions**: Limit allowed tools for security-sensitive tasks

## Monitoring

### Health Monitoring

- `/health` endpoint for health checks
- `/stats` endpoint for server statistics
- Built-in logging with request/response details

### Metrics

- Task execution time
- API costs tracking
- Error rates
- Concurrent task utilization
- Rate limiting statistics

## Troubleshooting

### Claude Code Not Found

Ensure Claude Code is installed and accessible:
```bash
claude --version
```

### Authentication Issues

Check your Anthropic API key is set correctly:
```bash
echo $ANTHROPIC_API_KEY
```

### Permission Errors

Ensure the temporary directory is writable:
```bash
mkdir -p ./temp
chmod 755 ./temp
```

### Task Timeouts

Increase timeout in configuration or optimize your prompts:
```env
DEFAULT_TIMEOUT=600  # 10 minutes
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.