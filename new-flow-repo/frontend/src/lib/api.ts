// API configuration - will connect to backend later
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Generic fetch wrapper
async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status}`);
  }

  return response.json();
}

// Auth API
export const authApi = {
  login: (email: string, password: string) =>
    fetchApi('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
    
  logout: () => fetchApi('/api/auth/logout', { method: 'POST' }),
  
  me: () => fetchApi('/api/auth/me'),
};

// Interview Rounds API
export const roundsApi = {
  list: (params?: { status?: string; role?: string }) => {
    const query = new URLSearchParams(params as any).toString();
    return fetchApi(`/api/rounds${query ? `?${query}` : ''}`);
  },
  
  get: (id: string) => fetchApi(`/api/rounds/${id}`),
  
  start: (id: string) => fetchApi(`/api/rounds/${id}/start`, { method: 'POST' }),
  
  end: (id: string) => fetchApi(`/api/rounds/${id}/end`, { method: 'POST' }),
  
  updateConsent: (id: string, consent: boolean) =>
    fetchApi(`/api/rounds/${id}/consent`, {
      method: 'POST',
      body: JSON.stringify({ consent }),
    }),
};

// Insights API
export const insightsApi = {
  getByRound: (roundId: string) => fetchApi(`/api/insights/${roundId}`),
  
  getSummary: (roundId: string) => fetchApi(`/api/insights/${roundId}/summary`),
};

// Verdicts API
export const verdictsApi = {
  submit: (roundId: string, verdict: any) =>
    fetchApi(`/api/verdicts/${roundId}`, {
      method: 'POST',
      body: JSON.stringify(verdict),
    }),
    
  get: (roundId: string) => fetchApi(`/api/verdicts/${roundId}`),
};

// Candidates API
export const candidatesApi = {
  get: (id: string) => fetchApi(`/api/candidates/${id}`),
  
  getResume: (id: string) => fetchApi(`/api/candidates/${id}/resume`),
};

export { API_BASE_URL };
