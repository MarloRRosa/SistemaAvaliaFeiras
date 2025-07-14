function bloqueiaDemo(req, res, next) {
  if (req.session?.usuario?.email === 'demo@seudominio.com') {
    return res.status(403).send('Ação bloqueada no modo demonstração.');
  }
  next();
}

module.exports = bloqueiaDemo;
