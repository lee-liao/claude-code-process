# Claude Code Web API Implementation

This document provides comprehensive documentation for implementing a Web API that enables non-interactive execution of Claude Code through HTTP requests.

## Overview

The Claude Code Web API transforms the command-line Claude Code interface into a RESTful API, allowing programmatic integration of Claude's capabilities into web applications, CI/CD pipelines, and automated workflows.

## Architecture

### Core Components

1. **Web Server** (`src/server.ts`)
   - Built with Hono framework (running on Node.js)
   - RESTful API endpoints with JSON responses
   - Built-in authentication, rate limiting, and error handling
   - Support for CORS and middleware extensions

2. **Task Executor** (`src/claude-executor.ts`)
   - Wraps Claude Code CLI execution
   - Uses standard input (stdin) for secure prompt delivery
   - Implements non-interactive execution
   - Handles JSON streaming output and structured responses
   - Cross-platform support (Windows/Linux/WSL)

3. **Task Templates** (`src/templates.ts`)
   - Predefined templates for common use cases
   - Standardized input/output schemas
   - Categories for organization and discovery
   - Examples and best practices included

4. **Type Definitions** (`src/types.ts`)
   - Comprehensive TypeScript schemas
   - Input validation with Zod
   - Response interfaces for API consistency
   - Configuration options and extensions

## Key Features

### Non-Interactive Execution

The API leverages Claude Code's existing non-interactive capabilities:

```bash
# Equivalent CLI command
claude -p - \
  --verbose \
  --output-format stream-json \
  --max-turns 10 \
  --allowedTools "Read,Write,Edit,Grep" \
  < /path/to/prompt.txt
```

### JSON Streaming Output

- Real-time streaming of Claude responses
- Machine-readable format for programmatic processing
- Structured output support with JSON schema validation
- Execution metrics tracking (duration, cost, turns, permissions)

### Task Templates

Predefined templates for common scenarios:

#### Code Review Template
```json
{
  "id": "code-review",
  "name": "Code Review",
  "description": "Review code for quality, security, and best practices",
  "defaultPrompt": "Please review the code in this repository...",
  "allowedTools": "Read,Grep,Edit,Write,Bash",
  "recommendedMaxTurns": 15,
  "outputSchema": {
    "type": "object",
    "properties": {
      "summary": { "type": "string" },
      "issues": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "severity": { "type": "string", "enum": ["low", "medium", "high", "critical"] },
            "category": { "type": "string" },
            "description": { "type": "string" },
            "location": { "type": "string" },
            "recommendation": { "type": "string" }
          }
        }
      },
      "overallScore": { "type": "number", "minimum": 1, "maximum": 10 }
    }
  }
}
```

## API Endpoints

### Core Endpoints

#### `GET /health`
Health check endpoint for monitoring and load balancers.

**Response:**
```json
{
  "status": "healthy|unhealthy",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "version": "1.0.0",
  "activeTasks": 2,
  "maxConcurrentTasks": 5,
  "tempDir": "/tmp/claude-api"
}
```

#### `POST /tasks`
Submit a new task for execution.

**Request Body:**
```json
{
  "taskType": "code-review|bug-fix|feature-implementation|documentation|custom",
  "prompt": "Optional custom prompt",
  "promptFile": "Optional path to prompt file",
  "model": "claude-3-5-sonnet-20241022",
  "maxTurns": 10,
  "allowedTools": "Read,Write,Edit,Grep,Bash",
  "disallowedTools": "WebSearch",
  "systemPrompt": "Optional system prompt override",
  "appendSystemPrompt": "Additional system prompt",
  "timeoutSeconds": 300,
  "outputSchema": {
    "type": "object",
    "properties": { ... }
  },
  "metadata": {
    "project": "my-app",
    "module": "authentication"
  }
}
```

**Response:**
```json
{
  "taskId": "abc123def456",
  "status": "pending",
  "createdAt": "2024-01-01T12:00:00.000Z",
  "metadata": { ... }
}
```

#### `GET /tasks/{taskId}`
Retrieve task status and results.

**Response:**
```json
{
  "taskId": "abc123def456",
  "status": "pending|running|completed|failed|timeout",
  "result": { ... }, // Claude's output when completed
  "error": "Error message if failed",
  "executionMetrics": {
    "durationMs": 15000,
    "numTurns": 8,
    "totalCostUsd": 0.045,
    "permissionDenials": 0
  },
  "createdAt": "2024-01-01T12:00:00.000Z",
  "startedAt": "2024-01-01T12:00:01.000Z",
  "completedAt": "2024-01-01T12:00:16.000Z",
  "metadata": { ... }
}
```

