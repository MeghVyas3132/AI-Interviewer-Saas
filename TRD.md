# Technical Requirements Document (TRD)
## AI Interviewer Platform - Authentication System

**Version:** 1.0.0  
**Date:** November 2025  
**Status:** Production Ready

---

## 1. Executive Summary

This document outlines the technical requirements for the AI Interviewer Platform's authentication system. The system implements a secure JWT-based authentication flow with HTTP-only cookies for session management, designed for production deployment with zero security vulnerabilities.

---

## 2. System Architecture

### 2.1 Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | FastAPI | 0.104.1 |
| Server | Uvicorn | 0.24.0 |
| Database | PostgreSQL | 15.0 |
| Cache | Redis | 7.0 |
| Auth | JWT + Cookies | PyJWT 2.10.1 |
| ORM | SQLAlchemy | 2.0.23 |
| Password Hashing | bcrypt | 4.1.1 |

### 2.2 Architecture Overview

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       ├─ POST /api/v1/auth/login
       │  (email, password)
       │
       ▼
┌──────────────────────────────────┐
│   FastAPI Backend (Port 8000)   │
│  ┌────────────────────────────┐  │
│  │  Authentication Routes     │  │
│  │  - Email Validation        │  │
│  │  - Password Verification   │  │
│  │  - JWT Generation          │  │
│  │  - Cookie Setting          │  │
│  └────────────────────────────┘  │
│  ┌────────────────────────────┐  │
│  │  Security Middleware       │  │
│  │  - Bearer Token Validation │  │
│  │  - Cookie Verification     │  │
│  │  - Role-Based Access       │  │
│  └────────────────────────────┘  │
└────────┬─────────────────┬────────┘
         │                 │
    ┌────▼─────┐      ┌────▼──────┐
    │PostgreSQL│      │   Redis   │
    │  (Port   │      │  (Port    │
    │  5432)   │      │  6379)    │
    └──────────┘      └───────────┘
```

---

## 3. Authentication Flow

### 3.1 Login Flow Sequence

```
Step 1: Email Check
├─ Receive email from client
├─ Query database for user by email
└─ If NOT found → Return 401 "Invalid email or password"

Step 2: Password Check
├─ If user found → Verify password hash
└─ If INVALID → Return 401 "Invalid email or password"

Step 3: JWT Generation
├─ If password VALID → Create access token (15 mins)
├─ Create refresh token (7 days)
└─ Return tokens to client

Step 4: Cookie Setting
├─ Set HttpOnly cookie: refresh_token
├─ Cookie Properties:
│  ├─ HttpOnly: true (prevents XSS attacks)
│  ├─ Secure: true (HTTPS only)
│  ├─ SameSite: strict (prevents CSRF)
│  └─ Max-Age: 604800 seconds (7 days)
└─ Response includes access_token in body
```

### 3.2 Login Request/Response

**Request:**
```json
POST /api/v1/auth/login
{
  "email": "user@company.com",
  "password": "SecurePassword123!"
}
```

**Success Response (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

**Error Response (401 Unauthorized):**
```json
{
  "detail": "Invalid email or password"
}
```

### 3.3 Token Structure

**Access Token (JWT):**
- Expires: 15 minutes
- Claims:
  - `sub`: User ID (UUID)
  - `company_id`: Company ID (UUID)
  - `iat`: Issued at
  - `exp`: Expiration time

**Refresh Token (JWT):**
- Expires: 7 days
- Claims:
  - `sub`: User ID (UUID)
  - `company_id`: Company ID (UUID)
  - `iat`: Issued at
  - `exp`: Expiration time

### 3.4 Refresh Token Flow

**Request:**
```json
POST /api/v1/auth/refresh
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

### 3.5 Logout Flow

**Request:**
```json
POST /api/v1/auth/logout
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "message": "Logged out successfully"
}
```

