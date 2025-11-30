import { z } from "zod";

// Task schema for API requests
export const TaskRequestSchema = z.object({
  taskType: z.enum(["code-review", "bug-fix", "feature-implementation", "documentation", "custom"]),
  prompt: z.string().optional(),
  promptFile: z.string().optional(),
  claudeArgs: z.string().optional(),
  model: z.string().optional(),
  maxTurns: z.number().default(10),
  allowedTools: z.string().default("Edit,Read,Bash,Write,Grep,WebSearch"),
  disallowedTools: z.string().optional(),
  systemPrompt: z.string().optional(),
  appendSystemPrompt: z.string().optional(),
  timeoutSeconds: z.number().default(300),
  outputSchema: z.record(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
});

export type TaskRequest = z.infer<typeof TaskRequestSchema>;

// Task response schema
export const TaskResponseSchema = z.object({
  taskId: z.string(),
  status: z.enum(["pending", "running", "completed", "failed", "timeout"]),
  result: z.any().optional(),
  error: z.string().optional(),
  executionMetrics: z.object({
    durationMs: z.number(),
    numTurns: z.number(),
    totalCostUsd: z.number(),
    permissionDenials: z.number(),
  }).optional(),
  createdAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export type TaskResponse = z.infer<typeof TaskResponseSchema>;

// Predefined task templates
export interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  defaultPrompt: string;
  allowedTools: string;
  outputSchema?: Record<string, any>;
  recommendedMaxTurns: number;
  examples: Array<{
    description: string;
    parameters: Record<string, any>;
  }>;
}

// API error response
export interface ApiError {
  error: string;
  code: string;
  details?: Record<string, any>;
}

// Task execution context
export interface TaskExecutionContext {
  taskId: string;
  request: TaskRequest;
  tempDir: string;
  promptPath: string;
  outputFile: string;
  startTime: number;
}

// Server configuration
export interface ServerConfig {
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