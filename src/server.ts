import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { nanoid } from "nanoid";
import { join } from "path";
import { mkdir } from "fs/promises";
import { fileURLToPath } from 'url';

import { TaskRequestSchema, TaskRequest, TaskResponse, ServerConfig, ApiError, TaskResponseSchema, ApiErrorSchema } from "./types.js";
import { ClaudeExecutor } from "./claude-executor.js";
import { getTaskTemplate, listTaskTemplates, listTaskTemplatesByCategory } from "./templates.js";

// Default configuration
const DEFAULT_CONFIG: ServerConfig = {
  port: parseInt(process.env.PORT || "3000"),
  host: process.env.HOST || "0.0.0.0",
  claudeExecutablePath: process.env.CLAUDE_EXECUTABLE_PATH,
  defaultTimeout: parseInt(process.env.DEFAULT_TIMEOUT || "300"),
  maxConcurrentTasks: parseInt(process.env.MAX_CONCURRENT_TASKS || "5"),
  tempDir: process.env.TEMP_DIR || join(process.cwd(), "temp"),
  enableAuth: process.env.ENABLE_AUTH === "true",
  apiKey: process.env.API_KEY,
  rateLimitPerMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE || "60"),
};

class ClaudeCodeWebAPI {
  private app: OpenAPIHono;
  private executor: ClaudeExecutor;
  private config: ServerConfig;
  private runningTasks: Map<string, Promise<TaskResponse>>;
  private rateLimitStore: Map<string, { count: number; resetTime: number }>;

  constructor(config: ServerConfig = DEFAULT_CONFIG) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.executor = new ClaudeExecutor(this.config.tempDir, this.config.claudeExecutablePath);
    this.runningTasks = new Map();
    this.rateLimitStore = new Map();