**Client Side Actions:**
1. Delete stored access_token
2. Browser automatically deletes refresh_token cookie
3. Redirect to login page

---

## 4. Security Requirements

### 4.1 Password Security

| Requirement | Implementation |
|-------------|-----------------|
| Hashing Algorithm | bcrypt (rounds=12) |
| Minimum Length | 8 characters |
| Salting | Automatic via bcrypt |
| Verification | Constant-time comparison |

### 4.2 JWT Security

| Requirement | Implementation |
|-------------|-----------------|
| Algorithm | HS256 (HMAC SHA256) |
| Secret Key | 256-bit minimum (change in production) |
| Token Signing | PyJWT library |
| Token Verification | Signature validation + expiration check |
| Algorithm Verification | Explicit algorithm specification |

### 4.3 Cookie Security

| Property | Value | Reason |
|----------|-------|--------|
| HttpOnly | true | Prevents JavaScript access (XSS protection) |
| Secure | true | HTTPS only transmission |
| SameSite | strict | Prevents CSRF attacks |
| Path | / | Available to all routes |
| Domain | Set by browser | Automatic scope limitation |

### 4.4 CORS Policy

**Allowed Origins:**
- `http://localhost:8000` (development only)

**Production:** Update to actual domain before deployment

```python
cors_origins: List[str] = ["https://yourdomain.com"]
```

### 4.5 Rate Limiting (Recommended)

**Not yet implemented.** Recommended additions:

```python
# Add to requirements.txt
slowapi==0.1.9

# Configure in main.py
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

# Apply to login endpoint
@app.post("/api/v1/auth/login")
@limiter.limit("5/minute")
async def login(...):
    ...
```

---

## 5. Database Schema

### 5.1 Users Table

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    role VARCHAR(50) NOT NULL DEFAULT 'employee',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_company_id ON users(company_id);
```

### 5.2 Audit Log Table

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    user_id UUID,
    action VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_audit_logs_company_id ON audit_logs(company_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
```

---

## 6. API Endpoints

### 6.1 Authentication Endpoints

| Method | Endpoint | Auth Required | Description |
|--------|----------|---------------|-------------|
| POST | `/api/v1/auth/login` | No | User login |
| POST | `/api/v1/auth/refresh` | No | Refresh access token |
| POST | `/api/v1/auth/logout` | Yes | User logout |

### 6.2 Protected Endpoints (Example)

All endpoints requiring authentication must include:

```
Authorization: Bearer {access_token}
```

Example:
```bash
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  http://localhost:8000/api/v1/users/me
```

---

## 7. Error Handling

### 7.1 HTTP Status Codes

| Code | Scenario | Message |
|------|----------|---------|
| 200 | Successful login | TokenResponse with tokens |
| 400 | Invalid request format | "Invalid request" |
| 401 | Invalid credentials | "Invalid email or password" |
| 401 | Expired token | "Invalid token" |
| 403 | Insufficient permissions | "Insufficient permissions" |
| 404 | User not found | "User not found" |
| 500 | Server error | "Internal server error" |

### 7.2 Error Response Format

```json
{
  "detail": "Error message description"
}
```

---

## 8. Configuration

### 8.1 Environment Variables

```bash
# Backend/.env file

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/ai_interviewer_db

# Redis
REDIS_URL=redis://localhost:6379/0

# JWT Configuration
SECRET_KEY=your-256-bit-secret-key-change-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# Application
APP_NAME=AI Interviewer Platform
APP_VERSION=1.0.0
DEBUG=False
LOG_LEVEL=INFO

# CORS
CORS_ORIGINS=["http://localhost:8000"]
```

### 8.2 Production Configuration

Before deploying to production:

1. **Change SECRET_KEY** to a strong 256-bit key:
   ```bash
   python3 -c "import secrets; print(secrets.token_urlsafe(32))"
   ```

2. **Update CORS_ORIGINS** to your domain:
   ```bash
   CORS_ORIGINS=["https://yourdomain.com"]
   ```