### Template Endpoints

#### `GET /templates`
List all available task templates.

**Query Parameters:**
- `category` (optional): Filter templates by category

**Response:**
```json
{
  "templates": [
    {
      "id": "code-review",
      "name": "Code Review",
      "description": "Review code for quality, security, and best practices",
      "category": "Development",
      "allowedTools": "Read,Grep,Edit,Write,Bash",
      "recommendedMaxTurns": 15,
      "examples": [ ... ]
    }
  ]
}
```

#### `GET /templates/{taskType}`
Get details for a specific task template.

#### `GET /templates?category=Development`
List templates filtered by category.

### Management Endpoints

#### `DELETE /tasks/{taskId}`
Cancel a running task.

#### `GET /stats`
Server statistics and system information.

#### `GET /`
API documentation and endpoint overview.

## Implementation Details

### Claude Code Integration

The Web API leverages the proven execution patterns from the GitHub Action:

```typescript
// Core execution pattern
const claudeArgs = [
  "-p", "-",  // Read from stdin
  "--allowedTools", request.allowedTools,
  "--max-turns", request.maxTurns.toString(),
  "--verbose",
  "--output-format", "stream-json"
];

if (request.model) {
  claudeArgs.push("--model", request.model);
}

if (request.outputSchema) {
  claudeArgs.push("--json-schema", JSON.stringify(request.outputSchema));
}

// Execute Claude with stdin for prompt delivery
const claudeProcess = spawn(claudeExecutable, claudeArgs, {
  stdio: ["pipe", "pipe", "pipe"], // Capture stdout and stderr
  env: { ...process.env, ANTHROPIC_API_KEY }
});

// Write prompt to stdin
if (claudeProcess.stdin) {
  claudeProcess.stdin.write(promptContent);
  claudeProcess.stdin.end();
}
```

### Security Model

#### Input Validation
- All inputs validated using Zod schemas
- Type safety with TypeScript strict mode
- SQL injection and XSS protection
- File path sanitization

#### Authentication
```typescript
// Optional API key authentication
if (config.enableAuth) {
  const apiKey = request.headers.get("Authorization")?.replace("Bearer ", "")
                || request.headers.get("X-API-Key");

  if (!apiKey || apiKey !== config.apiKey) {
    return new Response(JSON.stringify({
      error: "Unauthorized",
      code: "UNAUTHORIZED"
    }), { status: 401 });
  }
}
```

#### Rate Limiting
```typescript
// Per-client rate limiting
const clientLimit = rateLimitStore.get(clientIp);
if (clientLimit && clientLimit.count >= config.rateLimitPerMinute) {
  return new Response(JSON.stringify({
    error: "Rate limit exceeded",
    code: "RATE_LIMIT_EXCEEDED",
    details: {
      limit: config.rateLimitPerMinute,
      resetTime: new Date(clientLimit.resetTime).toISOString()
    }
  }), { status: 429 });
}
```

#### Output Sanitization
```typescript
// Filter sensitive information from outputs
function sanitizeJsonOutput(jsonObj: any, showFullOutput: boolean): string | null {
  if (showFullOutput) return JSON.stringify(jsonObj, null, 2);

  // Only show safe information in production
  if (jsonObj.type === "result") {
    return JSON.stringify({
      type: "result",
      subtype: jsonObj.subtype,
      duration_ms: jsonObj.duration_ms,
      num_turns: jsonObj.num_turns,
      total_cost_usd: jsonObj.total_cost_usd
    }, null, 2);
  }

  return null; // Suppress other message types
}
```

### Error Handling

#### Comprehensive Error Response
```typescript
interface ApiError {
  error: string;
  code: string;
  details?: Record<string, any>;
}

// Standardized error responses
return new Response(JSON.stringify({
  error: "Task not found",
  code: "TASK_NOT_FOUND",
  details: { taskId: requestedId }
}), { status: 404 });
```

#### Graceful Shutdown
```typescript
// Handle process signals for clean shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('All connections closed');
    process.exit(0);
  });
});
```

## Configuration

### Environment Variables

```env
# Server Configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

# Claude Code Integration
CLAUDE_EXECUTABLE_PATH=claude
DEFAULT_TIMEOUT=300
MAX_CONCURRENT_TASKS=5
TEMP_DIR=./temp

# Security
ENABLE_AUTH=true
API_KEY=your-secret-api-key
RATE_LIMIT_PER_MINUTE=60

# Claude API
ANTHROPIC_API_KEY=your-anthropic-api-key
```

