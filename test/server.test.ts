import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { ClaudeCodeWebAPI } from "../src/server.js";
import { ClaudeExecutor } from "../src/claude-executor.js";

// Mock ClaudeExecutor for testing
class MockClaudeExecutor extends ClaudeExecutor {
  private shouldFail = false;
  private delay = 100;

  constructor(tempDir: string) {
    super(tempDir, "mock-claude");
  }

  setShouldFail(shouldFail: boolean) {
    this.shouldFail = shouldFail;
  }

  setDelay(delay: number) {
    this.delay = delay;
  }

  async executeTask(request: any) {
    if (this.shouldFail) {
      throw new Error("Mock execution failed");
    }

    // Simulate execution delay
    await new Promise(resolve => setTimeout(resolve, this.delay));

    return {
      taskId: "mock-task-id",
      status: "completed",
      result: {
        type: "result",
        subtype: "completion",
        content: `Mock result for ${request.taskType}`,
        num_turns: 5,
        duration_ms: this.delay,
        total_cost_usd: 0.001,
        permission_denials: 0,
      },
      executionMetrics: {
        durationMs: this.delay,
        numTurns: 5,
        totalCostUsd: 0.001,
        permissionDenials: 0,
      },
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
  }

  async healthCheck(): Promise<boolean> {
    return !this.shouldFail;
  }
}

describe("ClaudeCodeWebAPI", () => {
  let api: ClaudeCodeWebAPI;
  let mockExecutor: MockClaudeExecutor;

  beforeEach(() => {
    const config = {
      port: 0, // Use random available port
      host: "localhost",
      enableAuth: false,
      tempDir: "/tmp/test-claude-api",
      maxConcurrentTasks: 2,
      rateLimitPerMinute: 100,
    };

    api = new ClaudeCodeWebAPI(config);

    // Replace the executor with our mock
    mockExecutor = new MockClaudeExecutor(config.tempDir);
    (api as any).executor = mockExecutor;
  });

  it("should initialize with correct configuration", () => {
    const app = api.getApp();
    expect(app).toBeDefined();
  });

  it("should pass health check", async () => {
    const response = await api.getApp().request("/health");
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("healthy");
    expect(body.activeTasks).toBe(0);
  });

  it("should return list of templates", async () => {
    const response = await api.getApp().request("/templates");
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.templates).toBeDefined();
    expect(Array.isArray(body.templates)).toBe(true);
    expect(body.templates.length).toBeGreaterThan(0);
  });

  it("should return specific template", async () => {
    const response = await api.getApp().request("/templates/code-review");
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.id).toBe("code-review");
    expect(body.name).toBe("Code Review");
    expect(body.allowedTools).toBeDefined();
  });