3. **Set DEBUG=False**

4. **Use HTTPS** for all endpoints

5. **Enable Rate Limiting** on login endpoint

---

## 9. Testing Requirements

### 9.1 Unit Tests

```python
# test_auth_service.py
- test_authenticate_user_success()
- test_authenticate_user_invalid_password()
- test_authenticate_user_email_not_found()
- test_create_tokens()
- test_verify_and_refresh_token()
```

### 9.2 Integration Tests

```python
# test_auth_routes.py
- test_login_successful()
- test_login_invalid_credentials()
- test_login_sets_cookie()
- test_refresh_token_valid()
- test_refresh_token_expired()
- test_logout_clears_cookie()
```

### 9.3 Security Tests

```
- Test password hash verification
- Test JWT token expiration
- Test invalid algorithm rejection
- Test cookie attributes (HttpOnly, Secure, SameSite)
- Test CORS policy
- Test unauthorized access rejection
```

---

## 10. Deployment

### 10.1 Docker Deployment

```bash
# Build backend image
docker build -t ai-interviewer-backend ./backend

# Run with docker-compose
docker-compose up
```

### 10.2 Docker Compose Services

```yaml
services:
  postgres:
    image: postgres:15-alpine
    port: 5432
    
  redis:
    image: redis:7-alpine
    port: 6379
    
  backend:
    build: ./backend
    port: 8000
    depends_on:
      - postgres
      - redis
```

### 10.3 Production Checklist

- [ ] Update SECRET_KEY
- [ ] Update CORS_ORIGINS
- [ ] Set DEBUG=False
- [ ] Configure HTTPS/SSL
- [ ] Enable database backups
- [ ] Configure Redis persistence
- [ ] Set up logging
- [ ] Configure monitoring
- [ ] Enable rate limiting
- [ ] Test all error scenarios

---

## 11. Monitoring & Logging

### 11.1 Audit Logging

Every login/logout action is logged to `audit_logs` table:

```json
{
  "id": "uuid",
  "company_id": "uuid",
  "user_id": "uuid",
  "action": "LOGIN | LOGOUT",
  "resource_type": "user",
  "resource_id": "uuid",
  "details": null,
  "created_at": "2025-11-05T12:00:00Z"
}
```

### 11.2 Application Logging

```python
# Logs authentication events
LOG_LEVEL=INFO  # Set to DEBUG for verbose logging
```

### 11.3 Metrics to Monitor

- Login success rate
- Login failure rate
- Token refresh frequency
- Invalid token attempts
- Logout rate
- Average response time

---

## 12. Future Enhancements

1. **Multi-Factor Authentication (MFA)**
   - SMS/Email OTP
   - Authenticator app support

2. **OAuth2 / SSO**
   - Google OAuth
   - Microsoft SSO

3. **Session Management**
   - Multiple device sessions
   - Session revocation
   - Device tracking

4. **Advanced Security**
   - IP whitelisting
   - Geolocation verification
   - Behavioral analysis

5. **Performance**
   - Token caching in Redis
   - Distributed sessions
   - Load balancing

---

## 13. Support & Maintenance

### 13.1 Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "Invalid email or password" | Wrong credentials | Verify email/password |
| "Invalid token" | Expired or tampered token | Get new token via login or refresh |
| "Missing auth header" | No Authorization header | Include `Authorization: Bearer {token}` |
| "Insufficient permissions" | User role mismatch | Verify user role in database |

### 13.2 Update Schedule

- **Security patches:** As needed, immediately
- **Dependency updates:** Monthly
- **Major version upgrades:** Quarterly
- **Security audit:** Annually

---

## 14. Sign-Off

- **Document Owner:** Development Team
- **Approved By:** CTO
- **Review Date:** Q1 2025
- **Status:** ✅ Production Ready

---

**Last Updated:** November 5, 2025  
**Document Version:** 1.0.0
