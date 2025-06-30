# host

## Environment Variables

Add these to your `.env` file for OAuth integration:

```env
DATABASE_URL=postgresql://USER:PASS@localhost:5432/host
PORT=3000      # optional
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
UPLOAD_DIR=./uploads
PUBLIC_URL=http://localhost:3000
```

## Authentication & Prolific Integration

This API supports **hybrid authentication**:

### 1. User Authentication
- **Traditional Login**: POST `/auth/signup` and `/auth/login` with email/password
- All researchers must create an account with email/password first

### 2. Prolific Account Linking
- **Link Prolific**: PUT `/profile/link-prolific` with `{"prolificApiToken": "your_token"}`
- **Check Status**: GET `/profile` returns `isProlificLinked: true/false`
- **Unlink**: DELETE `/profile/unlink-prolific`

### 3. API Token Management
- Researchers get their API token from Prolific Settings
- Token is validated against Prolific API when linking
- Stored securely and used for study management

## Usage Flow
1. Researcher signs up: `POST /auth/signup`
2. Researcher logs in: `POST /auth/login` 
3. Links Prolific account: `PUT /profile/link-prolific`
4. Creates studies that get posted to Prolific via their token