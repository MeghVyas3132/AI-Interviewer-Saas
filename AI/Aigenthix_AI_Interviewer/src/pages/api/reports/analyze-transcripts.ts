// Endpoint disabled: reporting/analysis logic not available in AI Interviewer SaaS
export default function handler(req, res) {
  return res.status(501).json({
    success: false,
    error: 'Transcript analysis not available in AI Interviewer SaaS.'
  });
}

