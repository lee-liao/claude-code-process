import { spawn, exec } from "child_process";
import { promisify } from "util";
import {
  writeFile,
  readFile,
  mkdir,
  stat
} from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { parse as parseShellArgs } from "shell-quote";
import { nanoid } from "nanoid";
import { TaskRequest, TaskExecutionContext, TaskResponse } from "./types.js";
import { GitHubService } from "./github-service.js";

const execAsync = promisify(exec);

export class ClaudeExecutor {
  private tempDir: string;
  private claudeExecutablePath: string;
  private githubService: GitHubService;

  constructor(tempDir: string, claudeExecutablePath?: string) {
    this.tempDir = tempDir;
    this.claudeExecutablePath = claudeExecutablePath || "claude";
    this.githubService = new GitHubService();

    // On Windows, if the command is just "claude", append ".cmd"
    if (process.platform === "win32" && this.claudeExecutablePath === "claude") {
      this.claudeExecutablePath = "claude.cmd";
    }
  }

  async executeTask(request: TaskRequest, existingTaskId?: string): Promise<TaskResponse> {
    const taskId = existingTaskId || nanoid();
    const startTime = Date.now();

    try {
      // Create execution context
      const context = await this.createExecutionContext(taskId, request);

      // Prepare the prompt file
      await this.preparePrompt(context, request);

      // Execute Claude
      const result = await this.executeClaude(context, request);

      // Clean up
      await this.cleanup(context);

      const completionTime = Date.now();

      return {
        taskId,
        status: "completed",
        result,
        executionMetrics: {
          durationMs: completionTime - startTime,
          numTurns: result.num_turns || 0,
          totalCostUsd: result.total_cost_usd || 0,
          permissionDenials: result.permission_denials || 0,
        },
        createdAt: new Date(startTime).toISOString(),
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date(completionTime).toISOString(),
        metadata: request.metadata,
      };
    } catch (error) {
      const completionTime = Date.now();

      return {
        taskId,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        createdAt: new Date(startTime).toISOString(),
        startedAt: new Date(startTime).toISOString(),
        completedAt: new Date(completionTime).toISOString(),
        metadata: request.metadata,
      };
    }
  }

