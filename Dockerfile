FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    unzip \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install app dependencies
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Create temp directory for tasks
RUN mkdir -p temp && chmod 777 temp

# Expose the port
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
