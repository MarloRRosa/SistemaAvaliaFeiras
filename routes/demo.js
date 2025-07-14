// routes/demo.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

const Usuario = require('../models/Usuario');
const Escola = require('../models/Escola');
const Feira = require('../models/Feira');
const Categoria = require('../models/Categoria');
const Criterio = require('../models/Criterio');
const Projeto = require('../models/Projeto');
const Avaliador = require('../models/Avaliador');
const Avaliacao = require('../models/Avaliacao');

function gerarNotaAleatoria() {
  return Math.floor(Math.random() * 3) + 3; // entre 3 e 5
}

router.get('/login/demo', async (req, res) => {
  try {
    const demoEmail = 'demo@seudominio.com';
    const escolaDemo = await Escola.findOneAndDelete({ nome: 'Escola Demonstração GPT' });
    const usuarioDemo = await Usuario.findOneAndDelete({ email: demoEmail });


    // Criar avaliações para metade dos projetos
    for (let i = 0; i < 3; i++) {
      const projeto = projetos[i];
      for (const avaliador of avaliadores) {
        if (avaliador.projetosAtribuidos.includes(projeto._id)) {
          await Avaliacao.create({
            projeto: projeto._id,
            avaliador: avaliador._id,
            escolaId: escola._id,
            feira: feira._id,
            notas: criterios.map(c => ({ criterio: c._id, nota: gerarNotaAleatoria() }))
          });
        }
      }
    }

    const senha = await bcrypt.hash('demo123', 10);
    const usuario = await Usuario.create({
      nome: 'Usuário Demo',
      email: demoEmail,
      senha: senha,
      tipo: 'demo',
      ativo: true,
      escolaId: escola._id
    });

    req.session.adminEscola = {
      _id: usuario._id,
      nome: usuario.nome,
      escolaId: escola._id
    };

    res.redirect('/admin/dashboard');
  } catch (err) {
    console.error('Erro no login demo:', err);
    res.redirect('/?erro=Erro ao iniciar modo demonstração');
  }
});

module.exports = router;