### Server Configuration Interface
```typescript
interface ServerConfig {
  port: number;
  host: string;
  claudeExecutablePath?: string;
  defaultTimeout: number;
  maxConcurrentTasks: number;
  tempDir: string;
  enableAuth: boolean;
  apiKey?: string;
  rateLimitPerMinute: number;
}
```

## Usage Examples

### Code Review Request
```bash
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "taskType": "code-review",
    "prompt": "Review the authentication module in src/auth/ for security vulnerabilities and best practices",
    "maxTurns": 15,
    "allowedTools": "Read,Grep,Write",
    "outputSchema": {
      "type": "object",
      "properties": {
        "securityIssues": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "severity": { "type": "string", "enum": ["low", "medium", "high", "critical"] },
              "description": { "type": "string" },
              "location": { "type": "string" }
            }
          }
        },
        "recommendations": { "type": "array", "items": { "type": "string" } }
      }
    }
  }'
```

### Feature Implementation
```bash
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "taskType": "feature-implementation",
    "prompt": "Implement a user profile management system with CRUD operations",
    "model": "claude-3-5-sonnet-20241022",
    "maxTurns": 20,
    "systemPrompt": "You are a senior backend developer focused on security and scalability."
  }'
```

### Task Status Polling
```bash
# Submit task
TASK_RESPONSE=$(curl -s -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -d '{"taskType": "code-review", "prompt": "Review main.go"}')

TASK_ID=$(echo $TASK_RESPONSE | jq -r '.taskId')

# Poll for completion
while true; do
  STATUS=$(curl -s http://localhost:3000/tasks/$TASK_ID | jq -r '.status')
  echo "Status: $STATUS"

  if [[ "$STATUS" == "completed" || "$STATUS" == "failed" ]]; then
    curl -s http://localhost:3000/tasks/$TASK_ID | jq '.result'
    break
  fi

  sleep 2
done
```

### Programmatic Client
```typescript
import { ClaudeCodeAPIClient } from './src/example-client.js';

const client = new ClaudeCodeAPIClient(
  'http://localhost:3000',
  'your-api-key'
);

// Submit task
const task = await client.submitTask({
  taskType: 'code-review',
  prompt: 'Review the authentication module',
  maxTurns: 10
});

// Wait for completion
const result = await client.waitForTask(task.taskId, {
  onProgress: (status) => {
    console.log(`Status: ${status.status}`);
    if (status.executionMetrics) {
      console.log(`Duration: ${status.executionMetrics.durationMs}ms`);
    }
  }
});

console.log('Review completed:', result.result);
```

## Deployment

### Docker Deployment

```dockerfile
FROM node:20-slim

# Install system dependencies required for Claude Code and build tools
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install app dependencies
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Create temp directory for tasks
RUN mkdir -p temp && chmod 777 temp

# Expose the port
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  claude-api:
    build: .
    container_name: claude-web-api
    restart: unless-stopped
    ports:
      - "8520:3000"
    environment:
      - PORT=3000
      - HOST=0.0.0.0
      - NODE_ENV=production
      # Pass the Anthropic API key from the host environment
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      # Optional: Enable API authentication
      - ENABLE_AUTH=${ENABLE_AUTH:-false}
      - API_KEY=${API_KEY}
      # Optional: Configure Claude CLI path (default is 'claude' which works globally)
      - CLAUDE_EXECUTABLE_PATH=claude
    volumes:
      # Persist the temp directory to inspect task outputs
      - ./temp:/app/temp
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: claude-code-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: claude-code-api
  template:
    metadata:
      labels:
        app: claude-code-api
    spec:
      containers:
      - name: claude-api
        image: claude-code-api:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: claude-secrets
              key: anthropic-api-key
        - name: API_KEY
          valueFrom:
            secretKeyRef:
              name: claude-secrets
              key: api-key
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5

---
apiVersion: v1
kind: Service
metadata:
  name: claude-code-api-service
spec:
  selector:
    app: claude-code-api
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: LoadBalancer
```

## Monitoring and Observability

### Health Checks

The `/health` endpoint provides:
- Service status (healthy/unhealthy)
- Active task count
- System resource usage
- Version information

### Metrics

Key metrics to monitor:
- Request rate and response times
- Task success/failure rates
- API cost tracking
- Concurrent task utilization
- Rate limit hits
- Error rates by type

