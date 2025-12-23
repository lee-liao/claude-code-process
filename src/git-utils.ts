import { exec } from "child_process";
import { promisify } from "util";
import { mkdir, readdir, copyFile, readFile } from "fs/promises";
import { join } from "path";
import { GitHubService } from "./github-service.js";

const execAsync = promisify(exec);

export interface GitDeltas {
    additions: string[];
    modifications: string[];
    deletions: string[];
}

export interface PushOptions {
    onStatusUpdate?: (status: { step: string; message: string }) => void;
    onLog?: (message: string) => void;
    skipRepoCreation?: boolean;
    featureBranch?: string; // The branch to push changes to
}

/**
 * Initializes a git repository, adds all files, and creates an initial commit.
 * This is used to establish a baseline for tracking changes made by the agent.
 */
export async function initializeGitRepo(cwd: string): Promise<void> {
    try {
        await execAsync('git init', { cwd });
        await execAsync('git config user.email "bot@claude.ai"', { cwd });
        await execAsync('git config user.name "Claude Bot"', { cwd });
        // Check if there are files to commit
        const { stdout } = await execAsync('git status --porcelain', { cwd });
        if (stdout.trim()) {
            await execAsync('git add .', { cwd });
            await execAsync('git commit -m "Initial state"', { cwd });
        } else {
            // Even if empty, we might want an empty commit, but git usually requires changes. 
            // If completely empty folder, we can skip commit or allow empty. 
            // For now, let's just ensure it is an initialized repo.
            await execAsync('git commit --allow-empty -m "Initial state"', { cwd });
        }
    } catch (error) {
        console.warn('Warning: Failed to initialize git repo:', error);
        // We don't throw here to avoid failing the whole task if git fails, 
        // as the final push logic tries to handle things too.
    }
}

/**
 * Recursively copies a directory, skipping .git directories.
 */
export async function copyDirectory(src: string, dest: string): Promise<void> {
    await mkdir(dest, { recursive: true });
    const entries = await readdir(src, { withFileTypes: true });

    for (const entry of entries) {
        if (entry.name === '.git') {
            continue;
        }

        const srcPath = join(src, entry.name);
        const destPath = join(dest, entry.name);

        if (entry.isDirectory()) {
            await copyDirectory(srcPath, destPath);
        } else {
            await copyFile(srcPath, destPath);
        }
    }
}

/**
 * Calculates git deltas (additions, modifications, deletions) for a project path.
 */
export async function calculateDeltas(projectPath: string): Promise<GitDeltas> {
    try {
        const { stdout } = await execAsync('git status --porcelain', { cwd: projectPath, encoding: 'utf8' });

        const changes: GitDeltas = {
            additions: [],
            modifications: [],
            deletions: []
        };

        const lines = stdout.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
            const status = line.substring(0, 2);
            const filePath = line.substring(3).trim().replace(/^"|"$/g, '');

            if (status.includes('??') || status.includes('A')) {
                changes.additions.push(filePath);
            } else if (status.includes('M')) {
                changes.modifications.push(filePath);
            } else if (status.includes('D')) {
                changes.deletions.push(filePath);
            }
        }

        return changes;
    } catch (error) {
        console.error('Error calculating deltas:', error);
        throw error;
    }
}

/**
 * Sets up a GitHub repository and pushes changes.
 */
