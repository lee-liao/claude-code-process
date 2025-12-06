import { join } from "path";
import { writeFile, mkdir } from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export class GitHubService {
    private baseUrl: string;

    constructor(baseUrl: string = "http://103.98.213.149:8510") {
        this.baseUrl = baseUrl;
    }

    private parseRepoUrl(repoUrl: string): { owner: string; repo: string } {
        try {
            const url = new URL(repoUrl);
            const parts = url.pathname.split("/").filter(Boolean);
            if (parts.length >= 2) {
                return { owner: parts[0], repo: parts[1].replace(".git", "") };
            }
        } catch (e) {
            // Fallback for non-URL strings if user passed "owner/repo"
            const parts = repoUrl.split("/");
            if (parts.length === 2) {
                return { owner: parts[0], repo: parts[1] };
            }
        }
        throw new Error(`Invalid repository URL: ${repoUrl}`);
    }

    async createBranch(repoUrl: string, baseBranch: string, newBranch: string): Promise<void> {
        const { owner, repo } = this.parseRepoUrl(repoUrl);
        console.log(`Creating branch '${newBranch}' from '${baseBranch}' in '${owner}/${repo}'...`);

        try {
            // Trying POST with owner/repo structure, and keeping original fields just in case
            const response = await fetch(`${this.baseUrl}/create-branch`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    owner,
                    repo,
                    branchName: newBranch, // Matches Swagger spec
                    sourceBranch: baseBranch, // Matches Swagger spec
                    repoUrl, // Keep for backward compatibility if server uses it
                    baseBranch, // Keep for backward compatibility
                    newBranch, // Keep for backward compatibility
                    ref: baseBranch // Some APIs might use ref
                }),
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Failed to create branch: ${response.status} ${text}`);
            }
            console.log("Branch created successfully.");
        } catch (error) {
            console.error("Error creating branch:", error);
            throw error;
        }
    }

    async downloadRepo(repoUrl: string, branch: string, targetDir: string): Promise<string> {
        const { owner, repo } = this.parseRepoUrl(repoUrl);
        console.log(`Downloading repo '${owner}/${repo}' (ref: ${branch}) to '${targetDir}'...`);

        const query = new URLSearchParams({
            owner,
            repo,
            ref: branch
        });

        try {
            const response = await fetch(`${this.baseUrl}/download-repo?${query.toString()}`, {
                method: "GET",
                headers: {
                    "Accept": "application/zip"
                }
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Failed to download repo: ${response.status} ${text}`);
            }

            // Assume response is a zip file
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const zipPath = join(targetDir, "repo.zip");

            await mkdir(targetDir, { recursive: true });
            await writeFile(zipPath, buffer);

            console.log(`Repo downloaded to ${zipPath}. Unzipping...`);

            // Unzip
            // On Windows, use tar or powershell
            if (process.platform === "win32") {
                try {
                    // Try tar first (available in modern Windows)
                    await execAsync(`tar -xf "${zipPath}" -C "${targetDir}"`);
                } catch (e) {
                    console.warn("tar failed, trying PowerShell Expand-Archive...", e);
                    // Fallback to PowerShell
                    await execAsync(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${targetDir}' -Force"`);
                }
            } else {
                await execAsync(`unzip -o "${zipPath}" -d "${targetDir}"`);
            }

            console.log("Unzip complete.");

            // GitHub zips extract to a subfolder like 'owner-repo-sha/'
            // Find this subfolder and return its path as the actual working directory
            const { readdir } = await import("fs/promises");
            const entries = await readdir(targetDir, { withFileTypes: true });
            const extractedFolder = entries.find(e => e.isDirectory() && e.name !== '.' && e.name !== '..');

            if (extractedFolder) {
                const actualPath = join(targetDir, extractedFolder.name);
                console.log(`Found extracted folder: ${actualPath}`);
                return actualPath;
            }

            // If no subfolder found, return the targetDir
            return targetDir;
        } catch (error) {
            console.error("Error downloading repo:", error);
            throw error;
        }
    }

    async createRepository(owner: string, repo: string, description: string, isPrivate: boolean): Promise<void> {
        console.log(`Creating repository '${owner}/${repo}'...`);
        try {
            const response = await fetch(`${this.baseUrl}/create-repo`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ owner, repo, description, private: isPrivate })
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Failed to create repo: ${response.status} ${text}`);
            }
            console.log("Repository created successfully.");
        } catch (error) {
            console.error("Error creating repo:", error);
            throw error;
        }
    }

    async addFile(owner: string, repo: string, path: string, content: string, branch: string, message: string): Promise<void> {
        console.log(`Adding file '${path}' to '${owner}/${repo}'...`);
        try {
            const response = await fetch(`${this.baseUrl}/add-file`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ owner, repo, path, content, branch, message })
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Failed to add file: ${response.status} ${text}`);
            }
            console.log("File added successfully.");
        } catch (error) {
            console.error("Error adding file:", error);
            throw error;
        }
    }

    async createPullRequest(owner: string, repo: string, title: string, body: string, head: string, base: string): Promise<void> {
        console.log(`Creating PR '${title}' (${head} -> ${base}) in '${owner}/${repo}'...`);
        try {
            const response = await fetch(`${this.baseUrl}/create-pull-request`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ owner, repo, title, body, head, base })
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Failed to create PR: ${response.status} ${text}`);
            }
            console.log("Pull request created successfully.");
        } catch (error) {
            console.error("Error creating PR:", error);
            throw error;
        }
    }

    async pushChanges(owner: string, repo: string, message: string, files: Array<{ path: string; content?: string | null; encoding?: string }>, branch: string, parentBranch: string): Promise<void> {
        console.log(`Pushing ${files.length} changes to '${owner}/${repo}'...`);
        try {
            const response = await fetch(`${this.baseUrl}/push-changes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    owner,
                    repo,
                    commitMessage: message,
                    files,
                    branch,
                    parentBranch
                })
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`Failed to push changes: ${response.status} ${text}`);
            }
            console.log("Changes pushed successfully.");
        } catch (error) {
            console.error("Error pushing changes:", error);
            throw error;
        }
    }
}
