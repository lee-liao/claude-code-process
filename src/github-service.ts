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

    async downloadRepo(repoUrl: string, branch: string, targetDir: string): Promise<void> {
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
        } catch (error) {
            console.error("Error downloading repo:", error);
            throw error;
        }
    }
}
