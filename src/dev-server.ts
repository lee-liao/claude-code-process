import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { zValidator } from "@hono/zod-validator";
import { nanoid } from "nanoid";
import { join } from "path";
import { mkdir } from "fs/promises";
import { serve } from "@hono/node-server";

import { TaskRequestSchema, TaskRequest, TaskResponse, ApiError } from "./types.js";
import { ClaudeExecutor } from "./claude-executor.js";
import { getTaskTemplate, listTaskTemplates } from "./templates.js";

// Simple development server
const app = new Hono();

// Middleware
app.use("*", cors({
  origin: ["*"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
}));

app.use("*", logger());

// In-memory storage for tasks (development only)
const tasks = new Map<string, TaskResponse>();
const executor = new ClaudeExecutor("./temp");

// Health check
app.get("/health", async (c) => {
  const isHealthy = await executor.healthCheck();

  return c.json({
    status: isHealthy ? "healthy" : "unhealthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    activeTasks: tasks.size,
    tempDir: "./temp",
  }, isHealthy ? 200 : 503);
});

// List templates
app.get("/templates", (c) => {
  const templates = listTaskTemplates();
  return c.json({ templates });
});

// Get specific template
app.get("/templates/:taskType", (c) => {
  const taskType = c.req.param("taskType");
  if (!taskType) {
    return c.json<ApiError>({
      error: "Task type parameter is required",
      code: "INVALID_PARAMETER",
    }, 400);
  }
  const template = getTaskTemplate(taskType);

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
app.post("/tasks", zValidator("json", TaskRequestSchema), async (c) => {
  const taskRequest = c.req.valid("json") as TaskRequest;
  const taskId = nanoid();

  // Create initial response
  const initialResponse: TaskResponse = {
    taskId,
    status: "pending",
    createdAt: new Date().toISOString(),
    metadata: taskRequest.metadata,
  };

  // Store task
  tasks.set(taskId, initialResponse);

  // Execute task asynchronously
  executor.executeTask(taskRequest, taskId)
    .then(result => {
      // Update task with result
      const completedTask: TaskResponse = {
        ...result,
        taskId,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
      tasks.set(taskId, completedTask);
    })
    .catch(error => {
      // Update task with error
      const failedTask: TaskResponse = {
        taskId,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        createdAt: initialResponse.createdAt,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        metadata: taskRequest.metadata,
      };
      tasks.set(taskId, failedTask);
    });

  return c.json(initialResponse, 202);
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

// Cancel task
app.delete("/tasks/:taskId", (c) => {
  const taskId = c.req.param("taskId");
  if (!taskId) {
    return c.json<ApiError>({
      error: "Task ID parameter is required",
      code: "INVALID_PARAMETER",
    }, 400);
  }

  if (!tasks.has(taskId)) {
    return c.json<ApiError>({
      error: "Task not found",
      code: "TASK_NOT_FOUND",
      details: { taskId },
    }, 404);
  }

  // Remove task (simple cancellation for development)
  tasks.delete(taskId);

  return c.json({
    taskId,
    status: "cancelled",
    message: "Task cancellation requested",
  });
});

// Server stats
app.get("/stats", async (c) => {
  const isHealthy = await executor.healthCheck();

  return c.json({
    server: {
      version: "1.0.0",
      uptime: process.uptime(),
      healthy: isHealthy,
    },
    tasks: {
      running: Array.from(tasks.values()).filter(t => t.status === "pending" || t.status === "running").length,
      completed: Array.from(tasks.values()).filter(t => t.status === "completed").length,
      failed: Array.from(tasks.values()).filter(t => t.status === "failed").length,
      total: tasks.size,
    },
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      memory: process.memoryUsage(),
    },
  });
});

// API documentation
app.get("/", (c) => {
  return c.json({
    name: "Claude Code Web API",
    version: "1.0.0",
    description: "Web API for Claude Code non-interactive execution",
    endpoints: {
      "GET /health": "Health check and server status",
      "GET /templates": "List all available task templates",
      "GET /templates/:taskType": "Get specific task template",
      "POST /tasks": "Submit a new task for execution",
      "GET /tasks/:taskId": "Get task status and result",
      "DELETE /tasks/:taskId": "Cancel a running task",
      "GET /stats": "Server statistics and information",
    },
  });
});

// 404 handler
app.notFound((c) => {
  return c.json<ApiError>({
    error: "Endpoint not found",
    code: "NOT_FOUND",
    details: { path: c.req.path },
  }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);

  return c.json<ApiError>({
    error: "Internal server error",
    code: "INTERNAL_ERROR",
  }, 500);
});

// Start server
const port = parseInt(process.env.PORT || "3000");
const host = process.env.HOST || "0.0.0.0";

console.log(`🚀 Starting Claude Code Web API Development Server`);
console.log(`📍 Server: http://${host}:${port}`);
console.log(`🔧 Claude CLI: claude`);
console.log(`📁 Temp Directory: ./temp`);
console.log(`🔧 Environment: Development`);

// Start server with Node.js
const server = serve({
  fetch: app.fetch,
  port,
  hostname: host,
}, (info) => {
  console.log(`✅ Server listening on http://${info.address}:${info.port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});