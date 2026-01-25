// MongoDB/Transcript logic removed for AI Interviewer SaaS
export default function handler(req, res) {
  return res.status(501).json({
    success: false,
    error: 'Transcript reporting not available in AI Interviewer SaaS.'
  });
}
