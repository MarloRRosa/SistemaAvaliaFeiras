function verificarAdminEscola(req, res, next) {
  if (req.session && req.session.adminEscola) {
    return next();
  }
  req.flash('error_msg', 'Acesso restrito.');
  res.redirect('/login');
}

function verificarSuperAdmin(req, res, next) {
  if (req.session && req.session.superadmin) {
    return next();
  }
  req.flash('error_msg', 'Acesso restrito.');
  res.redirect('/login');
}

module.exports = {
  verificarAdminEscola,
  verificarSuperAdmin
};
