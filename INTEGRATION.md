# AI Service Integration Documentation

## Architecture
The AI Interviewer platform consists of three main components:
1. **Main Frontend (Next.js)**: Candidate portal and HR dashboard (Port 3000).
2. **Backend (FastAPI)**: Core business logic, database access, and orchestration (Port 8000).
3. **AI Service (Next.js)**: Specialized service for conducting AI interviews (Port 9004).

### Integration Points
- **Candidate Sync**: Backend syncs candidate data to AI Service via `POST /api/admin/candidates`.
- **Interview Creation**: Backend requests interview session creation in AI Service via `POST /api/admin/interview-sessions`.
- **Embedding**: Main Frontend embeds AI Service interview interface using `<iframe>`.
- **Authentication**: Backend uses `x-api-key` header to authenticate with AI Service.

## Security Considerations
1. **API Key Authentication**: Service-to-service communication is secured using a shared secret key.
2. **CSP Headers**: `Content-Security-Policy` headers are configured to allow iframe embedding only from trusted domains (e.g., `localhost:3000`).
3. **Token-based Access**: Interview sessions are accessed via unique, time-limited tokens.
4. **Data Isolation**: Each service maintains its own database, with controlled data synchronization.

## Troubleshooting
### Common Issues
1. **VPC / Frame Ancestors Error**:
   - **Symptom**: "Refused to frame..." error in browser console.
   - **Fix**: Ensure `next.config.ts` in AI Service includes the correct `frame-ancestors` directive matching the Main Frontend URL.

2. **Port Conflicts**:
   - **Symptom**: Service fails to start with `EADDRINUSE`.
   - **Fix**: AI Service is configured to run on port 9004. Check `docker-compose.yml` or `.env` files.

3. **Data Sync Failures**:
   - **Symptom**: Candidate created in backend but not in AI Service.
   - **Fix**: Check Backend logs for `AIService` errors. Verify `AI_SERVICE_URL` and `AI_SERVICE_API_KEY` in Backend config.

### Verification Steps
1. **Check Connectivity**:
   ```bash
   curl http://localhost:9004/api/health
   ```
2. **Verify API Key**:
   Ensure `AI_SERVICE_API_KEY` matches between Backend `config.py` and AI Service `auth.ts`.
