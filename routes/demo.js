
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

const DEMO_EMAIL = 'demo@seudominio.com';
const DEMO_ESCOLA = 'Escola Demonstração';

const DEMO_AVALIADORES = [
  { nome: 'Avaliador 1', email: 'avaliador1@demo.com', pin: '1111' },
  { nome: 'Avaliador 2', email: 'avaliador2@demo.com', pin: '2222' },
  { nome: 'Avaliador 3', email: 'avaliador3@demo.com', pin: '3333' }
];

// Proteção contra duas inicializações simultâneas.
const LOCK_ID = 'avaliacoes-demo-inicializacao';
const LOCK_TTL = 5 * 60 * 1000;

function aguardar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function adquirirBloqueio(owner) {
  const locks = mongoose.connection.collection('demo_locks');

  for (let i = 0; i < 30; i++) {
    const agora = new Date();

    try {
      await locks.findOneAndUpdate(
        {
          _id: LOCK_ID,
          $or: [
            { expiresAt: { $lte: agora } },
            { expiresAt: { $exists: false } }
          ]
        },
        {
          $set: {
            owner,
            expiresAt: new Date(agora.getTime() + LOCK_TTL)
          }
        },
        { upsert: true, returnDocument: 'after' }
      );

      return true;
    } catch (err) {
      if (err.code !== 11000) throw err;
      await aguardar(1000);
    }
  }

  return false;
}

async function liberarBloqueio(owner) {
  await mongoose.connection
    .collection('demo_locks')
    .deleteOne({ _id: LOCK_ID, owner });
}

// =====================================================
// LIMPEZA COMPLETA DOS DADOS DA DEMONSTRAÇÃO
// =====================================================

async function limparDadosDemo() {
  console.log('Iniciando limpeza dos dados demo...');

  // Localiza TODAS as escolas de demonstração.
  const escolas = await Escola.find({
    nome: DEMO_ESCOLA
  }).select('_id').lean();

  const escolaIds = escolas.map(e => e._id);

  // Localiza avaliadores demo pelo e-mail OU pela escola.
  // Isso também encontra avaliadores que ficaram órfãos.
  const filtroAvaliadores = {
    $or: [
      {
        email: {
          $in: DEMO_AVALIADORES.map(a => a.email)
        }
      },
      ...(escolaIds.length
        ? [{ escolaId: { $in: escolaIds } }]
        : [])
    ]
  };

  const avaliadores = await Avaliador.find(filtroAvaliadores)
    .select('_id')
    .lean();

  const avaliadorIds = avaliadores.map(a => a._id);

  // Localiza projetos e feiras das escolas demo.
  const projetos = escolaIds.length
    ? await Projeto.find({ escolaId: { $in: escolaIds } })
        .select('_id').lean()
    : [];

  const feiras = escolaIds.length
    ? await Feira.find({ escolaId: { $in: escolaIds } })
        .select('_id').lean()
    : [];

  const projetoIds = projetos.map(p => p._id);
  const feiraIds = feiras.map(f => f._id);

  // Exclui avaliações antes dos registros relacionados.
  const filtrosAvaliacoes = [];

  if (escolaIds.length) {
    filtrosAvaliacoes.push({
      escolaId: { $in: escolaIds }
    });
  }

  if (avaliadorIds.length) {
    filtrosAvaliacoes.push({
      avaliador: { $in: avaliadorIds }
    });
  }

  if (projetoIds.length) {
    filtrosAvaliacoes.push({
      projeto: { $in: projetoIds }
    });
  }

  if (feiraIds.length) {
    filtrosAvaliacoes.push({
      feira: { $in: feiraIds }
    });
  }

  if (filtrosAvaliacoes.length) {
    await Avaliacao.deleteMany({
      $or: filtrosAvaliacoes
    });
  }

  // Exclui avaliadores, inclusive os órfãos.
  await Avaliador.deleteMany(filtroAvaliadores);

  // Exclui os demais dados vinculados às escolas demo.
  if (escolaIds.length) {
    await Promise.all([
      Projeto.deleteMany({ escolaId: { $in: escolaIds } }),
      Categoria.deleteMany({ escolaId: { $in: escolaIds } }),
      Criterio.deleteMany({ escolaId: { $in: escolaIds } }),
      Feira.deleteMany({ escolaId: { $in: escolaIds } }),
      Escola.deleteMany({ _id: { $in: escolaIds } })
    ]);
  }

  // Exclui a conta administrativa exclusiva da demonstração.
  await Usuario.deleteMany({ email: DEMO_EMAIL });

  console.log('Limpeza dos dados demo concluída.');
}

// =====================================================
// CRIAÇÃO DA DEMONSTRAÇÃO
// =====================================================

function gerarNotaAleatoria() {
  return Math.floor(Math.random() * 6) + 5;
}

