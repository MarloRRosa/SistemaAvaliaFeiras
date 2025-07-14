const express = require('express');
const router = express.Router();
const Usuario = require('../models/Usuario');
const bcrypt = require('bcrypt');

router.get('/login/demo', async (req, res) => {
  try {
    // Verifica se já existe o usuário demo
    let demoUser = await Usuario.findOne({ email: 'demo@seudominio.com' });

    // Se não existir, cria automaticamente com senha "demo123"
    if (!demoUser) {
      const senhaCriptografada = await bcrypt.hash('demo123', 10);
      demoUser = await Usuario.create({
        nome: 'Usuário Demonstração',
        email: 'demo@seudominio.com',
        senha: senhaCriptografada,
        tipo: 'demo',
        ativo: true
      });
      console.log('Usuário demo criado automaticamente.');
    }

    req.session.adminEscola = demoUser;
    res.redirect('/admin/dashboard');

  } catch (err) {
    console.error('Erro no login demo:', err);
    res.redirect('/admin/login?erro=Erro ao iniciar modo demonstração');
  }
});

module.exports = router;