  it("should return 404 for non-existent template", async () => {
    const response = await api.getApp().request("/templates/non-existent");
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error).toBe("Task template not found");
  });

  it("should submit a task successfully", async () => {
    const taskRequest = {
      taskType: "code-review",
      prompt: "Review this code",
      maxTurns: 10,
    };

    const response = await api.getApp().request("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(taskRequest),
    });

    expect(response.status).toBe(202);

    const body = await response.json();
    expect(body.taskId).toBeDefined();
    expect(body.status).toBe("pending");
    expect(body.createdAt).toBeDefined();
  });

  it("should validate task request", async () => {
    const invalidRequest = {
      // Missing required taskType
      prompt: "Review this code",
    };

    const response = await api.getApp().request("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invalidRequest),
    });

    expect(response.status).toBe(400);
  });

  it("should handle concurrent task limit", async () => {
    const taskRequest = {
      taskType: "custom",
      prompt: "Test task",
    };

    // Submit tasks up to the limit
    const responses = [];
    for (let i = 0; i < 3; i++) { // Exceeds maxConcurrentTasks of 2
      const response = await api.getApp().request("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(taskRequest),
      });
      responses.push(response);
    }

    // First two should succeed
    expect(responses[0].status).toBe(202);
    expect(responses[1].status).toBe(202);

    // Third should fail due to concurrent limit
    expect(responses[2].status).toBe(429);
    const body = await responses[2].json();
    expect(body.code).toBe("CONCURRENT_LIMIT_REACHED");
  });

  it("should return server stats", async () => {
    const response = await api.getApp().request("/stats");
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.server).toBeDefined();
    expect(body.tasks).toBeDefined();
    expect(body.system).toBeDefined();
    expect(body.server.version).toBe("1.0.0");
  });

  it("should handle authentication when enabled", async () => {
    // Create API with authentication enabled
    const authConfig = {
      port: 0,
      enableAuth: true,
      apiKey: "test-api-key",
      tempDir: "/tmp/test-claude-api-auth",
      maxConcurrentTasks: 1,
      rateLimitPerMinute: 100,
    };

    const authApi = new ClaudeCodeWebAPI(authConfig);

    // Request without auth should fail
    const response = await authApi.getApp().request("/health");
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.code).toBe("UNAUTHORIZED");

    // Request with correct auth should succeed
    const authResponse = await authApi.getApp().request("/health", {
      headers: { "Authorization": "Bearer test-api-key" },
    });
    expect(authResponse.status).toBe(200);
  });

  it("should handle task execution failure", async () => {
    mockExecutor.setShouldFail(true);

    const taskRequest = {
      taskType: "custom",
      prompt: "Test task that will fail",
    };

    const submitResponse = await api.getApp().request("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(taskRequest),
    });

    expect(submitResponse.status).toBe(202);
    const submitBody = await submitResponse.json();
    const taskId = submitBody.taskId;

    // Wait a moment for execution
    await new Promise(resolve => setTimeout(resolve, 200));

    // Check task status
    const statusResponse = await api.getApp().request(`/tasks/${taskId}`);
    expect(statusResponse.status).toBe(200);

    const statusBody = await statusResponse.json();
    expect(statusBody.status).toBe("failed");
    expect(statusBody.error).toBe("Mock execution failed");
  });

  it("should rate limit requests", async () => {
    // Create API with low rate limit for testing
    const rateLimitConfig = {
      port: 0,
      enableAuth: false,
      tempDir: "/tmp/test-claude-api-rate-limit",
      maxConcurrentTasks: 1,
      rateLimitPerMinute: 1, // Very low limit
    };

    const rateLimitApi = new ClaudeCodeWebAPI(rateLimitConfig);

    // First request should succeed
    const response1 = await rateLimitApi.getApp().request("/health");
    expect(response1.status).toBe(200);

    // Second request should be rate limited
    const response2 = await rateLimitApi.getApp().request("/health");
    expect(response2.status).toBe(429);

    const body = await response2.json();
    expect(body.code).toBe("RATE_LIMIT_EXCEEDED");
  });

  it("should handle malformed JSON", async () => {
    const response = await api.getApp().request("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "invalid json {",
    });

    expect(response.status).toBe(400);
  });

  it("should return API documentation", async () => {
    const response = await api.getApp().request("/");
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.name).toBe("Claude Code Web API");
    expect(body.version).toBe("1.0.0");
    expect(body.endpoints).toBeDefined();
  });

  it("should handle 404 for unknown endpoints", async () => {
    const response = await api.getApp().request("/unknown-endpoint");
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.code).toBe("NOT_FOUND");
  });

  it("should support cancellation of tasks", async () => {
    mockExecutor.setDelay(5000); // Long delay

    const taskRequest = {
      taskType: "custom",
      prompt: "Long running task",
    };

    const submitResponse = await api.getApp().request("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(taskRequest),
    });

    expect(submitResponse.status).toBe(202);
    const submitBody = await submitResponse.json();
    const taskId = submitBody.taskId;

    // Cancel the task
    const cancelResponse = await api.getApp().request(`/tasks/${taskId}`, {
      method: "DELETE",
    });

    expect(cancelResponse.status).toBe(200);

    const cancelBody = await cancelResponse.json();
    expect(cancelBody.status).toBe("cancelled");
  });
});