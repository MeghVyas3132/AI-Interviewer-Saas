import { getInterviewSessionByToken, getResumeById, updateInterviewSession } from '@/lib/postgres-data-store';
import type { InterviewSession } from '@/lib/postgres-data-store';
import { connectMongo } from '@/lib/mongodb';
import { ResumeAnalysis } from '@/lib/models';

type ResumeReadinessState = 'missing' | 'processing' | 'ready' | 'error';

const STALE_PROCESSING_THRESHOLD_MS = 10 * 60 * 1000;

export interface ResumeReadinessStatus {
  state: ResumeReadinessState;
  message: string;
  resumeId?: number | null;
  fileName?: string | null;
  uploadedAt?: string;
  processedAt?: string;
  source?: 'session' | 'cache' | 'mongo' | 'database';
  error?: string;
}

export interface ResumeReadinessResponse {
  ready: boolean;
  status: ResumeReadinessStatus;
  session: InterviewSession | null;
}

const SAFE_DEFAULT_STATUS: ResumeReadinessStatus = {
  state: 'missing',
  message: 'Resume has not been uploaded yet.',
};

/**
 * Clears stale processing status from both cache and database.
 * Removes resumeStatus from resultsJson and updates the session in the database.
 */
async function clearStaleProcessingStatus(
  session: InterviewSession,
  resultsJson: any,
  cacheKey: string
): Promise<void> {
  try {
    // Clear from cache if it exists
    if (typeof global !== 'undefined') {
      const globalAny = global as any;
      globalAny?.resumeAnalysisCache?.delete(cacheKey);
    }
    
    // Remove resumeStatus property entirely via destructuring
    const { resumeStatus, ...cleanedResults } = resultsJson;
    
    // Update the database
    await updateInterviewSession(session.id, {
      results_json: cleanedResults,
    });
    
    console.log(`[Resume Readiness] Cleared stale processing status for session ${session.id}`);
  } catch (clearError) {
    console.error('Failed to clear stale processing status:', clearError);
  }
}

function parseResultsJson<T = any>(value: any): Partial<T> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (err) {
      console.warn('Failed to parse session results_json while checking resume readiness:', err);
      return {};
    }
  }
  return value;
}

