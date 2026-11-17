module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    version: '7.0-prospect',
    runtime: 'vercel-node',
    timestamp: new Date().toISOString(),
    env: {
      foodSafety: Boolean(process.env.FOODSAFETY_API_KEY),
      dataGoKr: Boolean(process.env.DATA_GO_KR_SERVICE_KEY),
      kakao: Boolean(process.env.KAKAO_REST_API_KEY)
    }
  });
};
