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

    // Limpa escola demo anterior (se existir)
    const escolaAntiga = await Escola.findOne({ nome: 'Escola Demonstração GPT' });

    if (escolaAntiga) {
      const escolaId = escolaAntiga._id;
      await Promise.all([
        Usuario.deleteMany({ escolaId }),
        Feira.deleteMany({ escolaId }),
        Categoria.deleteMany({ escolaId }),
        Criterio.deleteMany({ escolaId }),
        Projeto.deleteMany({ escolaId }),
        Avaliador.deleteMany({ escolaId }),
        Avaliacao.deleteMany({ escolaId }),
        Escola.deleteOne({ _id: escolaId })
      ]);
    }

    // Criação da nova escola demo
    const escola = await Escola.create({
      nome: 'Escola Demonstração GPT',
      endereco: 'Rua Exemplo, 123',
      telefone: '(00) 0000-0000',
      email: 'escola@gptdemo.com',
      descricao: 'Uma escola exemplo para demonstração do sistema.',
      diretor: 'Diretora Demo',
      responsavel: 'Responsável Demo',
      tipo: 'demo'
    });

    const feira = await Feira.create({
      nome: 'Feira de Ciências Demo',
      inicioFeira: new Date(),
      fimFeira: new Date(Date.now() + 86400000),
      status: 'ativa',
      escolaId: escola._id
    });

    const criterios = await Criterio.insertMany([
      { nome: 'METODOLOGIA', peso: 1, observacoes: 'Apresentou caráter investigativo...', ordemDesempate: 3, feira: feira._id, escolaId: escola._id },
      { nome: 'DOCUMENTOS', peso: 1, observacoes: 'Relatório de Pesquisa, Caderno...', ordemDesempate: 1, feira: feira._id, escolaId: escola._id },
      { nome: 'APRESENTAÇÃO VISUAL', peso: 1, observacoes: 'O espaço destinado à apresentação...', ordemDesempate: 2, feira: feira._id, escolaId: escola._id },
      { nome: 'APRESENTAÇÃO ORAL', peso: 1, observacoes: 'O grupo demonstrou domínio...', ordemDesempate: 4, feira: feira._id, escolaId: escola._id },
      { nome: 'RELEVÂNCIA', peso: 1, observacoes: 'A pesquisa representou uma contribuição...', ordemDesempate: 5, feira: feira._id, escolaId: escola._id },
    ]);

    const categorias = await Categoria.insertMany([
      { nome: 'Categoria 1', descricao: 'Projetos da categoria 1', feira: feira._id, escolaId: escola._id },
      { nome: 'Categoria 2', descricao: 'Projetos da categoria 2', feira: feira._id, escolaId: escola._id },
    ]);

    const projetos = await Projeto.insertMany([
      { titulo: 'Projeto A', alunos: ['Ana', 'Carlos'], categoria: categorias[0]._id, criterios: criterios.map(c => c._id), feira: feira._id, escolaId: escola._id },
      { titulo: 'Projeto B', alunos: ['Beatriz'], categoria: categorias[0]._id, criterios: criterios.map(c => c._id), feira: feira._id, escolaId: escola._id },
      { titulo: 'Projeto C', alunos: ['Caio', 'Joana'], categoria: categorias[0]._id, criterios: criterios.map(c => c._id), feira: feira._id, escolaId: escola._id },
      { titulo: 'Projeto D', alunos: ['Diego'], categoria: categorias[1]._id, criterios: criterios.map(c => c._id), feira: feira._id, escolaId: escola._id },
      { titulo: 'Projeto E', alunos: ['Elisa', 'Renan'], categoria: categorias[1]._id, criterios: criterios.map(c => c._id), feira: feira._id, escolaId: escola._id },
      { titulo: 'Projeto F', alunos: ['Fábio'], categoria: categorias[1]._id, criterios: criterios.map(c => c._id), feira: feira._id, escolaId: escola._id },
    ]);

    const avaliadores = await Avaliador.insertMany([
      { nome: 'Avaliador 1', email: 'avaliador1@demo.com', pin: '1111', projetosAtribuidos: [projetos[0]._id, projetos[3]._id], escolaId: escola._id, feira: feira._id },
      { nome: 'Avaliador 2', email: 'avaliador2@demo.com', pin: '2222', projetosAtribuidos: [projetos[1]._id, projetos[4]._id], escolaId: escola._id, feira: feira._id },
      { nome: 'Avaliador 3', email: 'avaliador3@demo.com', pin: '3333', projetosAtribuidos: [projetos[2]._id, projetos[5]._id], escolaId: escola._id, feira: feira._id },
    ]);

    // Criar avaliações automáticas para 3 projetos
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
      senha,
      tipo: 'demo',
      ativo: true,
      escolaId: escola._id
    });

    req.session.adminEscola = {
      _id: usuario._id,
      nome: usuario.nome,
      escolaId: escola._id,
      role: 'admin'
    };

    res.redirect('/admin/dashboard');
  } catch (err) {
    console.error('Erro no login demo:', err);
    res.redirect('/?erro=Erro ao iniciar modo demonstração');
  }
});

module.exports = router;
