function auditContext(req, res, next) {
  req.audit_user = req.headers['x-user-id'] || 'anonymous';
  next();
}

module.exports = auditContext;
