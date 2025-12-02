import { TaskTemplate } from "./types.js";

export const TASK_TEMPLATES: Record<string, TaskTemplate> = {
  "code-review": {
    id: "code-review",
    name: "Code Review",
    description: "Review code for quality, security, and best practices",
    category: "Development",
    defaultPrompt: "Please review the code in this repository. Focus on:\n1. Code quality and maintainability\n2. Security vulnerabilities\n3. Performance issues\n4. Adherence to best practices\n5. Testing coverage\n\nProvide specific recommendations and prioritized action items.",
    allowedTools: "Read,Grep,Edit,Write,Bash",
    outputSchema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        issues: {
          type: "array",
          items: {
            type: "object",
            properties: {
              severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
              category: { type: "string" },
              description: { type: "string" },
              location: { type: "string" },
              recommendation: { type: "string" }
            }
          }
        },
        recommendations: {
          type: "array",
          items: { type: "string" }
        },
        overallScore: { type: "number", minimum: 1, maximum: 10 }
      },
      required: ["summary", "issues"]
    },
    recommendedMaxTurns: 15,
    examples: [
      {
        description: "Review entire codebase",
        parameters: {
          maxTurns: 20,
          allowedTools: "Read,Grep,Edit,Write,Bash,Glob"
        }
      },
      {
        description: "Review specific file",
        parameters: {
          prompt: "Please review the src/components/Button.tsx file for React best practices and accessibility compliance."
        }
      }
    ]
  },

  "bug-fix": {
    id: "bug-fix",
    name: "Bug Fix",
    description: "Identify and fix bugs in the codebase",
    category: "Development",
    defaultPrompt: "Please help fix the reported bug. Follow this process:\n1. Analyze the bug report and reproduce the issue\n2. Identify the root cause\n3. Implement a minimal fix\n4. Add tests to prevent regression\n5. Verify the fix works\n\nExplain your approach and provide the fix.",
    allowedTools: "Read,Grep,Edit,Write,Bash",
    outputSchema: {
      type: "object",
      properties: {
        bugAnalysis: { type: "string" },
        rootCause: { type: "string" },
        fixDescription: { type: "string" },
        filesChanged: {
          type: "array",
          items: { type: "string" }
        },
        testsAdded: {
          type: "array",
          items: { type: "string" }
        },
        verificationSteps: {
          type: "array",
          items: { type: "string" }
        }
      },
      required: ["bugAnalysis", "rootCause", "fixDescription"]
    },
    recommendedMaxTurns: 12,
    examples: [
      {
        description: "Fix crash in user authentication",
        parameters: {
          prompt: "The application crashes when users try to login with invalid credentials. Error occurs in src/auth/login.ts at line 45."
        }
      }
    ]
  },

  "feature-implementation": {
    id: "feature-implementation",
    name: "Feature Implementation",
    description: "Implement new features according to specifications",
    category: "Development",
    defaultPrompt: "Please implement the requested feature following these guidelines:\n1. Follow the existing codebase patterns and conventions\n2. Write clean, maintainable code with proper error handling\n3. Include appropriate tests\n4. Update documentation as needed\n5. Consider edge cases and performance\n\nImplement the feature step by step and explain your decisions.",
    allowedTools: "Read,Grep,Edit,Write,Bash,Glob,WebSearch",
    outputSchema: {
      type: "object",
      properties: {
        implementation: { type: "string" },
        filesCreated: {
          type: "array",
          items: { type: "string" }
        },
        filesModified: {
          type: "array",
          items: { type: "string" }
        },
        testsAdded: {
          type: "array",
          items: { type: "string" }
        },
        documentation: { type: "string" },
        usage: { type: "string" }
      },
      required: ["implementation", "filesCreated", "filesModified"]
    },
    recommendedMaxTurns: 20,
    examples: [
      {
        description: "Add user profile feature",
        parameters: {
          prompt: "Implement a user profile feature where users can:\n- View their profile information\n- Edit their name, email, and bio\n- Upload a profile picture\n- See their account activity",
          maxTurns: 25
        }
      }
    ]
  },

  "documentation": {
    id: "documentation",
    name: "Documentation Generation",
    description: "Generate or update documentation for the codebase",
    category: "Documentation",
    defaultPrompt: "Please generate comprehensive documentation for this codebase. Include:\n1. Overview and architecture\n2. API documentation\n3. Setup and installation instructions\n4. Usage examples\n5. Contributing guidelines\n\nMake the documentation clear, accurate, and well-structured.",
    allowedTools: "Read,Grep,Write,Edit,Glob,WebSearch",
    outputSchema: {
      type: "object",
      properties: {
        overview: { type: "string" },
        apiDocumentation: { type: "string" },
        setupInstructions: { type: "string" },
        usageExamples: { type: "string" },
        contributingGuide: { type: "string" },
        filesGenerated: {
          type: "array",
          items: { type: "string" }
        }
      },
      required: ["overview", "apiDocumentation", "setupInstructions"]
    },
    recommendedMaxTurns: 10,
    examples: [
      {
        description: "Generate API docs",
        parameters: {
          prompt: "Generate API documentation for the REST endpoints in src/api/, including request/response schemas and authentication requirements."
        }
      }
    ]
  },

  "performance-analysis": {
    id: "performance-analysis",
    name: "Performance Analysis",
    description: "Analyze and optimize code performance",
    category: "Development",
    defaultPrompt: "Please analyze the codebase for performance issues and provide optimization recommendations. Focus on:\n1. Database query efficiency\n2. Algorithmic complexity\n3. Memory usage\n4. Network requests\n5. Rendering performance (if applicable)\n\nProvide specific, actionable optimization suggestions.",
    allowedTools: "Read,Grep,Edit,Write,Bash,WebSearch",
    outputSchema: {
      type: "object",
      properties: {
        performanceIssues: {
          type: "array",
          items: {
            type: "object",
            properties: {
              severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
              category: { type: "string" },
              description: { type: "string" },
              impact: { type: "string" },
              recommendation: { type: "string" },
              estimatedImprovement: { type: "string" }
            }
          }
        },
        optimizations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string" },
              description: { type: "string" },
              implementation: { type: "string" },
              priority: { type: "number", minimum: 1, maximum: 5 }
            }
          }
        },
        benchmarks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              metric: { type: "string" },
              currentValue: { type: "string" },
              targetValue: { type: "string" },
              test: { type: "string" }
            }
          }
        }
      },
      required: ["performanceIssues", "optimizations"]
    },
    recommendedMaxTurns: 15,
    examples: [
      {
        description: "Database performance audit",
        parameters: {
          prompt: "Focus specifically on database performance. Analyze SQL queries, indexing, and connection pooling."
        }
      }
    ]
  },

  "security-audit": {
    id: "security-audit",
    name: "Security Audit",
    description: "Perform security analysis and identify vulnerabilities",
    category: "Security",
    defaultPrompt: "Please perform a comprehensive security audit of this codebase. Check for:\n1. OWASP Top 10 vulnerabilities\n2. Authentication and authorization issues\n3. Input validation and sanitization\n4. Sensitive data exposure\n5. Dependency vulnerabilities\n6. Configuration security\n\nProvide detailed findings and remediation steps.",
    allowedTools: "Read,Grep,Edit,Write,Bash,WebSearch",
    outputSchema: {
      type: "object",
      properties: {
        securityScore: { type: "number", minimum: 1, maximum: 10 },
        vulnerabilities: {
          type: "array",
          items: {
            type: "object",
            properties: {
              severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
              category: { type: "string" },
              cwe: { type: "string" },
              description: { type: "string" },
              location: { type: "string" },
              impact: { type: "string" },
              remediation: { type: "string" },
              cvssScore: { type: "number" }
            }
          }
        },
        recommendations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              priority: { type: "number", minimum: 1, maximum: 5 },
              action: { type: "string" },
              description: { type: "string" }
            }
          }
        },
        complianceStatus: {
          type: "object",
          properties: {
            standard: { type: "string" },
            compliant: { type: "boolean" },
            gaps: { type: "array", items: { type: "string" } }
          }
        }
      },
      required: ["securityScore", "vulnerabilities", "recommendations"]
    },
    recommendedMaxTurns: 18,
    examples: [
      {
        description: "Quick security scan",
        parameters: {
          prompt: "Focus on critical and high-severity vulnerabilities only. Provide a high-level security assessment.",
          maxTurns: 8
        }
      }
    ]
  },

  "custom": {
    id: "custom",
    name: "Custom Task",
    description: "Custom task with your own prompt and configuration",
    category: "General",
    defaultPrompt: "",
    allowedTools: "Read,Grep,Edit,Write,Bash,WebSearch",
    recommendedMaxTurns: 20,
    examples: []
  }
};

export function getTaskTemplate(taskType: string): TaskTemplate | null {
  return TASK_TEMPLATES[taskType] || null;
}

export function listTaskTemplates(): TaskTemplate[] {
  return Object.values(TASK_TEMPLATES);
}

export function listTaskTemplatesByCategory(): Record<string, TaskTemplate[]> {
  const byCategory: Record<string, TaskTemplate[]> = {};

  for (const template of Object.values(TASK_TEMPLATES)) {
    if (!byCategory[template.category]) {
      byCategory[template.category] = [];
    }
    byCategory[template.category].push(template);
  }

  return byCategory;
}