async function criarDemonstracao() {

  // Verifica se algum PIN reservado está sendo utilizado
  // por um avaliador que não foi identificado como demo.
  const pinos = DEMO_AVALIADORES.map(a => a.pin);

  const conflito = await Avaliador.findOne({
    pin: { $in: pinos }
  }).select('pin email').lean();

  if (conflito) {
    throw new Error(
      `PIN ${conflito.pin} já pertence a outro avaliador. ` +
      'Verifique o registro antes de prosseguir.'
    );
  }

  // Cria escola usando somente campos existentes no model.
  const escola = await Escola.create({
    nome: DEMO_ESCOLA,
    endereco: 'Rua Exemplo, 123',
    telefone: '(00) 0000-0000',
    nomeFeira: 'Feira de Ciências Demo',
    inicioFeira: new Date(),
    fimFeira: new Date(Date.now() + 86400000),
    status: 'ativa'
  });

  const feira = await Feira.create({
    nome: 'Feira de Ciências Demo',
    inicioFeira: new Date(),
    fimFeira: new Date(Date.now() + 86400000),
    status: 'ativa',
    escolaId: escola._id
  });

  // Critérios
  const criterios = await Criterio.insertMany([
    { nome: 'METODOLOGIA', peso: 1, observacao: 'Apresentou caráter investigativo...', ordemDesempate: 3, feira: feira._id, escolaId: escola._id },
    { nome: 'DOCUMENTOS', peso: 1, observacao: 'Relatório de Pesquisa, Caderno...', ordemDesempate: 1, feira: feira._id, escolaId: escola._id },
    { nome: 'APRESENTAÇÃO VISUAL', peso: 1, observacao: 'O espaço destinado à apresentação...', ordemDesempate: 2, feira: feira._id, escolaId: escola._id },
    { nome: 'APRESENTAÇÃO ORAL', peso: 1, observacao: 'O grupo demonstrou domínio...', ordemDesempate: 4, feira: feira._id, escolaId: escola._id },
    { nome: 'RELEVÂNCIA', peso: 1, observacao: 'A pesquisa representou uma contribuição...', ordemDesempate: 5, feira: feira._id, escolaId: escola._id }
  ]);

  // Categorias
  const categorias = await Categoria.insertMany([
    { nome: 'Categoria 1', feira: feira._id, escolaId: escola._id },
    { nome: 'Categoria 2', feira: feira._id, escolaId: escola._id }
  ]);

  // Projetos
  const projetos = await Projeto.insertMany([
    { titulo: 'Projeto A', alunos: ['Ana', 'Carlos'], orientador: 'Prof. A', categoria: categorias[0]._id, criterios: criterios.map(c => c._id), feira: feira._id, escolaId: escola._id },
    { titulo: 'Projeto B', alunos: ['Beatriz'], orientador: 'Prof. B', categoria: categorias[0]._id, criterios: criterios.map(c => c._id), feira: feira._id, escolaId: escola._id },
    { titulo: 'Projeto C', alunos: ['Caio', 'Joana'], orientador: 'Prof. C', categoria: categorias[0]._id, criterios: criterios.map(c => c._id), feira: feira._id, escolaId: escola._id },
    { titulo: 'Projeto D', alunos: ['Diego'], orientador: 'Prof. D', categoria: categorias[1]._id, criterios: criterios.map(c => c._id), feira: feira._id, escolaId: escola._id },
    { titulo: 'Projeto E', alunos: ['Elisa', 'Renan'], orientador: 'Prof. E', categoria: categorias[1]._id, criterios: criterios.map(c => c._id), feira: feira._id, escolaId: escola._id },
    { titulo: 'Projeto F', alunos: ['Fábio'], orientador: 'Prof. F', categoria: categorias[1]._id, criterios: criterios.map(c => c._id), feira: feira._id, escolaId: escola._id }
  ]);

  // Avaliadores
  const avaliadores = await Avaliador.insertMany([
    {
      ...DEMO_AVALIADORES[0],
      projetosAtribuidos: [projetos[0]._id, projetos[3]._id],
      escolaId: escola._id,
      feira: feira._id
    },
    {
      ...DEMO_AVALIADORES[1],
      projetosAtribuidos: [projetos[1]._id, projetos[4]._id],
      escolaId: escola._id,
      feira: feira._id
    },
    {
      ...DEMO_AVALIADORES[2],
      projetosAtribuidos: [projetos[2]._id, projetos[5]._id],
      escolaId: escola._id,
      feira: feira._id
    }
  ]);

  // Avaliações automáticas para os três primeiros projetos.
  for (let i = 0; i < 3; i++) {
    const projeto = projetos[i];

    for (const avaliador of avaliadores) {
      if (avaliador.projetosAtribuidos.some(
        id => id.equals(projeto._id)
      )) {
        await Avaliacao.create({
          projeto: projeto._id,
          avaliador: avaliador._id,
          escolaId: escola._id,
          feira: feira._id,
          itens: criterios.map(c => ({
            criterio: c._id,
            nota: gerarNotaAleatoria()
          }))
        });
      }
    }
  }

  // Usuário administrador demo.
  const senha = await bcrypt.hash('demo123', 10);

  const usuario = await Usuario.create({
    nome: 'Usuário Demo',
    email: DEMO_EMAIL,
    senha,
    tipo: 'demo',
    ativo: true
  });

  return { escola, usuario };
}

// =====================================================
// ROTA DE LOGIN DEMO
// =====================================================

router.get('/login/demo', async (req, res) => {
  const owner = new mongoose.Types.ObjectId().toString();
  let bloqueioAdquirido = false;

  try {
    bloqueioAdquirido = await adquirirBloqueio(owner);

    if (!bloqueioAdquirido) {
      return res.redirect(
        '/?erro=Demonstração em preparação. Tente novamente.'
      );
    }

    await limparDadosDemo();

    const { escola, usuario } = await criarDemonstracao();

    req.session.adminEscola = {
      _id: usuario._id,
      nome: usuario.nome,
      escolaId: escola._id,
      role: 'admin'
    };

    return res.redirect('/admin/dashboard');

  } catch (err) {
    console.error('Erro no login demo:', err);

    return res.redirect(
      '/?erro=Erro ao iniciar modo demonstração'
    );

  } finally {
    if (bloqueioAdquirido) {
      try {
        await liberarBloqueio(owner);
      } catch (err) {
        console.error('Erro ao liberar bloqueio demo:', err);
      }
    }
  }
});

module.exports = router;