    this.app = new OpenAPIHono();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // CORS middleware
    this.app.use("*", cors({
      origin: ["*"],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "X-API-Key"],
    }));

    // Logger middleware
    this.app.use("*", logger());

    // Authentication middleware
    this.app.use("*", async (c, next) => {
      if (!this.config.enableAuth) {
        return next();
      }

      const apiKey = c.req.header("Authorization")?.replace("Bearer ", "") || c.req.header("X-API-Key");

      if (!apiKey || apiKey !== this.config.apiKey) {
        return c.json<ApiError>({
          error: "Unauthorized",
          code: "UNAUTHORIZED",
        }, 401);
      }

      return next();
    });

    // Rate limiting middleware
    this.app.use("*", async (c, next) => {
      const clientIp = c.req.header("X-Forwarded-For") || c.req.header("X-Real-IP") || "unknown";
      const now = Date.now();
      const windowMs = 60 * 1000; // 1 minute

      const clientLimit = this.rateLimitStore.get(clientIp);

      if (!clientLimit) {
        this.rateLimitStore.set(clientIp, {
          count: 1,
          resetTime: now + windowMs,
        });
        return next();
      }

      if (now > clientLimit.resetTime) {
        this.rateLimitStore.set(clientIp, {
          count: 1,
          resetTime: now + windowMs,
        });
        return next();
      }

      if (clientLimit.count >= this.config.rateLimitPerMinute) {
        return c.json<ApiError>({
          error: "Rate limit exceeded",
          code: "RATE_LIMIT_EXCEEDED",
          details: {
            limit: this.config.rateLimitPerMinute,
            windowSeconds: 60,
            resetTime: new Date(clientLimit.resetTime).toISOString(),
          },
        }, 429);
      }

      clientLimit.count++;
      return next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.openapi(createRoute({
      method: 'get',
      path: '/health',
      responses: {
        200: {
          description: 'Health status',
          content: {
            'application/json': {
              schema: z.object({
                status: z.string().openapi({ example: 'healthy' }),
                timestamp: z.string().datetime(),
                version: z.string(),
                activeTasks: z.number(),
                maxConcurrentTasks: z.number(),
                tempDir: z.string(),
              })
            }
          }
        },
        503: {
          description: 'Unhealthy service',
        }
      }
    }), async (c) => {
      const isHealthy = await this.executor.healthCheck();
      const activeTasks = this.runningTasks.size;

      return c.json({
        status: isHealthy ? "healthy" : "unhealthy",
        timestamp: new Date().toISOString(),
        version: "1.0.0",
        activeTasks,
        maxConcurrentTasks: this.config.maxConcurrentTasks,
        tempDir: this.config.tempDir,
      }, isHealthy ? 200 : 503);
    });

    // List available task templates
    this.app.openapi(createRoute({
      method: 'get',
      path: '/templates',
      request: {
        query: z.object({
          category: z.string().optional().openapi({ param: { name: 'category', in: 'query' } })
        })
      },
      responses: {
        200: {
          description: 'List of templates',
          content: {
            'application/json': {
              schema: z.object({
                templates: z.array(z.any()),
                category: z.string().optional()
              })
            }
          }
        }
      }
    }), (c) => {
      const { category } = c.req.valid('query');

      if (category) {
        const templatesByCategory = listTaskTemplatesByCategory();
        const categoryTemplates = templatesByCategory[category] || [];
        return c.json({
          category,
          templates: categoryTemplates,
        });
      }

      const templates = listTaskTemplates();
      return c.json({ templates });
    });

    // Get specific task template
    this.app.openapi(createRoute({
      method: 'get',
      path: '/templates/{taskType}',
      request: {
        params: z.object({
          taskType: z.string().openapi({ param: { name: 'taskType', in: 'path' } })
        })
      },
      responses: {
        200: {
          description: 'Task template found',
          content: {
            'application/json': {
              schema: z.any()
            }
          }
        },
        404: {
          description: 'Template not found',
          content: {
            'application/json': {
              schema: ApiErrorSchema
            }
          }
        }
      }
    }), (c) => {
      const { taskType } = c.req.valid('param');
      const template = getTaskTemplate(taskType);

      if (!template) {
        return c.json({
          error: "Task template not found",
          code: "TEMPLATE_NOT_FOUND",
          details: { taskType },
        }, 404) as any;
      }

      return c.json(template) as any;
    });

    // Submit a new task
    this.app.openapi(createRoute({
      method: 'post',
      path: '/tasks',
      request: {
        body: {
          content: {
            'application/json': {
              schema: TaskRequestSchema
            }
          }
        }
      },
      responses: {
        202: {
          description: 'Task accepted',
          content: {
            'application/json': {
              schema: TaskResponseSchema
            }
          }
        },
        429: {
          description: 'Too many requests',
          content: {
            'application/json': {
              schema: ApiErrorSchema
            }
          }
        }
      }
    }), async (c) => {
      const taskRequest = c.req.valid('json');

      // Check concurrent task limit
      if (this.runningTasks.size >= this.config.maxConcurrentTasks) {
        return c.json({
          error: "Maximum concurrent tasks reached",
          code: "CONCURRENT_LIMIT_REACHED",
          details: {
            current: this.runningTasks.size,
            max: this.config.maxConcurrentTasks,
          },
        }, 429);
      }

      // Create task ID and initial response
      const taskId = nanoid();
      const now = new Date().toISOString();

      const initialResponse: TaskResponse = {
        taskId,
        status: "pending",
        createdAt: now,
        metadata: taskRequest.metadata,
      };

      // Start task execution asynchronously
      const taskPromise = this.executeTaskAsync(taskId, taskRequest);
      this.runningTasks.set(taskId, taskPromise);

      // Clean up completed tasks
      taskPromise.finally(() => {
        this.runningTasks.delete(taskId);
      });

      return c.json(initialResponse, 202);
    });

    // Get task status and result
    this.app.openapi(createRoute({
      method: 'get',
      path: '/tasks/{taskId}',
      request: {
        params: z.object({
          taskId: z.string().openapi({ param: { name: 'taskId', in: 'path' } })
        })
      },
      responses: {
        200: {
          description: 'Task status',
          content: {
            'application/json': {
              schema: TaskResponseSchema
            }
          }
        },
        404: {
          description: 'Task not found',
          content: {
            'application/json': {
              schema: ApiErrorSchema
            }
          }
        },
        500: {
          description: 'Task execution failed',
          content: {
            'application/json': {
              schema: ApiErrorSchema
            }
          }
        }
      }
    }), async (c) => {
      const { taskId } = c.req.valid('param');
      const taskPromise = this.runningTasks.get(taskId);

      if (!taskPromise) {
        // Check if task exists on disk
        const persistedTask = await this.executor.getTaskResult(taskId);

        if (persistedTask) {
          return c.json(persistedTask) as any;
        }

        return c.json({
          error: "Task not found",
          code: "TASK_NOT_FOUND",
          details: { taskId },
        }, 404) as any;
      }

      try {
        const task = await taskPromise;
        return c.json(task) as any;
      } catch (error) {
        return c.json({
          error: "Task execution failed",
          code: "TASK_EXECUTION_FAILED",
          details: {
            taskId,
            error: error instanceof Error ? error.message : String(error),
          },
        }, 500) as any;
      }
    });

    // Cancel a running task
    this.app.openapi(createRoute({
      method: 'delete',
      path: '/tasks/{taskId}',
      request: {
        params: z.object({
          taskId: z.string().openapi({ param: { name: 'taskId', in: 'path' } })
        })
      },
      responses: {
        200: {
          description: 'Task cancelled',
          content: {
            'application/json': {
              schema: z.object({
                taskId: z.string(),
                status: z.string().openapi({ example: 'cancelled' }),
                message: z.string()
              })
            }
          }
        },
        404: {
          description: 'Task not found',
          content: {
            'application/json': {
              schema: ApiErrorSchema
            }
          }
        }
      }
    }), async (c) => {
      const { taskId } = c.req.valid('param');
      const taskPromise = this.runningTasks.get(taskId);

      if (!taskPromise) {
        return c.json({
          error: "Task not found",
          code: "TASK_NOT_FOUND",
          details: { taskId },
        }, 404) as any;
      }

      // Note: Actual cancellation would require more complex implementation
      // For now, we just remove it from the tracking map
      this.runningTasks.delete(taskId);

      return c.json({
        taskId,
        status: "cancelled",
        message: "Task cancellation requested",
      }) as any;
    });

    // Get server statistics
    this.app.openapi(createRoute({
      method: 'get',
      path: '/stats',
      responses: {
        200: {
          description: 'Server statistics',
          content: {
            'application/json': {
              schema: z.object({
                server: z.object({
                  version: z.string(),
                  uptime: z.number(),
                  healthy: z.boolean()
                }),
                tasks: z.object({
                  running: z.number(),
                  maxConcurrent: z.number(),
                  completedToday: z.number()
                }),
                system: z.object({
                  nodeVersion: z.string(),
                  platform: z.string(),
                  memory: z.any()
                })
              })
            }
          }
        }
      }
    }), async (c) => {
      const isHealthy = await this.executor.healthCheck();

      return c.json({
        server: {
          version: "1.0.0",
          uptime: process.uptime(),
          healthy: isHealthy,
        },
        tasks: {
          running: this.runningTasks.size,
          maxConcurrent: this.config.maxConcurrentTasks,
          completedToday: 0, // Would need persistent storage for this
        },
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          memory: process.memoryUsage(),
        },
      });
    });

    // API documentation
    // API documentation
    this.app.get('/doc', (c) => {
      return c.json(this.app.getOpenAPI31Document({
        openapi: '3.0.0',
        info: {
          version: '1.0.0',
          title: 'Claude Code Web API',
          description: 'Web API for Claude Code non-interactive execution',
        },
      }));
    });

    // Swagger UI
    this.app.get('/api-docs', swaggerUI({ url: '/doc' }));

    // Redirect root to UI
    this.app.get('/', (c) => c.redirect('/api-docs'));

    // Error handler
    this.app.onError((err, c) => {
      console.error("Unhandled error:", err);
      // @ts-ignore
      return c.json({
        error: "Internal server error",
        code: "INTERNAL_ERROR",
        details: { error: err.message },
      }, 500);
    });

    // 404 handler
    this.app.notFound((c) => {
      // @ts-ignore
      return c.json({
        error: "Endpoint not found",
        code: "NOT_FOUND",
        details: { path: c.req.path },
      }, 404);
    });
  }

  private async executeTaskAsync(taskId: string, taskRequest: TaskRequest): Promise<TaskResponse> {
    try {
      return await this.executor.executeTask(taskRequest, taskId);
    } catch (error) {
      console.error(`Task ${taskId} failed:`, error);
      const now = new Date().toISOString();
      return {
        taskId,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        createdAt: now, // This should ideally be passed from initial creation
        startedAt: now,
        completedAt: now,
        metadata: taskRequest.metadata,
      };
    }
  }

  async start(): Promise<void> {
    // Ensure temp directory exists
    await mkdir(this.config.tempDir, { recursive: true });

    // Health check before starting
    const isHealthy = await this.executor.healthCheck();
    if (!isHealthy) {
      console.error("Claude executor health check failed. Please ensure Claude Code is installed and accessible.");
      // We don't exit here to allow server to start even if Claude is not found (health check will report unhealthy)
      // process.exit(1);
    }

    const port = this.config.port;
    const host = this.config.host;

    console.log(`Starting Claude Code Web API on ${host}:${port}`);
    console.log(`Claude executable: ${this.config.claudeExecutablePath || "claude"}`);
    console.log(`Temp directory: ${this.config.tempDir}`);
    console.log(`Max concurrent tasks: ${this.config.maxConcurrentTasks}`);
    console.log(`Rate limit: ${this.config.rateLimitPerMinute} requests/minute`);
    console.log(`Authentication: ${this.config.enableAuth ? "enabled" : "disabled"}`);

    serve({
      fetch: this.app.fetch,
      port,
      hostname: host,
    }, (info) => {
      console.log(`✅ Server listening on http://${info.address}:${info.port}`);
    });
  }

  getApp(): OpenAPIHono {
    return this.app;
  }
}

// Start the server if this file is run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const api = new ClaudeCodeWebAPI();
  api.start().catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
}

export { ClaudeCodeWebAPI };