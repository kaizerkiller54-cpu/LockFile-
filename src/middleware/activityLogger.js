const { ActivityLog } = require('../models');

async function logActivity({ userId, action, cibleType, cibleId, description, details, req }) {
  try {
    await ActivityLog.create({
      utilisateur_id: userId,
      action,
      cible_type: cibleType || null,
      cible_id: cibleId || null,
      description,
      details: details || null,
      ip_address: req?.ip || null,
      user_agent: req?.get?.('user-agent')?.substring(0, 500) || null,
    });
  } catch (err) {
    // Silently fail — never block user action for logging
  }
}

function activityMiddleware(action, cibleType, getDescription) {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const cibleId = data?.[cibleType]?.id || data?.document?.id || req.params?.id || null;
        logActivity({
          userId: req.user?.id,
          action,
          cibleType,
          cibleId: parseInt(cibleId) || null,
          description: typeof getDescription === 'function' ? getDescription(req, data) : getDescription,
          details: { method: req.method, path: req.path },
          req,
        });
      }
      return originalJson(data);
    };
    next();
  };
}

module.exports = { logActivity, activityMiddleware };