### Logging

Structured logging format:
```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "level": "info|warn|error",
  "message": "Task submitted",
  "taskId": "abc123def456",
  "taskType": "code-review",
  "clientIp": "192.168.1.100",
  "userAgent": "curl/7.68.0",
  "duration": 45
}
```

## Security Considerations

### Authentication

- **API Key Authentication**: Simple and effective for service-to-service communication
- **JWT Tokens**: For user-based authentication with expiration
- **OAuth 2.0**: For enterprise integration with SSO

### Input Validation

- **Schema Validation**: All inputs validated against Zod schemas
- **File Path Security**: Prevent directory traversal attacks
- **Command Injection**: Proper escaping and argument parsing
- **Size Limits**: Prevent excessively large prompts

### Output Security

- **Data Sanitization**: Remove sensitive information from responses
- **Permission Controls**: Restrict Claude's tool access
- **Audit Logging**: Log all requests and responses
- **Rate Limiting**: Prevent API abuse and cost overruns

### Network Security

- **HTTPS Only**: Enforce TLS in production
- **CORS Configuration**: Proper cross-origin resource sharing
- **Request Size Limits**: Prevent DoS attacks
- **Timeout Protection**: Prevent hanging connections

## Performance Optimization

### Caching

- **Template Caching**: Cache frequently used templates
- **Response Caching**: Cache template responses
- **Connection Pooling**: Reuse HTTP connections

### Scaling

- **Horizontal Scaling**: Multiple instances behind load balancer
- **Task Queue**: Use message queue for high-volume scenarios
- **Database Integration**: Persist task results and metrics

### Resource Management

- **Memory Limits**: Limit concurrent tasks based on available memory
- **CPU Limits**: Implement task scheduling based on CPU usage
- **Disk Cleanup**: Automatic cleanup of temporary files

## Troubleshooting

### Common Issues

#### Claude Code Not Found
```bash
# Verify installation
claude --version

# Update path if needed
export PATH=$PATH:/path/to/claude/bin
```

#### Permission Errors
```bash
# Fix temp directory permissions
mkdir -p ./temp
chmod 755 ./temp
chown $USER:$USER ./temp
```

#### API Key Issues
```bash
# Verify environment variables
echo $ANTHROPIC_API_KEY

# Test Claude CLI directly
claude --prompt "test"
```

#### Memory Issues
```bash
# Monitor memory usage
ps aux | grep claude

# Reduce concurrent tasks
export MAX_CONCURRENT_TASKS=2
```

### Debug Mode

Enable debug logging:
```env
NODE_ENV=development
ACTION_STEP_DEBUG=true
```

### Health Monitoring

```bash
# Basic health check
curl -f http://localhost:3000/health

# Detailed statistics
curl http://localhost:3000/stats
```

## Best Practices

### Task Design

1. **Specific Prompts**: Be clear and specific about requirements
2. **Tool Selection**: Only enable necessary tools for security
3. **Timeout Settings**: Set appropriate timeouts for task complexity
4. **Output Schema**: Define structured outputs for reliable parsing
5. **Error Handling**: Plan for and handle potential failures

### API Usage

1. **Retry Logic**: Implement exponential backoff for failed requests
2. **Rate Limiting**: Respect rate limits and implement backoff
3. **Authentication**: Secure API keys and use HTTPS
4. **Monitoring**: Monitor costs and task success rates
5. **Cleanup**: Clean up completed tasks and temporary files

### Production Deployment

1. **Load Balancing**: Use multiple instances for high availability
2. **Monitoring**: Set up comprehensive monitoring and alerting
3. **Backup**: Implement backup strategies for important data
4. **Security**: Regular security audits and updates
5. **Documentation**: Maintain up-to-date API documentation

## Future Enhancements

### Planned Features

1. **WebSocket Support**: Real-time task updates
2. **Batch Processing**: Submit multiple tasks in single request
3. **Task Templates UI**: Web interface for creating custom templates
4. **Integration Library**: Client libraries for popular languages
5. **Advanced Analytics**: Detailed usage analytics and cost tracking

### Extension Points

1. **Custom Middleware**: Add authentication, logging, or rate limiting
2. **Tool Plugins**: Extend Claude's tool capabilities
3. **Storage Backends**: Database integration for task persistence
4. **Notification Systems**: Webhooks for task completion
5. **Queue Systems**: Integration with message queues for scalability

This implementation provides a robust, production-ready foundation for integrating Claude Code capabilities into web applications and automated workflows.