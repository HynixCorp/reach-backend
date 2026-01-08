# AI Coding Assistant Instructions for Reach Backend

## Project Overview
This is a Node.js/TypeScript backend service for the Reach SDK platform, which manages Minecraft server instances, user authentication, organizations, payments, and cloud storage. The service uses Express.js, MongoDB, Socket.IO, and various integrations for a SaaS platform.

## Architecture Overview
- **Framework**: Express.js with TypeScript
- **Database**: MongoDB with 4 databases for separation of concerns
- **Real-time**: Socket.IO for client communication
- **File Handling**: Multer for uploads, custom CDN middleware
- **Payments**: Polar.sh integration
- **Email**: Resend service
- **Validation**: Zod schemas and custom validation service

## Database Architecture
The platform uses 4 separate MongoDB databases:

1. **reach_developers** - Developer accounts (Better-Auth managed)
   - `user`, `account`, `session`, `verification` (Better-Auth)
   - `organizations`, `organizationLinks`
   - `payments`, `usage`
   - `linkedXboxAccounts` (for linking developer accounts to Xbox)

2. **reach_players** - Player accounts (Xbox/Microsoft Auth)
   - `players` - Xbox/Minecraft player profiles
   - `inventory` - Games owned by players
   - `achievements` - Player unlocked achievements
   - `bans` - Player bans (global or per-experience)
   - `sessions` - Xbox auth sessions

3. **reach_experiences** - Game content and instances
   - `instances` - Experiences/modpacks
   - `instanceVersions`, `instanceCodes`, `instanceLogs`
   - `marketplace`, `status`

4. **reach_overlay** - Real-time overlay service
   - `presences`, `achievements`, `notifications`

## Key Components
- `bin/api/controllers/`: Business logic for each API endpoint
- `bin/api/routers/`: Route definitions with versioning (v0)
- `bin/common/`: Shared utilities, middlewares, services
- `bin/models/router.ts`: Main API router aggregation
- `bin/tasks/`: Background cron jobs for maintenance
- `bin/types/`: TypeScript interfaces for data models

## Development Workflow
- **Local Development**: `npm run dev` (uses ts-node-dev with auto-restart)
- **Production Start**: `npm start` (ts-node)
- **Build**: `docker build -t reach-backend:local .`
- **Environment**: Copy `.env.sample` to `.env` with required variables

## Coding Patterns & Conventions

### API Controllers
Use `ResponseHandler` for standardized responses and `asyncHandler` for error wrapping:
```typescript
import { ResponseHandler, asyncHandler } from "../../common/services/response.service";

async function exampleController(req: Request, res: Response): Promise<Response> {
  const validation = validateRequest(req, {
    requiredBody: ["field"],
    requiredHeaders: ["x-api-key"]
  });
  
  if (!validation.isValid) {
    return ResponseHandler.validationError(res, validation.errors);
  }
  
  // Business logic
  return res.status(200).json(createSuccessResponse(data, "Success message"));
}
```

### Database Operations
Use the centralized `DatabaseService` with specific database accessors:
```typescript
import { 
  getDevelopersDB,  // reach_developers - Better-Auth, orgs, payments
  getPlayersDB,     // reach_players - Xbox players, inventory, bans
  getExperiencesDB, // reach_experiences - instances, marketplace
  getOverlayDB      // reach_overlay - presences, achievements
} from "../../common/services/database.service";

// Example: Working with developer accounts
const developersDB = getDevelopersDB();
const orgs = await developersDB.findDocuments("organizations", { ownerId });

// Example: Working with player data
const playersDB = getPlayersDB();
const player = await playersDB.findDocuments("players", { minecraftUuid });

// Example: Working with instances
const experiencesDB = getExperiencesDB();
const instances = await experiencesDB.findDocuments("instances", { id });
```

### Validation
Use the `validateRequest` helper for consistent validation:
```typescript
const validation = validateRequest(req, {
  requiredBody: ["username", "uuid"],
  requiredHeaders: ["machine-id", "device-id"],
  requiredQuery: ["param"]
});
```

### Middleware Stack
Requests pass through custom middlewares in this order:
1. `reachLogger`: Colored request logging with response times
2. `reachCondor`: SQL injection detection
3. `reachCondorErrorHandler`: Error handling
4. `reachEmptyBodyHandler`: Prevents empty POST bodies
5. `reachUserAgentMiddleware`: Enforces "ReachXClient/1.0" user agent

### File Uploads & CDN
- Uploads go to `MULTER_DIR` (default: `./cdn`)
- CDN routes protected by `reachCDNProtection` middleware
- Static files served from `/cdn/instances/assets`, `/cdn/instances/packages`, etc.

### Background Tasks
- `instanceManager.ts`: Cron jobs for instance status updates and cleanup (runs every minute)
- `tempCleaner.ts`: Removes stale temp files (runs every 10 minutes)
- Tasks start automatically in `server.ts`

### Error Responses
Use `createErrorResponse` and `createSuccessResponse` from `utils.ts`:
```typescript
return res.status(400).json(createErrorResponse("Invalid input", 400));
```

### Logging
Use `colorts` for colored console output:
```typescript
console.log("[REACHX - Component] Message".green);
console.error("[REACHX - Component] Error".red);
```

## Data Models
- **PlayerProfile**: Xbox/Microsoft authenticated players with Minecraft UUID
- **PlayerInventory**: Games owned by players (free/purchased)
- **PlayerBan**: Ban entries (global or per-experience, temporal or permanent)
- **DeveloperUser**: Better-Auth managed developer accounts
- **Instances**: Minecraft experiences/modpacks with providers (reach/curseforge/modrinth)
- **Organizations**: Multi-user developer workspaces
- **Payments**: Polar.sh integration for developer subscriptions
- **LinkedXboxAccounts**: Links between developer and player accounts

## Security Considerations
- User agent validation for API access
- SQL injection prevention in middleware
- CDN protection for sensitive files
- UUID validation for Minecraft accounts
- Request size limits (1GB) for large uploads

## Deployment
- Docker container with Node.js 22 Alpine
- Traefik reverse proxy configuration
- Volume mounts for persistent file storage
- Non-root user execution
- Environment-based configuration

## Common Gotchas
- Database connections must be established before starting the server
- File permissions for upload directories (chmod -R 755)
- User agent header required for most API calls
- Multipart form data bypasses empty body validation
- Cron tasks run in background and may conflict with manual operations</content>
<parameter name="filePath">/home/notzair/Documents/GitHub/reach-backend/.github/copilot-instructions.md