export async function setupGitAndPush(
    projectPath: string,
    repoOwner: string | undefined, // Allow undefined to fall back to env var
    repoName: string,
    repoDescription: string,
    githubService: GitHubService,
    options: PushOptions = {}
): Promise<void> {
    const { onStatusUpdate = () => { }, onLog = () => { }, skipRepoCreation = false, featureBranch: providedBranch } = options;
    const username = repoOwner || process.env.GITHUB_REPO_OWNER;

    if (!username) {
        throw new Error('Repo Owner (repoOwner) not provided and GITHUB_REPO_OWNER environment variable is not set.');
    }

    // Note: We need to extend GitHubService to support createRepository and pushChanges
    // This assumes GitHubService will be updated to include these methods
    // casting to any for now to allow compilation until GitHubService is updated
    const gh = githubService as any;

    // Only create repo if not skipping (i.e., for new codebases, not existing repo updates)
    if (!skipRepoCreation) {
        onStatusUpdate({ step: 'github-create-repo', message: `Creating GitHub repository in ${username}...` });
        await gh.createRepository(username, repoName, repoDescription, false);
        await gh.addFile(username, repoName, 'README.md', `# ${repoName}\n\n${repoDescription}`, 'main', 'Initial repository creation');
    }

    onStatusUpdate({ step: 'pushing-deltas', message: 'Pushing changes...' });

    // Initialize git if not already (logic from original file suggests we need git initialized to calc deltas)
    try {
        await execAsync('git init', { cwd: projectPath });
        await execAsync('git config user.email "bot@claude.ai"', { cwd: projectPath });
        await execAsync('git config user.name "Claude Bot"', { cwd: projectPath });
    } catch (e) {
        // Ignore if already initialized, or if config fails (though likely won't)
    }

    const deltas = await calculateDeltas(projectPath);
    const deltaFiles: any[] = [];

    // Import stat for checking if path is a directory
    const { stat } = await import('fs/promises');

    for (const filePath of [...deltas.additions, ...deltas.modifications]) {
        try {
            const fullPath = join(projectPath, filePath);

            // Skip directories
            const fileStat = await stat(fullPath);
            if (fileStat.isDirectory()) {
                continue;
            }

            const contentBuffer = await readFile(fullPath);

            deltaFiles.push({
                path: filePath,
                content: contentBuffer.toString('base64'),
                encoding: 'base64'
            });
        } catch (err) {
            // Only warn if it's not an expected skip (like directory)
            const message = (err as Error).message;
            if (!message.includes('EISDIR')) {
                console.warn(`Warning: Could not read modified file ${filePath}: ${message}`);
            }
        }
    }

    for (const filePath of deltas.deletions) {
        deltaFiles.push({
            path: filePath,
            content: null
        });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Use provided branch or generate a new one
    const targetBranch = providedBranch || `ai-update-${timestamp}`;

    // Only create branch if we weren't given one (for new repo generation)
    if (!providedBranch) {
        onStatusUpdate({ step: 'create-branch', message: `Creating feature branch '${targetBranch}'...` });
        try {
            const mockRepoUrl = `https://github.com/${username}/${repoName}`;
            await gh.createBranch(mockRepoUrl, 'main', targetBranch);
        } catch (e) {
            console.warn(`Failed to create branch ${targetBranch}, might already exist or main doesn't exist yet.`, e);
        }
    } else {
        onLog(`Using existing branch: ${targetBranch}`);
    }

    if (deltaFiles.length > 0) {
        const BATCH_SIZE = 50;
        for (let i = 0; i < deltaFiles.length; i += BATCH_SIZE) {
            const batch = deltaFiles.slice(i, i + BATCH_SIZE);
            const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(deltaFiles.length / BATCH_SIZE);

            onLog(`Pushing batch ${batchNumber}/${totalBatches} (${batch.length} files) to ${targetBranch}...`);

            // Push to feature branch.
            // If providedBranch is set, we are updating an existing branch, so parent must be the branch itself.
            // If we created a new branch from scratch, the first batch's parent is main (to create the ref), subsequent are the branch.
            let parentBranch = targetBranch;
            if (!providedBranch && i === 0) {
                parentBranch = 'main';
            }

            await gh.pushChanges(username, repoName, `Update from task execution (Batch ${batchNumber})`, batch, targetBranch, parentBranch);
        }

        // Create Pull Request
        onStatusUpdate({ step: 'create-pr', message: 'Creating Pull Request...' });
        try {
            await gh.createPullRequest(
                username,
                repoName,
                `AI Update ${timestamp}`,
                `Automated changes generated by Claude Code task execution.\n\nTimestamp: ${timestamp}`,
                targetBranch,
                'main'
            );
            onLog(`Pull Request created: ${targetBranch} -> main`);
        } catch (e) {
            console.error("Failed to create Pull Request:", e);
            onLog("Failed to create Pull Request");
        }
    }

    onStatusUpdate({ step: 'completed', message: 'Push and PR completed successfully' });
}