  private async createExecutionContext(
    taskId: string,
    request: TaskRequest
  ): Promise<TaskExecutionContext> {
    const taskDir = join(this.tempDir, taskId);
    await mkdir(taskDir, { recursive: true });

    // Resolve defaults from template if not provided
    if (!request.allowedTools || !request.maxTurns) {
      const { getTaskTemplate } = await import("./templates.js");
      const template = getTaskTemplate(request.taskType);

      if (!request.allowedTools) {
        if (template && template.allowedTools) {
          request.allowedTools = template.allowedTools;
        } else {
          // Fallback default
          request.allowedTools = "Edit,Read,Bash,Write,Grep,WebSearch";
        }
      }

      if (!request.maxTurns) {
        if (template && template.recommendedMaxTurns) {
          request.maxTurns = template.recommendedMaxTurns;
        } else {
          // Fallback default
          request.maxTurns = 30;
        }
      }
    }

    // Save request for persistence
    await writeFile(join(taskDir, "request.json"), JSON.stringify(request, null, 2), "utf-8");

    let workingDir: string | undefined;

    // Handle Repo Logic
    if (request.repoUrl) {
      let branchName = `hotfix-${taskId}`;
      const baseBranch = "main"; // Default base branch

      try {
        // Try to create a hotfix branch
        await this.githubService.createBranch(request.repoUrl, baseBranch, branchName);
      } catch (error) {
        console.warn(`Failed to create branch '${branchName}'. Falling back to '${baseBranch}'. Error:`, error);
        branchName = baseBranch;
      }

      try {
        const repoDir = join(taskDir, "repo");
        await this.githubService.downloadRepo(request.repoUrl, branchName, repoDir);
        workingDir = repoDir;
      } catch (error) {
        console.error("Failed to download repo:", error);
        throw new Error(`Failed to setup repository: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      taskId,
      request,
      tempDir: taskDir,
      promptPath: join(taskDir, "prompt.txt"),
      outputFile: join(taskDir, "output.json"),
      workingDir,
      startTime: Date.now(),
    };
  }

  private async preparePrompt(
    context: TaskExecutionContext,
    request: TaskRequest
  ): Promise<void> {
    let promptContent = request.prompt || "";

    // Use template if no custom prompt provided
    if (!promptContent && !request.promptFile) {
      const { getTaskTemplate } = await import("./templates.js");
      const template = getTaskTemplate(request.taskType);
      if (template) {
        promptContent = template.defaultPrompt;
      } else {
        throw new Error(`No prompt provided and no template found for task type: ${request.taskType}`);
      }
    }

    // Handle prompt file
    if (request.promptFile) {
      if (!existsSync(request.promptFile)) {
        throw new Error(`Prompt file '${request.promptFile}' does not exist`);
      }

      const fileStats = await stat(request.promptFile);
      if (fileStats.size === 0) {
        throw new Error("Prompt file is empty");
      }

      // Copy file content to our prompt file
      const fileContent = await readFile(request.promptFile, "utf-8");
      promptContent = fileContent;
    }

    if (!promptContent || promptContent.trim().length === 0) {
      throw new Error("Prompt is empty. Please provide a non-empty prompt.");
    }

    // Write prompt to file
    await writeFile(context.promptPath, promptContent, "utf-8");
  }

  private async executeClaude(
    context: TaskExecutionContext,
    request: TaskRequest
  ): Promise<any> {
    // Read prompt content
    const promptContent = await readFile(context.promptPath, "utf-8");

    // Build Claude arguments
    const claudeArgs = this.buildClaudeArgs(context, request);

    // Prepare environment
    const env = {
      ...process.env,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    };

    console.log(`Executing Claude command: ${this.claudeExecutablePath} ${claudeArgs.join(" ")}`);
    console.log(`Working Directory: ${context.workingDir || "default"}`);

    // Spawn Claude process
    const isWindows = process.platform === "win32";
    const claudeProcess = spawn(this.claudeExecutablePath, claudeArgs, {
      stdio: ["pipe", "pipe", "pipe"],
      env,
      cwd: context.workingDir, // Use repo dir if available
      shell: isWindows, // Only use shell on Windows
    });

    // Write prompt to stdin
    if (claudeProcess.stdin) {
      claudeProcess.stdin.write(promptContent);
      claudeProcess.stdin.end();
    }

    // Set up timeout
    const timeoutMs = request.timeoutSeconds * 1000;
    let timeoutHandle: NodeJS.Timeout;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        claudeProcess.kill("SIGTERM");
        reject(new Error(`Claude execution timed out after ${request.timeoutSeconds} seconds`));
      }, timeoutMs);
    });

    // Capture output and error
    let output = "";
    let errorOutput = "";

    if (claudeProcess.stdout) {
      claudeProcess.stdout.on("data", (data) => {
        output += data.toString();
      });
    }

    if (claudeProcess.stderr) {
      claudeProcess.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });
    }

    // Wait for completion
    const exitCode = await Promise.race([
      new Promise<number>((resolve) => {
        claudeProcess.on("close", (code) => {
          clearTimeout(timeoutHandle);
          resolve(code || 0);
        });

        claudeProcess.on("error", (error) => {
          clearTimeout(timeoutHandle);
          console.error("Claude process error:", error);
          resolve(1);
        });
      }),
      timeoutPromise,
    ]);

    if (exitCode !== 0) {
      const errorMessage = errorOutput || `Claude process exited with code ${exitCode}`;
      throw new Error(`Claude execution failed: ${errorMessage}`);
    }

    // Process output and extract result
    return await this.processOutput(output, context);
  }

  private buildClaudeArgs(
    context: TaskExecutionContext,
    request: TaskRequest
  ): string[] {
    // Use -p - to read prompt from stdin
    const args = ["-p", "-"];

    // Add user-specified arguments
    if (request.allowedTools) {
      args.push("--allowedTools", request.allowedTools);
    }

    if (request.disallowedTools) {
      args.push("--disallowedTools", request.disallowedTools);
    }

    if (request.maxTurns) {
      args.push("--max-turns", request.maxTurns.toString());
    }

    if (request.model) {
      args.push("--model", request.model);
    }

    if (request.systemPrompt) {
      args.push("--system-prompt", request.systemPrompt);
    }

    if (request.appendSystemPrompt) {
      args.push("--append-system-prompt", request.appendSystemPrompt);
    }

    if (request.outputSchema) {
      args.push("--json-schema", JSON.stringify(request.outputSchema));
    }

    // Add any additional claude args (parse them properly)
    if (request.claudeArgs) {
      const parsedArgs = parseShellArgs(request.claudeArgs);
      const stringArgs = parsedArgs.filter((arg): arg is string => typeof arg === "string");
      args.push(...stringArgs);
    }

    // Always add verbose and JSON streaming output
    args.push("--verbose", "--output-format", "stream-json");

    // Automatically bypass permissions for non-interactive execution
    args.push("--dangerously-skip-permissions");

    return args;
  }

  private async processOutput(output: string, context: TaskExecutionContext): Promise<any> {
    // Save raw output
    await writeFile(context.outputFile, output, "utf-8");

    // Parse line by line
    const lines = output.trim().split("\n");
    const messages: any[] = [];

    for (const line of lines) {
      if (line.trim()) {
        try {
          const parsed = JSON.parse(line);
          messages.push(parsed);
        } catch {
          // Skip non-JSON lines
        }
      }
    }

    const result = messages.findLast((m) => m.type === "result");

    if (!result) {
      // If no result found, check if there was an error message in the output
      if (output.includes("Error:")) {
        throw new Error(`Claude execution error: ${output}`);
      }
      throw new Error("No result message found in Claude output");
    }

    return result;
  }

  private async cleanup(context: TaskExecutionContext): Promise<void> {
    // Clean up temporary files if needed
    // We keep the output file for debugging purposes
    console.log(`Task ${context.taskId} completed. Output saved to ${context.outputFile}`);
  }

  async getTaskResult(taskId: string): Promise<TaskResponse | null> {
    const taskDir = join(this.tempDir, taskId);
    const requestPath = join(taskDir, "request.json");
    const outputPath = join(taskDir, "output.json");

    // Check if task directory exists
    try {
      await stat(taskDir);
    } catch {
      return null;
    }

    // Try to read request metadata
    let request: TaskRequest | undefined;
    try {
      const requestContent = await readFile(requestPath, "utf-8");
      request = JSON.parse(requestContent);
    } catch {
      // If request file is missing, we can't reconstruct full metadata
    }

    // Check for output file
    try {
      const outputContent = await readFile(outputPath, "utf-8");

      // Parse output
      const lines = outputContent.trim().split("\n");
      const messages: any[] = [];

      for (const line of lines) {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line);
            messages.push(parsed);
          } catch {
            // Skip non-JSON lines
          }
        }
      }

      // Find the result message - it has type="result"
      const result = messages.findLast((m) => m.type === "result");

      // Get file stats for timing
      const stats = await stat(outputPath);

      if (result) {
        return {
          taskId,
          status: "completed",
          // The result field in the JSON contains the actual output text/data
          result: result.result,
          executionMetrics: {
            durationMs: result.duration_ms || 0,
            numTurns: result.num_turns || 0,
            totalCostUsd: result.total_cost_usd || 0,
            permissionDenials: (result.permission_denials || []).length,
          },
          createdAt: stats.birthtime.toISOString(),
          startedAt: stats.birthtime.toISOString(),
          completedAt: stats.mtime.toISOString(),
          metadata: request?.metadata,
        };
      } else {
        return {
          taskId,
          status: "failed",
          error: "Task completed but no result found in output",
          createdAt: stats.birthtime.toISOString(),
          metadata: request?.metadata,
        };
      }

    } catch (error) {
      // If output file missing or read failed
      return {
        taskId,
        status: "failed",
        error: "Task output not found",
        createdAt: new Date().toISOString(),
        metadata: request?.metadata,
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const { stdout } = await execAsync(`${this.claudeExecutablePath} --version`);
      return stdout.toLowerCase().includes("claude");
    } catch {
      return false;
    }
  }
}