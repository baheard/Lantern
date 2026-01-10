# Build Instructions

**IMPORTANT:** Overrides base CLAUDE.md. Authoritative build documentation.

## MSBuild Path
```
C:\Program Files\Microsoft Visual Studio\2022\Professional\MSBuild\Current\Bin\MSBuild.exe
```

## Solution/Project File Locations
- **Full solution:** `Monorepo.sln` (in parent directory of `enterprise/`)
- **Web projects:** `enterprise/TDNext/TDNext.csproj`, `enterprise/TDClient/TDClient.csproj`, etc.
- **Shared libraries:** `enterprise/../objects/TeamDynamix.Domain/TeamDynamix.Domain.csproj`, etc.
- **Work Management:** `enterprise/TDWorkManagement/TDWorkManagement.csproj`

## Full Solution Build
```bash
# From enterprise dir - navigate to parent first (where Monorepo.sln is)
cd .. && powershell -Command "& 'C:\Program Files\Microsoft Visual Studio\2022\Professional\MSBuild\Current\Bin\MSBuild.exe' Monorepo.sln /t:Build /p:Configuration=Debug /m /v:minimal"
```
- `/m` = parallel, `/v:minimal` = errors/warnings only
- Takes 5-10min cold, 1-3min incremental
- Expected warnings: NU1701, NU1702, MSB3277, MSB3073 (safe to ignore)

## Build Strategy: Minimum Required Only

**IMPORTANT:** Only build the specific project(s) you modified to save time and resources.

**⚠️ When NO MSBuild is needed (just refresh browser):**
- Inline CSS in `.aspx` files (within `<style>` tags)
- Inline JavaScript in `.aspx` files (within `<script>` tags)
- `.aspx` markup/HTML changes only

**⚠️ LESS/SCSS files:** Do NOT use MSBuild for LESS/SCSS changes. Use Grunt or npm commands instead:

**TDClient/TDNext/TDAdmin LESS files:**
```bash
# Compile all LESS to CSS (from enterprise dir)
grunt styles

# Or compile everything (LESS + JS)
grunt
```

**TDWorkManagement SCSS files:**
```bash
# From enterprise dir
cd TDWorkManagement && npm run scss:compile
```

These commands are much faster than MSBuild and don't require DLL rebuilding.

**🚨 BUILD DECISION RULES:**

**Build FULL solution (no questions asked) when:**
- User asks to switch branches and build
- User pulls/merges changes and asks to build
- No specific context about which app is being worked on
- User explicitly says "build the solution"

**Build SPECIFIC project only when:**
- You just made targeted changes to specific files in a single project
- User explicitly specifies which project to build
- Clear context that work is isolated to one application

**Examples:**
- Changed `TDClient` controller → Build only `TDClient\TDClient.csproj`
- Changed `TDNext` page → Build only `TDNext\TDNext.csproj`
- Changed shared `TeamDynamix.Domain` code → Build full solution (affects multiple apps)

**When full solution might be needed:**
- Changes to shared libraries (`objects/TeamDynamix.*`)
- Database schema changes (`TeamDynamixDB`)
- Unsure of dependencies

**⚠️ Objects folder dependency note:** If you build any project in `objects/`, you must rebuild any dependent project you're testing to get the updated DLL reference.

**When to build single project:**
- Changes isolated to one application (TDClient, TDNext, TDAdmin, etc.)
- UI-only changes (controllers, views, scripts)
- Shared library changes (user can specify which apps need the updated DLL)

## Web Forms Projects (TDNext/TDAdmin/TDClient)
```bash
# From enterprise dir - must use MSBuild via PowerShell (bash breaks / switches)
powershell -Command "& 'C:\Program Files\Microsoft Visual Studio\2022\Professional\MSBuild\Current\Bin\MSBuild.exe' TDNext\TDNext.csproj /t:Build /p:Configuration=Debug"
```
**CRITICAL:** Must wrap in `powershell -Command` with single quotes around path. Direct bash invocation strips `/t:` and `/p:` switches.

