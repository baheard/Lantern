# Development Server Management

## Branch Information

**Current Branch:** `frotz`

**Purpose:** Server-side Frotz interpreter implementation via Socket.IO. This branch uses a reliable server-based architecture (dfrotz + Node.js) as opposed to browser-based ZVM/GlkOte approaches which had generation counter and lifecycle issues.

**Why Frotz wins:**
- Proven reliability with full text interception
- Easy styling (just HTML/CSS, not constrained by GlkOte structure)
- Complete control over game state and output

## Starting the Development Server

```bash
cd /e/Project/Lantern && npm start
```

The server runs on **port 3000**.

## Checking for Running Servers

```bash
# Check if port 3000 is in use
netstat -ano | findstr :3000

# List all running Node.js processes
tasklist | findstr node
```

## Killing Stuck Processes

When you see "EADDRINUSE" errors (port already in use), you need to kill the existing process:

**Method 1: PowerShell (Recommended)**
```bash
powershell -Command "Stop-Process -Id <PID> -Force"
```

**Method 2: Using netstat to find the PID**
```bash
# Find the process ID using port 3000
netstat -ano | findstr :3000
# Output shows: TCP  0.0.0.0:3000  ...  LISTENING  <PID>

# Kill the process
powershell -Command "Stop-Process -Id <PID> -Force"
```

**Important**: The `taskkill /F /PID` command doesn't work properly in Git Bash because it interprets `/F` as a path. Always use PowerShell for killing processes.

## Multiple Background Servers

Claude Code may start multiple background npm processes. To clean them all up:

1. List all Node processes: `tasklist | findstr node`
2. Kill specific processes or restart your terminal
3. Verify port 3000 is free before starting a new server

## Best Practices

- Always check if the server is already running before starting a new one
- Use the KillShell tool for Claude Code background processes
- Use PowerShell commands for killing Windows processes by PID
- **Restart the server when changes are complete** - after modifying server.js or client files (app.js, styles.css, index.html), restart the server so changes take effect

## Web Agent Screenshots

Screenshots taken by the web-agent-mcp tool are saved to:
```
E:\Project\web-agent-mcp\screenshots\
```

To view a screenshot, use the Read tool with the full path:
```
E:\Project\web-agent-mcp\screenshots\<filename>.png
```

List available screenshots with `mcp__web-agent-mcp__list_screenshots`.
