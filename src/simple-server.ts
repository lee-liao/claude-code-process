import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { nanoid } from "nanoid";
import { join } from "path";
import { mkdir } from "fs/promises";
import { spawn, exec } from "child_process";
import { promisify } from "util";
import { writeFile, readFile } from "fs/promises";
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

// Task schema
interface TaskRequest {
  taskType: string;
  prompt?: string;
  model?: string;
  maxTurns?: number;
  allowedTools?: string;
  timeoutSeconds?: number;
  outputSchema?: any;
  metadata?: Record<string, any>;
}

interface TaskResponse {
  taskId: string;
  status: "pending" | "running" | "completed" | "failed" | "timeout";
  result?: any;
  error?: string;
  executionMetrics?: {
    durationMs: number;
    numTurns: number;
    totalCostUsd: number;
    permissionDenials: number;
  };
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  metadata?: Record<string, any>;
}

interface ApiError {
  error: string;
  code: string;
  details?: Record<string, any>;
}

const app = new Hono();

// Middleware
app.use("*", cors({
  origin: ["*"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
}));

app.use("*", logger());

// In-memory storage
const tasks = new Map<string, TaskResponse>();

// Health check
app.get("/health", async (c) => {
  // Check if Claude CLI is available
  try {
    const { stdout } = await execAsync("claude --version");
    const isHealthy = stdout.toLowerCase().includes("claude");

    return c.json({
      status: isHealthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      activeTasks: tasks.size,
      tempDir: "./temp",
      claudeVersion: stdout.trim(),
    }, isHealthy ? 200 : 503);
  } catch (error) {
    return c.json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      activeTasks: tasks.size,
      tempDir: "./temp",
      error: error instanceof Error ? error.message : String(error),
    }, 503);
  }
});

// Task templates
const templates = {
  "code-review": {
    id: "code-review",
    name: "Code Review",
    description: "Review code for quality, security, and best practices",
    allowedTools: "Read,Grep,Edit,Write,Bash",
    recommendedMaxTurns: 15,
  },
  "custom": {
    id: "custom",
    name: "Custom Task",
    description: "Custom task with your own prompt",
    allowedTools: "Read,Write,Edit,Grep,Bash,WebSearch",
    recommendedMaxTurns: 20,
  }
};

// List templates
app.get("/templates", (c) => {
  return c.json({
    templates: Object.values(templates),
  });
});

// Get specific template
app.get("/templates/:taskType", (c) => {
  const taskType = c.req.param("taskType");
  const template = templates[taskType as keyof typeof templates];

  if (!template) {
    return c.json<ApiError>({
      error: "Task template not found",
      code: "TEMPLATE_NOT_FOUND",
      details: { taskType },
    }, 404);
  }

  return c.json(template);
});

// Submit task
app.post("/tasks", async (c) => {
  try {
    const body = await c.req.json() as TaskRequest;
    const taskId = nanoid();
    const now = new Date().toISOString();

    // Create initial response
    const initialResponse: TaskResponse = {
      taskId,
      status: "pending",
      createdAt: now,
      metadata: body.metadata,
    };

    // Store task
    tasks.set(taskId, initialResponse);

    // Create temp directory
    await mkdir("./temp", { recursive: true });

    // Simulate task execution (in real implementation, this would call Claude)
    const mockExecution = async () => {
      // Mock execution for demonstration
      await new Promise(resolve => setTimeout(resolve, 2000));

      const completedTask: TaskResponse = {
        taskId,
        status: "completed",
        result: {
          type: "result",
          subtype: "completion",
          content: `Mock ${body.taskType} execution completed successfully`,
          num_turns: 3,
          duration_ms: 1500,
          total_cost_usd: 0.045,
          permission_denials: 0,
        },
        executionMetrics: {
          durationMs: 1500,
          numTurns: 3,
          totalCostUsd: 0.045,
          permissionDenials: 0,
        },
        createdAt: now,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        metadata: body.metadata,
      };

      tasks.set(taskId, completedTask);
    };

    // Start execution asynchronously
    mockExecution();

    return c.json(initialResponse, 202);
  } catch (error) {
    return c.json<ApiError>({
      error: "Invalid JSON or task creation failed",
      code: "TASK_CREATION_FAILED",
      details: { error: error instanceof Error ? error.message : String(error) },
    }, 400);
  }
});

// Get task status
app.get("/tasks/:taskId", (c) => {
  const taskId = c.req.param("taskId");

  if (!taskId) {
    return c.json<ApiError>({
      error: "Task ID parameter is required",
      code: "INVALID_PARAMETER",
    }, 400);
  }

  const task = tasks.get(taskId);
  if (!task) {
    return c.json<ApiError>({
      error: "Task not found",
      code: "TASK_NOT_FOUND",
      details: { taskId },
    }, 404);
  }

  return c.json(task);
});

// API documentation
app.get("/", (c) => {
  return c.json({
    name: "Claude Code Web API",
    version: "1.0.0",
    description: "Web API for Claude Code non-interactive execution",
    status: "✅ Simple server working (mock execution)",
    endpoints: {
      "GET /health": "Health check and server status",
      "GET /templates": "List all available task templates",
      "GET /templates/:taskType": "Get specific task template",
      "POST /tasks": "Submit a new task for execution (mock for demo)",
      "GET /tasks/:taskId": "Get task status and result",
    },
  });
});

// Error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json<ApiError>({
    error: "Internal server error",
    code: "INTERNAL_ERROR",
  }, 500);
});

// 404 handler
app.notFound((c) => {
  return c.json<ApiError>({
    error: "Endpoint not found",
    code: "NOT_FOUND",
    details: { path: c.req.path },
  }, 404);
});

// Start server
const port = parseInt(process.env.PORT || "3002");
const host = process.env.HOST || "0.0.0.0";

console.log(`🚀 Starting Simple Claude Code Web API`);
console.log(`📍 Server: http://${host}:${port}`);
console.log(`🔧 Claude CLI: claude`);
console.log(`📁 Temp Directory: ./temp`);
console.log(`🔧 Environment: Development`);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  serve({
    fetch: app.fetch,
    port,
    hostname: host,
  }, (info) => {
    console.log(`✅ Server listening on http://${info.address}:${info.port}`);
    console.log(`🧪 Try: curl http://localhost:${port}/health`);
    console.log(`📝 Submit task: curl -X POST http://localhost:${port}/tasks -H "Content-Type: application/json" -d '{"taskType":"code-review","prompt":"Test review"}'`);
    console.log(`📋 Get task: curl http://localhost:${port}/tasks/{taskId}`);
  });
}

export { app };