## TDWorkManagement (ASP.NET Core + TypeScript + Vue)

**⚠️ For TypeScript/SCSS changes only (PREFERRED - faster):**
```bash
# TypeScript changes: From enterprise dir
cd TDWorkManagement && npm run builddev

# SCSS changes: From enterprise dir
cd TDWorkManagement && npm run scss:compile

# Vue changes: From enterprise dir
cd TDWorkManagement\VueLibrarySource && npm run builddev
```
**Do NOT use MSBuild/dotnet build for frontend-only changes** - it's slower and unnecessary.

**For C# changes or full rebuild:**
```bash
# From enterprise dir - ALWAYS touch web.config first to prevent DLL lock issues
powershell -Command "(Get-Item TDWorkManagement/web.config).LastWriteTime = Get-Date; Start-Sleep -Seconds 5; dotnet build TDWorkManagement/TDWorkManagement.csproj"
```
**Why touch web.config first:** Triggers IIS app pool recycle to release DLL locks before build starts
**Auto-runs:** .csproj MSBuild targets handle Vue/TS builds automatically (uses timestamp files to skip if unchanged)

## Troubleshooting

**NU1900 (NuGet auth):** Install credential provider:
```bash
powershell -Command "iex ((New-Object System.Net.WebClient).DownloadString('https://aka.ms/install-artifacts-credprovider.ps1'))"
```

**Locked DLL files (w3wp.exe holds TDWorkManagement.dll):**
When build fails with "The file is locked by: w3wp.exe", use this workaround to force app pool recycle:
```bash
# Touch web.config to trigger IIS recycle, wait 5 seconds, then rebuild
powershell -Command "(Get-Item TDWorkManagement\web.config).LastWriteTime = Get-Date; Start-Sleep -Seconds 5; dotnet build TDWorkManagement\TDWorkManagement.csproj"
```
**Why this works:** Modifying web.config timestamp triggers IIS to automatically recycle the app pool, releasing the DLL lock.

**Alternative (requires admin):** Kill the process or stop app pools manually:
```bash
# Run PowerShell as Administrator, then:
Stop-Process -Id <PID> -Force
# OR stop app pools:
C:\Windows\System32\inetsrv\appcmd stop apppool /apppool.name:TDWorkManagement
```

**Force rebuild TDWorkManagement:** Delete timestamps:
```bash
del /f TDWorkManagement\node_modules\tdworkmanagement.timestamp
del /f TDWorkManagement\VueLibrarySource\node_modules\vuelibrarysource.timestamp
```

## 🚨 CRITICAL: Post-Build Pre-warming 🚨

**⚠️ MANDATORY:** After EVERY successful **C# build** (MSBuild/dotnet build), immediately run prewarm.

**⚠️ BASH PATH HANDLING:** The Bash tool strips backslashes from paths. You MUST wrap in `powershell -Command` with a `cd` first:
```bash
powershell -Command "cd C:\source\TDDev\enterprise; .\.claude\claude-workflows\prewarm-auth.ps1 -Project 'TDWorkManagement'"
```

**When prewarm is needed:**
- After MSBuild of web projects (TDNext, TDClient, TDAdmin, TDWorkManagement C# project)
- After `dotnet build` commands
- After full solution builds → Prewarm TDNext, TDClient, TDAdmin, and TDWorkManagement (all in parallel)

**When prewarm is NOT needed:**
- After `npm run builddev` (TypeScript only)
- After `npm run scss:compile` (SCSS only)
- After Vue builds in VueLibrarySource

**See [prewarm.md](prewarm.md) for complete details.**

Always use `run_in_background: true` and `timeout: 30000` when calling via Bash tool. DO NOT SKIP THIS STEP.

## Prerequisites
- .NET 8.0 SDK
- Node.js LTS
- Azure Artifacts Credential Provider (see NU1900 above)
