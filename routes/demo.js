const express = require('express');
const router = express.Router();
const Usuario = require('../models/Usuario');
const Escola = require('../models/Escola');
const bcrypt = require('bcrypt');

// Rota de login rápido para demonstração
router.get('/login/demo', async (req, res) => {
  try {
    // Verifica se a escola demo já existe
    let escolaDemo = await Escola.findOne({ nome: 'Escola Demonstração' });
    if (!escolaDemo) {
      escolaDemo = await Escola.create({
        nome: 'Escola Demonstração',
        endereco: 'Rua Exemplo, 123',
        telefone: '(51) 99999-0000',
        email: 'escolademo@seudominio.com',
        descricao: 'Esta é uma escola de demonstração para testes.',
        diretor: 'Diretor Demo',
        responsavel: 'Responsável Demo'
      });
    }

    // Verifica se o usuário demo já existe
    let demoUser = await Usuario.findOne({ email: 'demo@seudominio.com' });

    if (!demoUser) {
      const senhaCriptografada = await bcrypt.hash('demo123', 10);
      demoUser = await Usuario.create({
        nome: 'Usuário Demonstração',
        email: 'demo@seudominio.com',
        senha: senhaCriptografada,
        tipo: 'admin',
        ativo: true,
        escolaId: escolaDemo._id
      });
      console.log('✅ Usuário demo criado automaticamente.');
    }

    // Preenche sessão como um admin de escola válido
    req.session.adminEscola = {
      _id: demoUser._id,
      nome: demoUser.nome,
      email: demoUser.email,
      escolaId: escolaDemo._id
    };

    res.redirect('/admin/dashboard');
  } catch (err) {
    console.error('❌ Erro no login demo:', err);
    res.redirect('/admin/login?erro=Erro ao iniciar modo demonstração');
  }
});

module.exports = router;
