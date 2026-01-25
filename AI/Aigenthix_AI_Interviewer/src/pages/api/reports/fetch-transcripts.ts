// Endpoint disabled: reporting/fetch-transcripts logic not available in AI Interviewer SaaS
export default function handler(req, res) {
  return res.status(501).json({
    success: false,
    error: 'Transcript fetch not available in AI Interviewer SaaS.'
  });
}

