# API Authentication Summary

## Public Endpoints (No Auth Required)

### Health Check
- `GET /ping` - Server health check

### Public Experiment Runner
- `GET /run/:id` - Run experiment (for participants)
- `POST /run/:id/data` - Submit experiment data
- `GET /run/:id/complete` - Experiment completion page
- `GET /run/:id/assets/*` - Serve experiment files

## Authenticated Endpoints (Bearer Token Required)

### Authentication
- `POST /auth/signup` - Create account (no auth needed)
- `POST /auth/login` - Login (no auth needed)

### Profile
- `GET /profile` - Get user profile

### Experiments
- `GET /experiments` - List all experiments
- `POST /experiments` - Create new experiment
- `GET /experiments/:id` - Get experiment details
- `PUT /experiments/:id` - Update experiment
- `DELETE /experiments/:id` - Delete experiment
- `PATCH /experiments/:id/status` - Toggle live status

### File Management
- `POST /experiments/:id/upload` - Upload files
- `GET /experiments/:id/files` - List files
- `DELETE /experiments/:id/files/:filename` - Delete file

### Data Management
- `GET /experiments/:id/data` - Get all data
- `GET /experiments/:id/data/summary` - Get summary
- `GET /experiments/:id/data/export/json` - Export as JSON
- `GET /experiments/:id/data/export/csv` - Export as CSV
- `GET /experiments/:id/data/:participantId` - Get participant data
- `DELETE /experiments/:id/data/:participantId` - Delete participant data

### DataPipe Integration
- `POST /experiments/:id/datapipe/config` - Configure DataPipe
- `POST /experiments/:id/datapipe/sync` - Sync to OSF
- `GET /experiments/:id/datapipe/status` - Get sync status

### Dashboard
- `GET /dashboard/overview` - Dashboard overview
- `GET /dashboard/experiments` - Experiment statistics
- `GET /dashboard/activity` - Activity timeline
- `GET /dashboard/storage` - Storage usage

## Authentication Method

For authenticated endpoints, include the JWT token in the Authorization header:

```
Authorization: Bearer YOUR_JWT_TOKEN
```

The JWT token is obtained from the `/auth/login` endpoint and expires after 24 hours.