// routes/demo.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const Usuario = require('../models/Usuario');
const Escola = require('../models/Escola');
const Feira = require('../models/Feira');
const Categoria = require('../models/Categoria');
const Criterio = require('../models/Criterio');
const Projeto = require('../models/Projeto');
const Avaliador = require('../models/Avaliador');

// Rota para login automático da demonstração
router.get('/login/demo', async (req, res) => {
  try {
    // 1. Criar ou encontrar escola demo
    let escolaDemo = await Escola.findOne({ nome: 'Escola de Demonstração' });
    if (!escolaDemo) {
      escolaDemo = await Escola.create({
        nome: 'Escola de Demonstração',
        endereco: 'Rua Exemplo, 123',
        telefone: '(00) 0000-0000',
        email: 'demo@escola.com',
        descricao: 'Instituição fictícia para demonstrações.',
        diretor: 'Diretor Exemplo',
        responsavel: 'Responsável Exemplo'
      });
    }

    // 2. Criar ou encontrar usuário demo
    let demoUser = await Usuario.findOne({ email: 'demo@seudominio.com' });
    if (!demoUser) {
      const senhaCriptografada = await bcrypt.hash('demo123', 10);
      demoUser = await Usuario.create({
        nome: 'Usuário Demonstração',
        email: 'demo@seudominio.com',
        senha: senhaCriptografada,
        tipo: 'adminEscola',
        ativo: true,
        escolaId: escolaDemo._id
      });
    }

    // 3. Criar feira ativa se não existir
    let feiraDemo = await Feira.findOne({ status: 'ativa', escolaId: escolaDemo._id });
    if (!feiraDemo) {
      feiraDemo = await Feira.create({
        nomeFeira: 'Feira de Demonstração',
        inicioFeira: new Date(),
        fimFeira: new Date(),
        status: 'ativa',
        escolaId: escolaDemo._id
      });
    }

    // 4. Criar categorias e critérios se não existirem
    const categoriasExistem = await Categoria.exists({ feira: feiraDemo._id });
    if (!categoriasExistem) {
      await Categoria.insertMany([
        { nome: 'Ciências', escolaId: escolaDemo._id, feira: feiraDemo._id },
        { nome: 'Tecnologia', escolaId: escolaDemo._id, feira: feiraDemo._id }
      ]);
    }

    const criteriosExistem = await Criterio.exists({ feira: feiraDemo._id });
    if (!criteriosExistem) {
      await Criterio.insertMany([
        { nome: 'Clareza', peso: 2, ordemDesempate: 1, escolaId: escolaDemo._id, feira: feiraDemo._id },
        { nome: 'Criatividade', peso: 3, ordemDesempate: 2, escolaId: escolaDemo._id, feira: feiraDemo._id },
        { nome: 'Viabilidade', peso: 1, ordemDesempate: 0, escolaId: escolaDemo._id, feira: feiraDemo._id }
      ]);
    }

    // 5. Criar projetos demo se não existirem
    const projetosExistem = await Projeto.exists({ feira: feiraDemo._id });
    if (!projetosExistem) {
      const categorias = await Categoria.find({ feira: feiraDemo._id });
      const criterios = await Criterio.find({ feira: feiraDemo._id });
      await Projeto.insertMany([
        {
          titulo: 'Projeto Solar',
          categoria: categorias[0]._id,
          criterios: criterios.map(c => c._id),
          escolaId: escolaDemo._id,
          feira: feiraDemo._id
        },
        {
          titulo: 'Robô Catador',
          categoria: categorias[1]._id,
          criterios: criterios.map(c => c._id),
          escolaId: escolaDemo._id,
          feira: feiraDemo._id
        }
      ]);
    }

    // 6. Criar avaliador demo
    const avaliadorExiste = await Avaliador.findOne({ email: 'avaliador@demo.com' });
    if (!avaliadorExiste) {
      const projetos = await Projeto.find({ feira: feiraDemo._id });
      await Avaliador.create({
        nome: 'Avaliador Demo',
        email: 'avaliador@demo.com',
        senha: await bcrypt.hash('demo123', 10),
        escolaId: escolaDemo._id,
        feira: feiraDemo._id,
        projetosAtribuidos: projetos.map(p => p._id)
      });
    }

    // 7. Salva sessão e redireciona
    req.session.adminEscola = {
      _id: demoUser._id,
      nome: demoUser.nome,
      escolaId: escolaDemo._id
    };

    res.redirect('/admin/dashboard');
  } catch (err) {
    console.error('Erro no login demo:', err);
    res.redirect('/?erro=Erro ao iniciar demonstração');
  }
});

module.exports = router;
