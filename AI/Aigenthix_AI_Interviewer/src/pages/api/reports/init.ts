// Endpoint disabled: reporting/init logic not available in AI Interviewer SaaS
export default function handler(req, res) {
  return res.status(501).json({
    success: false,
    error: 'Report init not available in AI Interviewer SaaS.'
  });
}