export async function determineResumeReadiness(
  token: string,
  existingSession?: InterviewSession | null
): Promise<ResumeReadinessResponse> {
  const session = existingSession ?? (await getInterviewSessionByToken(token));

  if (!session) {
    return {
      ready: false,
      status: {
        state: 'missing',
        message: 'Interview session could not be found for the provided link.',
      },
      session: null,
    };
  }

  const cacheKey = `resume_analysis_${token}`;
  const resultsJson = parseResultsJson(session.results_json);
  const resumeStatus = resultsJson?.resumeStatus as ResumeReadinessStatus | undefined;

  if (resumeStatus?.state === 'ready') {
    return {
      ready: true,
      status: {
        ...resumeStatus,
        state: 'ready',
        message: resumeStatus.message || 'Resume is ready for interview.',
        source: 'session',
      },
      session,
    };
  }

  if (resumeStatus?.state === 'processing') {
    // Check if processing status is stale
    // If no resume_id exists, check if upload is recent (within last 10 minutes)
    // If no resume_id and upload is not recent (or missing), the status is stale
    const uploadedAt = resumeStatus.uploadedAt ? new Date(resumeStatus.uploadedAt) : null;
    const hasNoResumeId = !session.resume_id;
    
    if (hasNoResumeId) {
      // If there's no resume_id, check if there was a recent upload attempt
      // If no upload timestamp or upload is older than 10 minutes, treat as stale
      if (!uploadedAt || (Date.now() - uploadedAt.getTime() > STALE_PROCESSING_THRESHOLD_MS)) {
        // Clear stale processing status from database - no actual resume was uploaded or upload failed
        await clearStaleProcessingStatus(session, resultsJson, cacheKey);
        
        return {
          ready: false,
          status: SAFE_DEFAULT_STATUS,
          session,
        };
      }
      // If there's a recent upload but no resume_id yet, it's still processing
    }
    
    return {
      ready: false,
      status: {
        ...resumeStatus,
        state: 'processing',
        message: resumeStatus.message || 'Resume is processing. Please wait a moment.',
        source: 'session',
      },
      session,
    };
  }

  if (resumeStatus?.state === 'error') {
    return {
      ready: false,
      status: {
        ...resumeStatus,
        state: 'error',
        message: resumeStatus.message || 'Resume processing failed. Please try uploading again.',
        source: 'session',
      },
      session,
    };
  }

  // Check in-memory cache (if available)
  if (typeof global !== 'undefined') {
    const globalAny = global as any;
    const cached = globalAny?.resumeAnalysisCache?.get(cacheKey);
    if (cached) {
      if (cached.status === 'ready' && cached.analysis) {
        return {
          ready: true,
          status: {
            state: 'ready',
            message: 'Resume analysis is ready.',
            resumeId: cached.resumeId ?? session.resume_id ?? null,
            fileName: cached.fileName ?? session.resume_name ?? null,
            uploadedAt: cached.uploadedAt,
            processedAt: cached.processedAt,
            source: 'cache',
          },
          session,
        };
      }

      if (cached.status === 'processing') {
        // Check if cache entry is stale (no resume_id and no recent upload)
        const cachedUploadedAt = cached.uploadedAt ? new Date(cached.uploadedAt) : null;
        const hasNoResumeId = !session.resume_id;
        
        if (hasNoResumeId && (!cachedUploadedAt || (Date.now() - cachedUploadedAt.getTime() > STALE_PROCESSING_THRESHOLD_MS))) {
          // Clear stale cache entry and database status - no actual resume was uploaded
          await clearStaleProcessingStatus(session, resultsJson, cacheKey);
          
          return {
            ready: false,
            status: SAFE_DEFAULT_STATUS,
            session,
          };
        }
        
        return {
          ready: false,
          status: {
            state: 'processing',
            message: 'Resume is processing. Please wait a moment.',
            resumeId: session.resume_id ?? null,
            fileName: cached.fileName ?? session.resume_name ?? null,
            uploadedAt: cached.uploadedAt,
            source: 'cache',
          },
          session,
        };
      }

      if (cached.status === 'error') {
        return {
          ready: false,
          status: {
            state: 'error',
            message: cached.error || 'Resume processing failed. Please try again.',
            resumeId: session.resume_id ?? null,
            fileName: cached.fileName ?? session.resume_name ?? null,
            uploadedAt: cached.uploadedAt,
            source: 'cache',
            error: cached.error,
          },
          session,
        };
      }
    }
  }

  // Check MongoDB for analysis data
  try {
    const mongoConnected = await connectMongo();
    if (mongoConnected) {
      const mongoAnalysis = await ResumeAnalysis.findOne({ interviewToken: token });
      if (mongoAnalysis) {
        return {
          ready: true,
          status: {
            state: 'ready',
            message: 'Resume analysis retrieved from persistent storage.',
            resumeId: session.resume_id ?? null,
            fileName: mongoAnalysis.fileName || session.resume_name || null,
            uploadedAt: mongoAnalysis.uploadedAt?.toISOString(),
            processedAt: mongoAnalysis.analyzedAt?.toISOString(),
            source: 'mongo',
          },
          session,
        };
      }
    }
  } catch (mongoError) {
    console.error('Failed to evaluate resume readiness via MongoDB:', mongoError);
  }

  // Fall back to resume_id reference in session
  if (session.resume_id) {
    try {
      const resumeRecord = await getResumeById(session.resume_id);
      if (resumeRecord) {
        return {
          ready: true,
          status: {
            state: 'ready',
            message: 'Resume is linked to the session.',
            resumeId: session.resume_id,
            fileName: resumeRecord.file_name || session.resume_name || null,
            uploadedAt: resumeRecord.upload_date,
            source: 'database',
          },
          session,
        };
      }
    } catch (resumeError) {
      console.error('Failed to fetch resume by ID while checking readiness:', resumeError);
      return {
        ready: false,
        status: {
          state: 'error',
          message: 'Could not verify resume status due to a data error.',
          resumeId: session.resume_id,
          fileName: session.resume_name || null,
          source: 'database',
          error: resumeError instanceof Error ? resumeError.message : String(resumeError),
        },
        session,
      };
    }
  }

  return {
    ready: false,
    status: SAFE_DEFAULT_STATUS,
    session,
  };
}


