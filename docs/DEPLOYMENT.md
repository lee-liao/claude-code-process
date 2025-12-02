# Deployment Guide for Linux Server

This guide explains how to deploy the Claude Web API to a remote Linux server using Docker and verify it with a simple calculation test.

## 1. Prerequisites

Ensure your remote server has:
- **Docker** installed
- **Docker Compose** installed
- An **Anthropic API Key**

## 2. Transfer Files

Copy the following files/directories from your local `web-api` folder to a folder on your server (e.g., `~/claude-api`):
- `Dockerfile`
- `docker-compose.yml`
- `.dockerignore`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `src/` (directory)

## 3. Configure Environment

On your remote server, create a `.env` file in the project directory:

```bash
nano .env
```

Add your API key:
```env
ANTHROPIC_API_KEY=sk-ant-api03-...
# Optional: Secure your API
ENABLE_AUTH=true
API_KEY=my-secret-password
```

## 4. Deploy

Build and start the container:

```bash
docker-compose up -d --build
```

Check logs to ensure it started correctly:
```bash
docker-compose logs -f
```
You should see: `Server listening on http://0.0.0.0:3000` (Internal container port)

## 5. Verification Test (5 + 5)

Run this command from your local machine (replacing `YOUR_SERVER_IP` with your server's IP address).

**Request:**
```bash
curl -X POST http://YOUR_SERVER_IP:8520/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "taskType": "custom",
    "prompt": "Calculate 5 + 5. Return only the result.",
    "maxTurns": 1
  }'
```

**Expected Output:**
You will receive a JSON response with a `taskId`.
```json
{"taskId":"...","status":"pending",...}
```

**Check Result:**
Use the `taskId` from the previous step:
```bash
curl http://YOUR_SERVER_IP:8520/tasks/YOUR_TASK_ID
```

The JSON response should contain:
```json
"result": "10"
```
(or similar text confirming the calculation)

## Troubleshooting

- **Permission Denied**: If Claude fails to write to temp files, ensure the `temp` directory permissions are correct (handled in Dockerfile, but good to check).
- **API Key Error**: Ensure `ANTHROPIC_API_KEY` is correctly set in the `.env` file.
- **Connection Refused**: Ensure your server's firewall allows traffic on port 8520.

## 6. Critical Configuration

### Non-Root User
The Docker container runs as the `node` user (UID 1000) instead of `root`. This is required because the Claude CLI refuses to run with `--dangerously-skip-permissions` when executed as root.

### Volume Permissions
Since the container runs as a non-root user, you must ensure the host directory mounted to `/app/temp` is writable by UID 1000.

Run this command on your host machine before starting the container:
```bash
# Create the directory if it doesn't exist
mkdir -p ./temp

# Set ownership to UID 1000 (node user)
sudo chown -R 1000:1000 ./temp

# Alternatively, make it world-writable
sudo chmod -R 777 ./temp
```

## 7. Debugging

Useful commands for troubleshooting the container:

```bash
# Access the container shell (as node user)
docker exec -it claude-web-api bash

# Check environment variables inside container
docker exec claude-web-api env | grep ANTHROPIC

# View container logs (follow)
docker logs -f claude-web-api

# Inspect container configuration (e.g. volume mounts)
docker inspect claude-web-api

# Run Claude manually inside the container (for testing)
# Note: Navigate to a task directory first if needed
docker exec -it claude-web-api bash -c "claude -p 'hello' --verbose"
```
