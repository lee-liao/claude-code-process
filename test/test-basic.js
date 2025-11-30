import { createServer } from 'http';

const server = createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  // Health check
  if (path === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      activeTasks: 0,
      tempDir: "./temp",
    }));
    return;
  }

  // API documentation
  if (path === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      name: "Claude Code Web API",
      version: "1.0.0",
      description: "Web API for Claude Code non-interactive execution",
      status: "✅ Basic test server working"
    }));
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    error: "Endpoint not found",
    code: "NOT_FOUND",
    path: path
  }));
});

const port = 3001;
const host = '0.0.0.0';

console.log(`🧪 Starting Basic Test Server`);
console.log(`📍 Server: http://${host}:${port}`);

server.listen(port, host, () => {
  console.log(`✅ Basic test server listening on http://${host}:${port}`);
  console.log(`🧪 Try: curl http://localhost:3000/health`);
});

process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});