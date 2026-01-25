// Endpoint disabled: reporting/export logic not available in AI Interviewer SaaS
export default function handler(req, res) {
  return res.status(501).json({
    success: false,
    error: 'Report export not available in AI Interviewer SaaS.'
  });
}


