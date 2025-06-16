// routes/admin.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose'); // Importar mongoose para validação de ObjectId

// Importações dos modelos, garantindo que sejam carregados corretamente
const Escola = require('../models/Escola');
const Feira = require('../models/Feira');
const Projeto = require('../models/Projeto');
const Categoria = require('../models/Categoria');
const Criterio = require('../models/Criterio');
const Avaliador = require('../models/Avaliador');
const Avaliacao = require('../models/Avaliacao');
const Admin = require('../models/Admin'); // Modelo Admin para usuários do painel

const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const puppeteer = require('puppeteer');
const chromium = require('@sparticuz/chromium'); // Para uso em ambientes serverless como Vercel
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

// Carrega variáveis de ambiente
require('dotenv').config();

// ===========================================
// MIDDLEWARE DE AUTENTICAÇÃO E AUTORIZAÇÃO
// ===========================================

// Middleware para verificar se o usuário está logado como admin da escola
function verificarAdminEscola(req, res, next) {
    if (req.session && req.session.adminEscola) {
        // Se a rota for para o dashboard principal e não tiver feiraId, redireciona para selecionar
        if (req.path === '/dashboard' && !req.query.feiraId && !req.session.adminEscola.feiraAtualId) {
            // Permite que a página de dashboard carregue, mas sem uma feira ativa
            return next();
        }
        return next();
    }
    req.flash('error_msg', 'Você não tem permissão para acessar esta área. Faça login como administrador da escola.');
    res.redirect('/admin/login');
}

// Middleware para verificar se o usuário é um super admin (admin@admin.com)
function verificarSuperAdmin(req, res, next) {
    if (req.session && req.session.adminEscola && req.session.adminEscola.email === 'admin@admin.com') {
        return next();
    }
    req.flash('error_msg', 'Você não tem permissão para realizar esta ação.');
    res.redirect('/admin/dashboard');
}

// ===========================================
// FUNÇÕES AUXILIARES
// ===========================================

// Função para gerar PIN alfanumérico único
function generateUniquePin(length = 6) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

// ===========================================
// ROTAS DE AUTENTICAÇÃO
// ===========================================

// GET /admin/login - Exibir formulário de login
router.get('/login', (req, res) => {
    res.render('admin/login', { layout: 'login' });
});

// POST /admin/login - Processar login
router.post('/login', async (req, res) => {
    const { email, senha } = req.body;

    try {
        const admin = await Admin.findOne({ email: email });

        if (!admin) {
            req.flash('error_msg', 'Email ou senha inválidos.');
            return res.redirect('/admin/login');
        }

        const isMatch = await bcrypt.compare(senha, admin.senha);

        if (!isMatch) {
            req.flash('error_msg', 'Email ou senha inválidos.');
            return res.redirect('/admin/login');
        }

        req.session.adminEscola = {
            id: admin._id,
            nome: admin.nome,
            email: admin.email,
            escolaId: admin.escolaId,
            isAdmin: admin.isAdmin,
            feiraAtualId: admin.feiraAtualId // Adicionar feiraAtualId à sessão
        };

        req.flash('success_msg', `Bem-vindo, ${admin.nome}!`);
        res.redirect('/admin/dashboard');

    } catch (err) {
        console.error('Erro no login do administrador:', err);
        req.flash('error_msg', 'Erro interno do servidor.');
        res.redirect('/admin/login');
    }
});

// POST /admin/logout - Fazer logout
router.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Erro ao destruir sessão:', err);
            return res.status(500).send('Erro ao fazer logout.');
        }
        res.redirect('/admin/login');
    });
});

// ===========================================
// ROTAS DO DASHBOARD E SELEÇÃO DE FEIRA
// ===========================================

// GET /admin/dashboard - Exibir dashboard
router.get('/dashboard', verificarAdminEscola, async (req, res) => {
    const escolaId = req.session.adminEscola.escolaId;
    let feiraAtual = null;
    let projetos = [];
    let categorias = [];
    let criterios = [];
    let avaliadores = [];
    let avaliacoes = [];
    let feiras = [];
    let escolas = []; // Para a lista de escolas se necessário

    let totalProjetos = 0;
    let totalAvaliadores = 0;
    let projetosAvaliadosCompletosCount = 0;
    let projetosPendentesAvaliacaoCount = 0;
    let mediaGeralAvaliacoes = 'N/A';
    let projetosPorCategoria = {};
    let relatorioFinalPorProjeto = {};

    try {
        feiras = await Feira.find({ escolaId: escolaId }).sort({ inicioFeira: -1 });

        // Tenta pegar a feira da query string primeiro
        const feiraSelecionadaId = req.query.feiraId;
        if (feiraSelecionadaId && mongoose.Types.ObjectId.isValid(feiraSelecionadaId)) {
            feiraAtual = await Feira.findOne({ _id: feiraSelecionadaId, escolaId: escolaId });
            if (feiraAtual) {
                // Se uma feira válida foi selecionada, atualiza a sessão
                req.session.adminEscola.feiraAtualId = feiraAtual._id;
            } else {
                req.flash('error_msg', 'Feira selecionada não encontrada ou não pertence à sua escola.');
                // Tenta carregar a feira salva na sessão se a selecionada for inválida
                if (req.session.adminEscola.feiraAtualId && mongoose.Types.ObjectId.isValid(req.session.adminEscola.feiraAtualId)) {
                    feiraAtual = await Feira.findOne({ _id: req.session.adminEscola.feiraAtualId, escolaId: escolaId });
                }
            }
        } else if (req.session.adminEscola.feiraAtualId && mongoose.Types.ObjectId.isValid(req.session.adminEscola.feiraAtualId)) {
            // Se não houver feira na query, tenta carregar a feira salva na sessão
            feiraAtual = await Feira.findOne({ _id: req.session.adminEscola.feiraAtualId, escolaId: escolaId });
        }

        // Se ainda não tiver uma feira atual, tenta pegar a primeira ativa ou mais recente
        if (!feiraAtual && feiras.length > 0) {
            feiraAtual = feiras.find(f => f.status === 'ativa') || feiras[0];
            if (feiraAtual) {
                req.session.adminEscola.feiraAtualId = feiraAtual._id;
            }
        }

        if (feiraAtual) {
            // Carrega dados específicos da feira atual
            projetos = await Projeto.find({ feiraId: feiraAtual._id, escolaId: escolaId }).populate('categoria').populate('criterios');
            categorias = await Categoria.find({ feiraId: feiraAtual._id, escolaId: escolaId });
            criterios = await Criterio.find({ feiraId: feiraAtual._id, escolaId: escolaId });
            avaliadores = await Avaliador.find({ feiraId: feiraAtual._id, escolaId: escolaId }).populate('projetosAtribuidos');
            avaliacoes = await Avaliacao.find({ feiraId: feiraAtual._id, escolaId: escolaId }).populate('projeto').populate('avaliador').populate('criteriosAvaliacao.criterio');
            
            // Re-organizar projetos por categoria para o dashboard
            projetosPorCategoria = categorias.reduce((acc, cat) => {
                acc[cat.nome] = projetos.filter(p => p.categoria && p.categoria._id.equals(cat._id));
                return acc;
            }, {});

            // === Cálculo de Métricas para o Dashboard Geral ===
            totalProjetos = projetos.length;
            totalAvaliadores = avaliadores.length;

            let avaliacoesPorProjeto = {};
            avaliacoes.forEach(avaliacao => {
                if (!avaliacoesPorProjeto[avaliacao.projeto._id]) {
                    avaliacoesPorProjeto[avaliacao.projeto._id] = [];
                }
                avaliacoesPorProjeto[avaliacao.projeto._id].push(avaliacao);
            });

            projetosAvaliadosCompletosCount = projetos.filter(p => {
                const numAvaliadoresAtribuidos = avaliadores.filter(a =>
                    a.projetosAtribuidos.some(pa => pa._id.equals(p._id))
                ).length;
                const numAvaliacoesRecebidas = (avaliacoesPorProjeto[p._id] || []).length;
                return numAvaliacoesRecebidas >= numAvaliadoresAtribuidos && numAvaliadoresAtribuidos > 0;
            }).length;

            projetosPendentesAvaliacaoCount = totalProjetos - projetosAvaliadosCompletosCount;

            let somaTotalNotas = 0;
            let totalCriteriosAvaliados = 0;

            relatorioFinalPorProjeto = {}; // Reset para a feira atual

            for (const projeto of projetos) {
                const avaliacoesDoProjeto = avaliacoes.filter(a => a.projeto && a.projeto._id.equals(projeto._id));
                const criteriosOficiais = await Criterio.find({ feiraId: feiraAtual._id, escolaId: escolaId });

                let notasPorCriterio = {};
                criteriosOficiais.forEach(c => notasPorCriterio[c._id.toString()] = { total: 0, count: 0, nome: c.nome, peso: c.peso });

                avaliacoesDoProjeto.forEach(avaliacao => {
                    avaliacao.criteriosAvaliacao.forEach(ca => {
                        const criterioId = ca.criterio._id.toString();
                        if (notasPorCriterio[criterioId]) {
                            notasPorCriterio[criterioId].total += ca.nota;
                            notasPorCriterio[criterioId].count++;
                            somaTotalNotas += ca.nota; // Para média geral
                            totalCriteriosAvaliados++; // Para média geral
                        }
                    });
                });

                let mediaPonderadaProjeto = 0;
                let somaPesos = 0;
                let detalhesCriterios = [];

                criteriosOficiais.forEach(criterio => {
                    const criterioStats = notasPorCriterio[criterio._id.toString()];
                    let mediaCriterio = criterioStats.count > 0 ? criterioStats.total / criterioStats.count : 0;
                    mediaPonderadaProjeto += mediaCriterio * criterio.peso;
                    somaPesos += criterio.peso;
                    detalhesCriterios.push({
                        nome: criterio.nome,
                        peso: criterio.peso,
                        media: mediaCriterio.toFixed(2),
                        observacoes: criterioStats.observacoes // Se você adicionar observações específicas por critério na avaliação
                    });
                });

                const notaFinalProjeto = somaPesos > 0 ? (mediaPonderadaProjeto / somaPesos) : 0;

                relatorioFinalPorProjeto[projeto._id] = {
                    projeto: projeto,
                    notaFinal: notaFinalProjeto.toFixed(2),
                    detalhesCriterios: detalhesCriterios,
                    avaliacoesIndividuais: avaliacoesDoProjeto.map(av => ({
                        avaliador: av.avaliador ? av.avaliador.nome : 'Desconhecido',
                        notaGeral: av.notaGeral, // Se tiver uma nota geral na avaliação
                        observacoes: av.observacoes,
                        criteriosAvaliados: av.criteriosAvaliacao.map(ca => ({
                            nome: ca.criterio ? ca.criterio.nome : 'Desconhecido',
                            nota: ca.nota,
                            observacao: ca.observacao
                        }))
                    }))
                };
            }

            mediaGeralAvaliacoes = totalCriteriosAvaliados > 0 ? (somaTotalNotas / totalCriteriosAvaliados).toFixed(2) : 'N/A';
        }

    } catch (err) {
        console.error('Erro ao carregar dados do dashboard:', err);
        req.flash('error_msg', 'Erro ao carregar dados do dashboard.');
        // Limpar feiraAtualId da sessão em caso de erro grave
        delete req.session.adminEscola.feiraAtualId;
    }

    res.render('admin/dashboard', {
        titulo: 'Painel Administrativo',
        layout: 'dashboard',
        activeTab: req.query.tab || 'dashboard-geral', // Manter a aba ativa após o reload
        feiraAtual: feiraAtual || {},
        feiras: feiras,
        projetos: projetos,
        categorias: categorias,
        criterios: criterios,
        avaliadores: avaliadores,
        avaliacoes: avaliacoes,
        escolas: escolas, // Passa as escolas para o EJS, mesmo que vazio por enquanto
        totalProjetos: totalProjetos,
        totalAvaliadores: totalAvaliadores,
        projetosAvaliadosCompletosCount: projetosAvaliadosCompletosCount,
        projetosPendentesAvaliacaoCount: projetosPendentesAvaliacaoCount,
        mediaGeralAvaliacoes: mediaGeralAvaliacoes,
        projetosPorCategoria: projetosPorCategoria,
        relatorioFinalPorProjeto: relatorioFinalPorProjeto,
        usuarioLogado: req.session.adminEscola // Adicionado para verificar super admin no frontend
    });
});

// POST /admin/configurar-datas-feira - Atualiza as datas e status da feira ativa
// Esta rota está usando POST no backend e no frontend com _method=PUT.
// Se ocorrer erro, mude esta rota para router.put.
router.post('/configurar-datas-feira', verificarAdminEscola, async (req, res) => {
    const { id, inicioFeira, fimFeira, status } = req.body;
    const escolaId = req.session.adminEscola.escolaId;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        req.flash('error_msg', 'ID da feira inválido para atualização de datas e status.');
        return res.redirect('/admin/dashboard?tab=tab-configuracoes');
    }

    try {
        const updatedFeira = await Feira.findOneAndUpdate(
            { _id: id, escolaId: escolaId },
            { inicioFeira: inicioFeira || null, fimFeira: fimFeira || null, status: status },
            { new: true }
        );

        if (!updatedFeira) {
            req.flash('error_msg', 'Feira não encontrada ou você não tem permissão para atualizar suas datas e status.');
            return res.redirect('/admin/dashboard?tab=tab-configuracoes');
        }

        req.session.adminEscola.feiraAtualId = updatedFeira._id; // Garante que a sessão reflete a feira atualizada
        req.flash('success_msg', 'Datas e status da feira atualizados com sucesso!');
        res.redirect('/admin/dashboard?tab=tab-configuracoes');
    } catch (err) {
        console.error('Erro ao atualizar datas e status da feira:', err);
        req.flash('error_msg', 'Erro interno do servidor ao atualizar datas e status da feira.');
        res.redirect('/admin/dashboard?tab=tab-configuracoes');
    }
});


// ===========================================
// ROTAS DE CRUD - PROJETOS
// ===========================================

// POST /admin/projetos - Adicionar novo projeto
router.post('/projetos', verificarAdminEscola, async (req, res) => {
    const { titulo, descricao, categoria, criterios, turma, alunos } = req.body;
    const feiraId = req.session.adminEscola.feiraAtualId;
    const escolaId = req.session.adminEscola.escolaId;

    if (!feiraId) {
        req.flash('error_msg', 'Selecione uma feira ativa antes de adicionar projetos.');
        return res.redirect('/admin/dashboard?tab=projetos');
    }

    if (!titulo || !categoria) {
        req.flash('error_msg', 'Título e Categoria do projeto são obrigatórios.');
        return res.redirect('/admin/dashboard?tab=projetos');
    }

    try {
        const novoProjeto = new Projeto({
            titulo,
            descricao,
            categoria,
            criterios: Array.isArray(criterios) ? criterios : [criterios], // Garante que seja um array
            turma,
            alunos: alunos ? alunos.split(',').map(s => s.trim()) : [],
            feiraId,
            escolaId
        });

        await novoProjeto.save();
        req.flash('success_msg', 'Projeto adicionado com sucesso!');
        res.redirect('/admin/dashboard?tab=projetos');
    } catch (err) {
        console.error('Erro ao adicionar projeto:', err);
        req.flash('error_msg', 'Erro ao adicionar projeto.');
        res.redirect('/admin/dashboard?tab=projetos');
    }
});

// PUT /admin/projetos/:id - Editar projeto
router.put('/projetos/:id', verificarAdminEscola, async (req, res) => {
    const { id } = req.params;
    const { titulo, descricao, categoria, criterios, turma, alunos } = req.body;
    const feiraId = req.session.adminEscola.feiraAtualId;
    const escolaId = req.session.adminEscola.escolaId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        req.flash('error_msg', 'ID do projeto inválido.');
        return res.redirect('/admin/dashboard?tab=projetos');
    }

    if (!titulo || !categoria) {
        req.flash('error_msg', 'Título e Categoria do projeto são obrigatórios.');
        return res.redirect('/admin/dashboard?tab=projetos');
    }

    try {
        const updatedProjeto = await Projeto.findOneAndUpdate(
            { _id: id, feiraId: feiraId, escolaId: escolaId },
            {
                titulo,
                descricao,
                categoria,
                criterios: Array.isArray(criterios) ? criterios : [criterios],
                turma,
                alunos: alunos ? alunos.split(',').map(s => s.trim()) : [],
            },
            { new: true }
        );

        if (!updatedProjeto) {
            req.flash('error_msg', 'Projeto não encontrado ou você não tem permissão para editá-lo.');
            return res.redirect('/admin/dashboard?tab=projetos');
        }

        req.flash('success_msg', 'Projeto atualizado com sucesso!');
        res.redirect('/admin/dashboard?tab=projetos');
    } catch (err) {
        console.error('Erro ao editar projeto:', err);
        req.flash('error_msg', 'Erro ao editar projeto.');
        res.redirect('/admin/dashboard?tab=projetos');
    }
});

// DELETE /admin/projetos/:id - Excluir projeto
router.delete('/projetos/:id', verificarAdminEscola, async (req, res) => {
    const { id } = req.params;
    const feiraId = req.session.adminEscola.feiraAtualId;
    const escolaId = req.session.adminEscola.escolaId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        req.flash('error_msg', 'ID do projeto inválido.');
        return res.redirect('/admin/dashboard?tab=projetos');
    }

    try {
        // Remover avaliações associadas a este projeto primeiro
        await Avaliacao.deleteMany({ projeto: id, feiraId: feiraId, escolaId: escolaId });

        // Remover o projeto dos avaliadores atribuídos
        await Avaliador.updateMany(
            { projetosAtribuidos: id, feiraId: feiraId, escolaId: escolaId },
            { $pull: { projetosAtribuidos: id } }
        );

        const deletedProjeto = await Projeto.findOneAndDelete({ _id: id, feiraId: feiraId, escolaId: escolaId });

        if (!deletedProjeto) {
            req.flash('error_msg', 'Projeto não encontrado ou você não tem permissão para deletá-lo.');
            return res.redirect('/admin/dashboard?tab=projetos');
        }

        req.flash('success_msg', 'Projeto e suas avaliações associadas excluídos com sucesso!');
        res.redirect('/admin/dashboard?tab=projetos');
    } catch (err) {
        console.error('Erro ao deletar projeto:', err);
        req.flash('error_msg', 'Erro ao deletar projeto.');
        res.redirect('/admin/dashboard?tab=projetos');
    }
});

// ===========================================
// ROTAS DE CRUD - CATEGORIAS
// ===========================================

// POST /admin/categorias - Adicionar nova categoria
router.post('/categorias', verificarAdminEscola, async (req, res) => {
    const { nome } = req.body;
    const feiraId = req.session.adminEscola.feiraAtualId;
    const escolaId = req.session.adminEscola.escolaId;

    if (!feiraId) {
        req.flash('error_msg', 'Selecione uma feira ativa antes de adicionar categorias.');
        return res.redirect('/admin/dashboard?tab=categorias');
    }

    if (!nome) {
        req.flash('error_msg', 'O nome da categoria é obrigatório.');
        return res.redirect('/admin/dashboard?tab=categorias');
    }

    try {
        const novaCategoria = new Categoria({
            nome,
            feiraId,
            escolaId
        });
        await novaCategoria.save();
        req.flash('success_msg', 'Categoria adicionada com sucesso!');
        res.redirect('/admin/dashboard?tab=categorias');
    } catch (err) {
        console.error('Erro ao adicionar categoria:', err);
        req.flash('error_msg', 'Erro ao adicionar categoria.');
        res.redirect('/admin/dashboard?tab=categorias');
    }
});

// PUT /admin/categorias/:id - Editar categoria
router.put('/categorias/:id', verificarAdminEscola, async (req, res) => {
    const { id } = req.params;
    const { nome } = req.body;
    const feiraId = req.session.adminEscola.feiraAtualId;
    const escolaId = req.session.adminEscola.escolaId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        req.flash('error_msg', 'ID da categoria inválido.');
        return res.redirect('/admin/dashboard?tab=categorias');
    }

    if (!nome) {
        req.flash('error_msg', 'O nome da categoria é obrigatório.');
        return res.redirect('/admin/dashboard?tab=categorias');
    }

    try {
        const updatedCategoria = await Categoria.findOneAndUpdate(
            { _id: id, feiraId: feiraId, escolaId: escolaId },
            { nome },
            { new: true }
        );

        if (!updatedCategoria) {
            req.flash('error_msg', 'Categoria não encontrada ou você não tem permissão para editá-la.');
            return res.redirect('/admin/dashboard?tab=categorias');
        }

        req.flash('success_msg', 'Categoria atualizada com sucesso!');
        res.redirect('/admin/dashboard?tab=categorias');
    } catch (err) {
        console.error('Erro ao editar categoria:', err);
        req.flash('error_msg', 'Erro ao editar categoria.');
        res.redirect('/admin/dashboard?tab=categorias');
    }
});

// DELETE /admin/categorias/:id - Excluir categoria
router.delete('/categorias/:id', verificarAdminEscola, async (req, res) => {
    const { id } = req.params;
    const feiraId = req.session.adminEscola.feiraAtualId;
    const escolaId = req.session.adminEscola.escolaId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        req.flash('error_msg', 'ID da categoria inválido.');
        return res.redirect('/admin/dashboard?tab=categorias');
    }

    try {
        // Verificar se existem projetos associados a esta categoria
        const projetosAssociados = await Projeto.countDocuments({ categoria: id, feiraId: feiraId, escolaId: escolaId });
        if (projetosAssociados > 0) {
            req.flash('error_msg', `Não é possível excluir a categoria, pois existem ${projetosAssociados} projeto(s) associado(s) a ela.`);
            return res.redirect('/admin/dashboard?tab=categorias');
        }

        const deletedCategoria = await Categoria.findOneAndDelete({ _id: id, feiraId: feiraId, escolaId: escolaId });

        if (!deletedCategoria) {
            req.flash('error_msg', 'Categoria não encontrada ou você não tem permissão para deletá-la.');
            return res.redirect('/admin/dashboard?tab=categorias');
        }

        req.flash('success_msg', 'Categoria excluída com sucesso!');
        res.redirect('/admin/dashboard?tab=categorias');
    } catch (err) {
        console.error('Erro ao deletar categoria:', err);
        req.flash('error_msg', 'Erro ao deletar categoria.');
        res.redirect('/admin/dashboard?tab=categorias');
    }
});


// ===========================================
// ROTAS DE CRUD - CRITÉRIOS
// ===========================================

// POST /admin/criterios - Adicionar novo critério
router.post('/criterios', verificarAdminEscola, async (req, res) => {
    const { nome, peso, observacao } = req.body;
    const feiraId = req.session.adminEscola.feiraAtualId;
    const escolaId = req.session.adminEscola.escolaId;

    if (!feiraId) {
        req.flash('error_msg', 'Selecione uma feira ativa antes de adicionar critérios.');
        return res.redirect('/admin/dashboard?tab=criterios');
    }

    if (!nome || !peso) {
        req.flash('error_msg', 'Nome e Peso do critério são obrigatórios.');
        return res.redirect('/admin/dashboard?tab=criterios');
    }

    try {
        const novoCriterio = new Criterio({
            nome,
            peso,
            observacao,
            feiraId,
            escolaId
        });
        await novoCriterio.save();
        req.flash('success_msg', 'Critério adicionado com sucesso!');
        res.redirect('/admin/dashboard?tab=criterios');
    } catch (err) {
        console.error('Erro ao adicionar critério:', err);
        req.flash('error_msg', 'Erro ao adicionar critério.');
        res.redirect('/admin/dashboard?tab=criterios');
    }
});

// PUT /admin/criterios/:id - Editar critério
router.put('/criterios/:id', verificarAdminEscola, async (req, res) => {
    const { id } = req.params;
    const { nome, peso, observacao } = req.body;
    const feiraId = req.session.adminEscola.feiraAtualId;
    const escolaId = req.session.adminEscola.escolaId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        req.flash('error_msg', 'ID do critério inválido.');
        return res.redirect('/admin/dashboard?tab=criterios');
    }

    if (!nome || !peso) {
        req.flash('error_msg', 'Nome e Peso do critério são obrigatórios.');
        return res.redirect('/admin/dashboard?tab=criterios');
    }

    try {
        const updatedCriterio = await Criterio.findOneAndUpdate(
            { _id: id, feiraId: feiraId, escolaId: escolaId },
            { nome, peso, observacao },
            { new: true }
        );

        if (!updatedCriterio) {
            req.flash('error_msg', 'Critério não encontrado ou você não tem permissão para editá-lo.');
            return res.redirect('/admin/dashboard?tab=criterios');
        }

        req.flash('success_msg', 'Critério atualizado com sucesso!');
        res.redirect('/admin/dashboard?tab=criterios');
    } catch (err) {
        console.error('Erro ao editar critério:', err);
        req.flash('error_msg', 'Erro ao editar critério.');
        res.redirect('/admin/dashboard?tab=criterios');
    }
});

// DELETE /admin/criterios/:id - Excluir critério
router.delete('/criterios/:id', verificarAdminEscola, async (req, res) => {
    const { id } = req.params;
    const feiraId = req.session.adminEscola.feiraAtualId;
    const escolaId = req.session.adminEscola.escolaId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        req.flash('error_msg', 'ID do critério inválido.');
        return res.redirect('/admin/dashboard?tab=criterios');
    }

    try {
        // Verificar se o critério está sendo usado em algum projeto
        const projetosComCriterio = await Projeto.countDocuments({ criterios: id, feiraId: feiraId, escolaId: escolaId });
        if (projetosComCriterio > 0) {
            req.flash('error_msg', `Não é possível excluir o critério, pois ele está associado a ${projetosComCriterio} projeto(s).`);
            return res.redirect('/admin/dashboard?tab=criterios');
        }
        // Verificar se o critério está sendo usado em alguma avaliação
        const avaliacoesComCriterio = await Avaliacao.countDocuments({ 'criteriosAvaliacao.criterio': id, feiraId: feiraId, escolaId: escolaId });
        if (avaliacoesComCriterio > 0) {
            req.flash('error_msg', `Não é possível excluir o critério, pois ele está associado a ${avaliacoesComCriterio} avaliação(ões).`);
            return res.redirect('/admin/dashboard?tab=criterios');
        }


        const deletedCriterio = await Criterio.findOneAndDelete({ _id: id, feiraId: feiraId, escolaId: escolaId });

        if (!deletedCriterio) {
            req.flash('error_msg', 'Critério não encontrado ou você não tem permissão para deletá-lo.');
            return res.redirect('/admin/dashboard?tab=criterios');
        }

        req.flash('success_msg', 'Critério excluído com sucesso!');
        res.redirect('/admin/dashboard?tab=criterios');
    } catch (err) {
        console.error('Erro ao deletar critério:', err);
        req.flash('error_msg', 'Erro ao deletar critério.');
        res.redirect('/admin/dashboard?tab=criterios');
    }
});


// ===========================================
// ROTAS DE CRUD - AVALIADORES
// ===========================================

// POST /admin/avaliadores - Adicionar novo avaliador
router.post('/avaliadores', verificarAdminEscola, async (req, res) => {
    let { nome, email, pin, ativo, projetosAtribuidos } = req.body;
    const feiraId = req.session.adminEscola.feiraAtualId;
    const escolaId = req.session.adminEscola.escolaId;

    if (!feiraId) {
        req.flash('error_msg', 'Selecione uma feira ativa antes de adicionar avaliadores.');
        return res.redirect('/admin/dashboard?tab=avaliadores');
    }

    if (!nome || !email) {
        req.flash('error_msg', 'Nome e Email do avaliador são obrigatórios.');
        return res.redirect('/admin/dashboard?tab=avaliadores');
    }

    try {
        // Gerar PIN automaticamente se não for fornecido
        if (!pin) {
            pin = generateUniquePin(4); // PIN de 4 caracteres
        }

        // Verificar se o email já existe para a mesma escola na feira atual
        const existingAvaliador = await Avaliador.findOne({ email: email, feiraId: feiraId, escolaId: escolaId });
        if (existingAvaliador) {
            req.flash('error_msg', 'Já existe um avaliador com este email para a feira atual.');
            return res.redirect('/admin/dashboard?tab=avaliadores');
        }

        const novoAvaliador = new Avaliador({
            nome,
            email,
            pin,
            ativo: ativo === 'on' ? true : false, // Checkbox envia 'on' ou undefined
            projetosAtribuidos: Array.isArray(projetosAtribuidos) ? projetosAtribuidos : (projetosAtribuidos ? [projetosAtribuidos] : []),
            feiraId,
            escolaId
        });

        await novoAvaliador.save();
        req.flash('success_msg', 'Avaliador adicionado com sucesso!');
        res.redirect('/admin/dashboard?tab=avaliadores');
    } catch (err) {
        console.error('Erro ao adicionar avaliador:', err);
        req.flash('error_msg', 'Erro ao adicionar avaliador.');
        res.redirect('/admin/dashboard?tab=avaliadores');
    }
});

// PUT /admin/avaliadores/:id - Editar avaliador
router.put('/avaliadores/:id', verificarAdminEscola, async (req, res) => {
    const { id } = req.params;
    const { nome, email, pin, ativo, projetosAtribuidos } = req.body;
    const feiraId = req.session.adminEscola.feiraAtualId;
    const escolaId = req.session.adminEscola.escolaId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        req.flash('error_msg', 'ID do avaliador inválido.');
        return res.redirect('/admin/dashboard?tab=avaliadores');
    }

    if (!nome || !email) {
        req.flash('error_msg', 'Nome e Email do avaliador são obrigatórios.');
        return res.redirect('/admin/dashboard?tab=avaliadores');
    }

    try {
        // Verificar se o email já existe para outro avaliador (exceto o próprio) na mesma escola e feira
        const existingAvaliador = await Avaliador.findOne({ email: email, feiraId: feiraId, escolaId: escolaId, _id: { $ne: id } });
        if (existingAvaliador) {
            req.flash('error_msg', 'Já existe outro avaliador com este email para a feira atual.');
            return res.redirect('/admin/dashboard?tab=avaliadores');
        }

        const updatedAvaliador = await Avaliador.findOneAndUpdate(
            { _id: id, feiraId: feiraId, escolaId: escolaId },
            {
                nome,
                email,
                pin,
                ativo: ativo === 'on' ? true : false,
                projetosAtribuidos: Array.isArray(projetosAtribuidos) ? projetosAtribuidos : (projetosAtribuidos ? [projetosAtribuidos] : [])
            },
            { new: true }
        );

        if (!updatedAvaliador) {
            req.flash('error_msg', 'Avaliador não encontrado ou você não tem permissão para editá-lo.');
            return res.redirect('/admin/dashboard?tab=avaliadores');
        }

        req.flash('success_msg', 'Avaliador atualizado com sucesso!');
        res.redirect('/admin/dashboard?tab=avaliadores');
    } catch (err) {
        console.error('Erro ao editar avaliador:', err);
        req.flash('error_msg', 'Erro ao editar avaliador.');
        res.redirect('/admin/dashboard?tab=avaliadores');
    }
});

// DELETE /admin/avaliadores/:id - Excluir avaliador
router.delete('/avaliadores/:id', verificarAdminEscola, async (req, res) => {
    const { id } = req.params;
    const feiraId = req.session.adminEscola.feiraAtualId;
    const escolaId = req.session.adminEscola.escolaId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        req.flash('error_msg', 'ID do avaliador inválido.');
        return res.redirect('/admin/dashboard?tab=avaliadores');
    }

    try {
        // Verificar se existem avaliações associadas a este avaliador
        const avaliacoesAssociadas = await Avaliacao.countDocuments({ avaliador: id, feiraId: feiraId, escolaId: escolaId });
        if (avaliacoesAssociadas > 0) {
            req.flash('error_msg', `Não é possível excluir o avaliador, pois ele realizou ${avaliacoesAssociadas} avaliação(ões).`);
            return res.redirect('/admin/dashboard?tab=avaliadores');
        }

        const deletedAvaliador = await Avaliador.findOneAndDelete({ _id: id, feiraId: feiraId, escolaId: escolaId });

        if (!deletedAvaliador) {
            req.flash('error_msg', 'Avaliador não encontrado ou você não tem permissão para deletá-lo.');
            return res.redirect('/admin/dashboard?tab=avaliadores');
        }

        req.flash('success_msg', 'Avaliador excluído com sucesso!');
        res.redirect('/admin/dashboard?tab=avaliadores');
    } catch (err) {
        console.error('Erro ao deletar avaliador:', err);
        req.flash('error_msg', 'Erro ao deletar avaliador.');
        res.redirect('/admin/dashboard?tab=avaliadores');
    }
});


// ===========================================
// ROTAS DE CRUD - FEIRAS
// ===========================================

// POST /admin/feiras - Adicionar nova feira
router.post('/feiras', verificarAdminEscola, async (req, res) => {
    const { nome, inicioFeira, fimFeira, status } = req.body;
    const escolaId = req.session.adminEscola.escolaId;

    if (!nome) {
        req.flash('error_msg', 'O nome da feira é obrigatório.');
        return res.redirect('/admin/dashboard?tab=feiras');
    }

    try {
        const novaFeira = new Feira({
            nome,
            inicioFeira: inicioFeira || null,
            fimFeira: fimFeira || null,
            status: status || 'ativa', // Padrão 'ativa'
            escolaId
        });
        await novaFeira.save();

        // Se for a primeira feira criada, ou se o status for 'ativa', setar como feiraAtual
        if (!req.session.adminEscola.feiraAtualId || novaFeira.status === 'ativa') {
            req.session.adminEscola.feiraAtualId = novaFeira._id;
            // Atualizar também no modelo Admin para persistência
            await Admin.updateOne({ _id: req.session.adminEscola.id }, { feiraAtualId: novaFeira._id });
        }

        req.flash('success_msg', 'Feira adicionada com sucesso!');
        res.redirect('/admin/dashboard?tab=feiras');
    } catch (err) {
        console.error('Erro ao adicionar feira:', err);
        req.flash('error_msg', 'Erro ao adicionar feira.');
        res.redirect('/admin/dashboard?tab=feiras');
    }
});

// PUT /admin/feiras/:id - Editar feira
router.put('/feiras/:id', verificarAdminEscola, async (req, res) => {
    const { id } = req.params;
    const { nome, inicioFeira, fimFeira, status } = req.body;
    const escolaId = req.session.adminEscola.escolaId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        req.flash('error_msg', 'ID da feira inválido.');
        return res.redirect('/admin/dashboard?tab=feiras');
    }

    if (!nome) {
        req.flash('error_msg', 'O nome da feira é obrigatório.');
        return res.redirect('/admin/dashboard?tab=feiras');
    }

    try {
        const updatedFeira = await Feira.findOneAndUpdate(
            { _id: id, escolaId: escolaId },
            { nome, inicioFeira: inicioFeira || null, fimFeira: fimFeira || null, status },
            { new: true }
        );

        if (!updatedFeira) {
            req.flash('error_msg', 'Feira não encontrada ou você não tem permissão para editá-la.');
            return res.redirect('/admin/dashboard?tab=feiras');
        }

        // Se a feira editada for a feira atualmente selecionada na sessão, atualiza o status na sessão
        if (req.session.adminEscola.feiraAtualId && req.session.adminEscola.feiraAtualId.equals(updatedFeira._id)) {
            // Se o status mudou para 'arquivada', considere limpar a feiraAtualId da sessão
            // ou redirecionar para a seleção de feira para evitar inconsistências
            if (updatedFeira.status === 'arquivada') {
                delete req.session.adminEscola.feiraAtualId; // Limpa a feira atual se ela for arquivada
                req.flash('info_msg', 'A feira ativa foi arquivada. Por favor, selecione outra feira.');
                return res.redirect('/admin/dashboard'); // Redireciona para o dashboard sem feira ativa
            }
        }
        // Se a feira editada se tornar "ativa" e não houver outra feira ativa na sessão, ou se ela for a primeira ativa
        const activeFeiras = await Feira.find({ escolaId: escolaId, status: 'ativa' });
        if (updatedFeira.status === 'ativa' && (!req.session.adminEscola.feiraAtualId || !activeFeiras.some(f => f._id.equals(req.session.adminEscola.feiraAtualId)))) {
             req.session.adminEscola.feiraAtualId = updatedFeira._id;
             await Admin.updateOne({ _id: req.session.adminEscola.id }, { feiraAtualId: updatedFeira._id });
        }


        req.flash('success_msg', 'Feira atualizada com sucesso!');
        res.redirect('/admin/dashboard?tab=feiras');
    } catch (err) {
        console.error('Erro ao editar feira:', err);
        req.flash('error_msg', 'Erro ao editar feira.');
        res.redirect('/admin/dashboard?tab=feiras');
    }
});

// DELETE /admin/feiras/:id - Excluir feira (e todos os dados associados)
router.delete('/feiras/:id', verificarAdminEscola, async (req, res) => {
    const { id } = req.params;
    const escolaId = req.session.adminEscola.escolaId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        req.flash('error_msg', 'ID da feira inválido.');
        return res.redirect('/admin/dashboard?tab=feiras');
    }

    try {
        const deletedFeira = await Feira.findOneAndDelete({ _id: id, escolaId: escolaId });

        if (!deletedFeira) {
            req.flash('error_msg', 'Feira não encontrada ou você não tem permissão para deletá-la.');
            return res.redirect('/admin/dashboard?tab=feiras');
        }

        // Excluir todos os projetos, categorias, critérios, avaliadores e avaliações associados a esta feira
        await Projeto.deleteMany({ feiraId: id, escolaId: escolaId });
        await Categoria.deleteMany({ feiraId: id, escolaId: escolaId });
        await Criterio.deleteMany({ feiraId: id, escolaId: escolaId });
        await Avaliador.deleteMany({ feiraId: id, escolaId: escolaId });
        await Avaliacao.deleteMany({ feiraId: id, escolaId: escolaId });

        // Se a feira excluída era a feira atual na sessão, limpe-a
        if (req.session.adminEscola.feiraAtualId && req.session.adminEscola.feiraAtualId.equals(deletedFeira._id)) {
            delete req.session.adminEscola.feiraAtualId;
            await Admin.updateOne({ _id: req.session.adminEscola.id }, { $unset: { feiraAtualId: 1 } }); // Remove do DB também
            req.flash('info_msg', 'A feira ativa foi excluída. Por favor, selecione outra feira.');
            return res.redirect('/admin/dashboard'); // Redireciona para o dashboard sem feira ativa
        }

        req.flash('success_msg', 'Feira e todos os dados associados excluídos com sucesso!');
        res.redirect('/admin/dashboard?tab=feiras');
    } catch (err) {
        console.error('Erro ao deletar feira e seus dados:', err);
        req.flash('error_msg', 'Erro ao deletar feira.');
        res.redirect('/admin/dashboard?tab=feiras');
    }
});


// ===========================================
// ROTAS DE CRUD - USUÁRIOS ADMIN (Super Admin)
// ===========================================

// POST /admin/usuarios - Criar novo usuário admin
router.post('/usuarios', verificarSuperAdmin, async (req, res) => {
    const { nome, email, senha, isAdmin } = req.body;
    const escolaId = req.session.adminEscola.escolaId; // O super admin também está vinculado a uma escola

    if (!nome || !email || !senha) {
        req.flash('error_msg', 'Nome, Email e Senha são obrigatórios para o usuário admin.');
        return res.redirect('/admin/dashboard?tab=tab-configuracoes');
    }

    try {
        const existingUser = await Admin.findOne({ email: email });
        if (existingUser) {
            req.flash('error_msg', 'Já existe um usuário com este email.');
            return res.redirect('/admin/dashboard?tab=tab-configuracoes');
        }

        const hashedPassword = await bcrypt.hash(senha, 10);

        const newUser = new Admin({
            nome,
            email,
            senha: hashedPassword,
            isAdmin: isAdmin === 'on' ? true : false,
            escolaId: escolaId // Garante que o novo admin esteja associado à escola do super admin
        });

        await newUser.save();
        req.flash('success_msg', 'Usuário admin adicionado com sucesso!');
        res.redirect('/admin/dashboard?tab=tab-configuracoes');
    } catch (err) {
        console.error('Erro ao adicionar usuário admin:', err);
        req.flash('error_msg', 'Erro ao adicionar usuário admin.');
        res.redirect('/admin/dashboard?tab=tab-configuracoes');
    }
});

// PUT /admin/usuarios/:id - Editar usuário admin
router.put('/usuarios/:id', verificarSuperAdmin, async (req, res) => {
    const { id } = req.params;
    const { nome, email, senha, isAdmin } = req.body;
    const escolaId = req.session.adminEscola.escolaId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        req.flash('error_msg', 'ID do usuário inválido.');
        return res.redirect('/admin/dashboard?tab=tab-configuracoes');
    }

    // Não permitir edição do usuário 'admin@admin.com' por segurança.
    const userToUpdate = await Admin.findById(id);
    if (userToUpdate && userToUpdate.email === 'admin@admin.com') {
        req.flash('error_msg', 'Não é permitido editar o usuário principal (admin@admin.com).');
        return res.redirect('/admin/dashboard?tab=tab-configuracoes');
    }

    if (!nome || !email) {
        req.flash('error_msg', 'Nome e Email do usuário admin são obrigatórios.');
        return res.redirect('/admin/dashboard?tab=tab-configuracoes');
    }

    try {
        // Verificar se o email já existe para outro usuário (exceto o próprio)
        const existingUser = await Admin.findOne({ email: email, _id: { $ne: id } });
        if (existingUser) {
            req.flash('error_msg', 'Já existe outro usuário com este email.');
            return res.redirect('/admin/dashboard?tab=tab-configuracoes');
        }

        let updateData = {
            nome,
            email,
            isAdmin: isAdmin === 'on' ? true : false
        };

        if (senha) {
            updateData.senha = await bcrypt.hash(senha, 10);
        }

        const updatedUser = await Admin.findOneAndUpdate(
            { _id: id, escolaId: escolaId }, // Garante que apenas admins da mesma escola possam ser editados
            updateData,
            { new: true }
        );

        if (!updatedUser) {
            req.flash('error_msg', 'Usuário admin não encontrado ou você não tem permissão para editá-lo.');
            return res.redirect('/admin/dashboard?tab=tab-configuracoes');
        }

        req.flash('success_msg', 'Usuário admin atualizado com sucesso!');
        res.redirect('/admin/dashboard?tab=tab-configuracoes');
    } catch (err) {
        console.error('Erro ao editar usuário admin:', err);
        req.flash('error_msg', 'Erro ao editar usuário admin.');
        res.redirect('/admin/dashboard?tab=tab-configuracoes');
    }
});

// DELETE /admin/usuarios/:id - Excluir usuário admin
router.delete('/usuarios/:id', verificarSuperAdmin, async (req, res) => {
    const { id } = req.params;
    const escolaId = req.session.adminEscola.escolaId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        req.flash('error_msg', 'ID do usuário inválido.');
        return res.redirect('/admin/dashboard?tab=tab-configuracoes');
    }

    try {
        // Não permitir que o usuário 'admin@admin.com' seja deletado por segurança.
        const userToDelete = await Admin.findById(id);
        if (userToDelete && userToDelete.email === 'admin@admin.com') {
            req.flash('error_msg', 'Não é permitido deletar o usuário principal (admin@admin.com).');
            return res.redirect('/admin/dashboard?tab=tab-configuracoes');
        }

        const deletedUser = await Admin.findOneAndDelete({ _id: id, escolaId: escolaId });

        if (!deletedUser) {
            req.flash('error_msg', 'Usuário admin não encontrado ou você não tem permissão para deletá-lo.');
            return res.redirect('/admin/dashboard?tab=tab-configuracoes');
        }

        req.flash('success_msg', 'Usuário admin excluído com sucesso!');
        res.redirect('/admin/dashboard?tab=tab-configuracoes');
    } catch (err) {
        console.error('Erro ao deletar usuário admin:', err);
        req.flash('error_msg', 'Erro ao deletar usuário admin.');
        res.redirect('/admin/dashboard?tab=tab-configuracoes');
    }
});


// ===========================================
// ROTAS DE RELATÓRIOS (PDF)
// ===========================================

// Rota para gerar Relatório Consolidado
router.get('/relatorio-consolidado/pdf', verificarAdminEscola, async (req, res) => {
    const feiraId = req.session.adminEscola.feiraAtualId;
    const escolaId = req.session.adminEscola.escolaId;

    if (!feiraId) {
        req.flash('error_msg', 'Selecione uma feira para gerar o relatório consolidado.');
        return res.redirect('/admin/dashboard?tab=relatorios');
    }

    try {
        const feira = await Feira.findById(feiraId);
        const projetos = await Projeto.find({ feiraId: feiraId, escolaId: escolaId }).populate('categoria').populate('criterios');
        const avaliacoes = await Avaliacao.find({ feiraId: feiraId, escolaId: escolaId }).populate('projeto').populate('avaliador').populate('criteriosAvaliacao.criterio');
        const avaliadores = await Avaliador.find({ feiraId: feiraId, escolaId: escolaId });
        const categorias = await Categoria.find({ feiraId: feiraId, escolaId: escolaId });
        const criteriosOficiais = await Criterio.find({ feiraId: feiraId, escolaId: escolaId }); // Todos os critérios da feira

        let relatorioFinalPorProjeto = {};

        for (const projeto of projetos) {
            const avaliacoesDoProjeto = avaliacoes.filter(a => a.projeto && a.projeto._id.equals(projeto._id));
            let notasPorCriterio = {};
            criteriosOficiais.forEach(c => notasPorCriterio[c._id.toString()] = { total: 0, count: 0, nome: c.nome, peso: c.peso });

            avaliacoesDoProjeto.forEach(avaliacao => {
                avaliacao.criteriosAvaliacao.forEach(ca => {
                    const criterioId = ca.criterio._id.toString();
                    if (notasPorCriterio[criterioId]) {
                        notasPorCriterio[criterioId].total += ca.nota;
                        notasPorCriterio[criterioId].count++;
                    }
                });
            });

            let mediaPonderadaProjeto = 0;
            let somaPesos = 0;
            let detalhesCriterios = [];

            criteriosOficiais.forEach(criterio => {
                const criterioStats = notasPorCriterio[criterio._id.toString()];
                let mediaCriterio = criterioStats.count > 0 ? criterioStats.total / criterioStats.count : 0;
                mediaPonderadaProjeto += mediaCriterio * criterio.peso;
                somaPesos += criterio.peso;
                detalhesCriterios.push({
                    nome: criterio.nome,
                    peso: criterio.peso,
                    media: mediaCriterio.toFixed(2),
                });
            });

            const notaFinalProjeto = somaPesos > 0 ? (mediaPonderadaProjeto / somaPesos) : 0;

            relatorioFinalPorProjeto[projeto._id] = {
                projeto: projeto,
                notaFinal: notaFinalProjeto.toFixed(2),
                detalhesCriterios: detalhesCriterios,
                avaliacoesIndividuais: avaliacoesDoProjeto.map(av => ({
                    avaliador: av.avaliador ? av.avaliador.nome : 'Desconhecido',
                    notaGeral: av.notaGeral,
                    observacoes: av.observacoes,
                    criteriosAvaliados: av.criteriosAvaliacao.map(ca => ({
                        nome: ca.criterio ? ca.criterio.nome : 'Desconhecido',
                        nota: ca.nota,
                        observacao: ca.observacao
                    }))
                }))
            };
        }

        const relatorioHtml = await ejs.renderFile(path.join(__dirname, '../views/pdf/relatorio-consolidado.ejs'), {
            feira: feira,
            projetos: projetos,
            avaliacoes: avaliacoes,
            avaliadores: avaliadores,
            categorias: categorias,
            criteriosOficiais: criteriosOficiais,
            relatorioFinalPorProjeto: relatorioFinalPorProjeto,
            formatarData: (dateString) => {
                if (!dateString) return '';
                const date = new Date(dateString);
                return date.toLocaleDateString('pt-BR');
            }
        });

        // Configuração do Puppeteer
        const browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath,
            headless: chromium.headless
        });
        const page = await browser.newPage();
        await page.setContent(relatorioHtml, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '1in', right: '1in', bottom: '1in', left: '1in' }
        });
        await browser.close();

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=relatorio_consolidado_${feira.nome}.pdf`);
        res.send(pdfBuffer);

    } catch (err) {
        console.error('Erro ao gerar PDF do relatório consolidado:', err);
        req.flash('error_msg', 'Erro ao gerar o relatório consolidado.');
        res.redirect('/admin/dashboard?tab=relatorios');
    }
});

// Rotas para outros relatórios (exemplos - precisariam ser implementadas de forma similar)
router.get('/avaliacoes/pdf', verificarAdminEscola, async (req, res) => {
    const feiraId = req.session.adminEscola.feiraAtualId;
    const escolaId = req.session.adminEscola.escolaId;
    if (!feiraId) {
        req.flash('error_msg', 'Selecione uma feira para gerar o relatório de avaliações.');
        return res.redirect('/admin/dashboard?tab=relatorios');
    }
    try {
        const feira = await Feira.findById(feiraId);
        const avaliacoesCompletas = await Avaliacao.find({ feiraId: feiraId, escolaId: escolaId })
            .populate('projeto')
            .populate('avaliador')
            .populate('criteriosAvaliacao.criterio');

        const relatorioHtml = await ejs.renderFile(path.join(__dirname, '../views/pdf/avaliacoes-completas.ejs'), {
            feira: feira,
            avaliacoes: avaliacoesCompletas,
            formatarData: (dateString) => {
                if (!dateString) return '';
                const date = new Date(dateString);
                return date.toLocaleDateString('pt-BR');
            }
        });

        const browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath,
            headless: chromium.headless
        });
        const page = await browser.newPage();
        await page.setContent(relatorioHtml, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '1in', right: '1in', bottom: '1in', left: '1in' } });
        await browser.close();

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=avaliacoes_completas_${feira.nome}.pdf`);
        res.send(pdfBuffer);
    } catch (error) {
        console.error('Erro ao gerar PDF de avaliações completas:', error);
        req.flash('error_msg', 'Erro ao gerar o relatório de avaliações completas.');
        res.redirect('/admin/dashboard?tab=relatorios');
    }
});

router.get('/projetos-sem-avaliacao/pdf', verificarAdminEscola, async (req, res) => {
    const feiraId = req.session.adminEscola.feiraAtualId;
    const escolaId = req.session.adminEscola.escolaId;
    if (!feiraId) {
        req.flash('error_msg', 'Selecione uma feira para gerar o relatório de projetos sem avaliação.');
        return res.redirect('/admin/dashboard?tab=relatorios');
    }
    try {
        const feira = await Feira.findById(feiraId);
        const projetos = await Projeto.find({ feiraId: feiraId, escolaId: escolaId });
        const avaliadores = await Avaliador.find({ feiraId: feiraId, escolaId: escolaId });

        const projetosSemAvaliacao = [];

        for (const projeto of projetos) {
            const avaliadoresDoProjeto = avaliadores.filter(a => a.projetosAtribuidos.some(pId => pId.equals(projeto._id)));
            let avaliacoesRecebidas = await Avaliacao.countDocuments({ projeto: projeto._id, feiraId: feiraId, escolaId: escolaId });

            if (avaliacoesRecebidas < avaliadoresDoProjeto.length) {
                 // Contar quantos avaliadores ainda precisam avaliar
                 const avaliadoresQueNaoAvaliaram = [];
                 for(const avaliador of avaliadoresDoProjeto) {
                     const jaAvaliou = await Avaliacao.exists({ projeto: projeto._id, avaliador: avaliador._id, feiraId: feiraId, escolaId: escolaId });
                     if (!jaAvaliou) {
                         avaliadoresQueNaoAvaliaram.push(avaliador.nome);
                     }
                 }
                if (avaliadoresDoProjeto.length > 0 && avaliadoresQueNaoAvaliaram.length > 0) {
                    projetosSemAvaliacao.push({
                        projeto: projeto,
                        avaliadoresPendentes: avaliadoresQueNaoAvaliaram
                    });
                } else if (avaliadoresDoProjeto.length === 0) {
                    // Projetos que não foram atribuídos a nenhum avaliador também são considerados "sem avaliação"
                    projetosSemAvaliacao.push({
                        projeto: projeto,
                        avaliadoresPendentes: ['Nenhum avaliador atribuído']
                    });
                }
            }
        }

        const relatorioHtml = await ejs.renderFile(path.join(__dirname, '../views/pdf/projetos-sem-avaliacao.ejs'), {
            feira: feira,
            projetosSemAvaliacao: projetosSemAvaliacao,
            formatarData: (dateString) => {
                if (!dateString) return '';
                const date = new Date(dateString);
                return date.toLocaleDateString('pt-BR');
            }
        });

        const browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath,
            headless: chromium.headless
        });
        const page = await browser.newPage();
        await page.setContent(relatorioHtml, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '1in', right: '1in', bottom: '1in', left: '1in' } });
        await browser.close();

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=projetos_sem_avaliacao_${feira.nome}.pdf`);
        res.send(pdfBuffer);

    } catch (error) {
        console.error('Erro ao gerar PDF de projetos sem avaliação:', error);
        req.flash('error_msg', 'Erro ao gerar o relatório de projetos sem avaliação.');
        res.redirect('/admin/dashboard?tab=relatorios');
    }
});

router.get('/ranking-categorias/pdf', verificarAdminEscola, async (req, res) => {
    const feiraId = req.session.adminEscola.feiraAtualId;
    const escolaId = req.session.adminEscola.escolaId;
    if (!feiraId) {
        req.flash('error_msg', 'Selecione uma feira para gerar o ranking por categorias.');
        return res.redirect('/admin/dashboard?tab=relatorios');
    }
    try {
        const feira = await Feira.findById(feiraId);
        const categorias = await Categoria.find({ feiraId: feiraId, escolaId: escolaId });
        const projetos = await Projeto.find({ feiraId: feiraId, escolaId: escolaId }).populate('categoria').populate('criterios');
        const avaliacoes = await Avaliacao.find({ feiraId: feiraId, escolaId: escolaId }).populate('projeto').populate('criteriosAvaliacao.criterio');
        const criteriosOficiais = await Criterio.find({ feiraId: feiraId, escolaId: escolaId });

        const rankingPorCategoria = {};

        for (const categoria of categorias) {
            rankingPorCategoria[categoria._id] = {
                nome: categoria.nome,
                projetos: []
            };

            const projetosDaCategoria = projetos.filter(p => p.categoria && p.categoria._id.equals(categoria._id));

            for (const projeto of projetosDaCategoria) {
                const avaliacoesDoProjeto = avaliacoes.filter(a => a.projeto && a.projeto._id.equals(projeto._id));

                let mediaPonderadaProjeto = 0;
                let somaPesos = 0;

                // Calcular a nota ponderada para o projeto
                if (avaliacoesDoProjeto.length > 0) {
                    let totalNotasCriterios = {};
                    let contagemNotasCriterios = {};

                    avaliacoesDoProjeto.forEach(avaliacao => {
                        avaliacao.criteriosAvaliacao.forEach(ca => {
                            const criterioId = ca.criterio._id.toString();
                            if (!totalNotasCriterios[criterioId]) {
                                totalNotasCriterios[criterioId] = 0;
                                contagemNotasCriterios[criterioId] = 0;
                            }
                            totalNotasCriterios[criterioId] += ca.nota;
                            contagemNotasCriterios[criterioId]++;
                        });
                    });

                    criteriosOficiais.forEach(criterio => {
                        const criterioId = criterio._id.toString();
                        if (contagemNotasCriterios[criterioId] > 0) {
                            const mediaCriterio = totalNotasCriterios[criterioId] / contagemNotasCriterios[criterioId];
                            mediaPonderadaProjeto += mediaCriterio * criterio.peso;
                            somaPesos += criterio.peso;
                        }
                    });
                }

                const notaFinalProjeto = somaPesos > 0 ? (mediaPonderadaProjeto / somaPesos) : 0;

                rankingPorCategoria[categoria._id].projetos.push({
                    _id: projeto._id,
                    titulo: projeto.titulo,
                    notaFinal: notaFinalProjeto.toFixed(2),
                    turma: projeto.turma
                });
            }
            // Ordenar projetos dentro de cada categoria por nota final (decrescente)
            rankingPorCategoria[categoria._id].projetos.sort((a, b) => parseFloat(b.notaFinal) - parseFloat(a.notaFinal));
        }

        const relatorioHtml = await ejs.renderFile(path.join(__dirname, '../views/pdf/ranking-categorias.ejs'), {
            feira: feira,
            rankingPorCategoria: rankingPorCategoria,
            formatarData: (dateString) => {
                if (!dateString) return '';
                const date = new Date(dateString);
                return date.toLocaleDateString('pt-BR');
            }
        });

        const browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath,
            headless: chromium.headless
        });
        const page = await browser.newPage();
        await page.setContent(relatorioHtml, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '1in', right: '1in', bottom: '1in', left: '1in' } });
        await browser.close();

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=ranking_por_categoria_${feira.nome}.pdf`);
        res.send(pdfBuffer);

    } catch (error) {
        console.error('Erro ao gerar PDF de ranking por categoria:', error);
        req.flash('error_msg', 'Erro ao gerar o ranking por categoria.');
        res.redirect('/admin/dashboard?tab=relatorios');
    }
});

router.get('/ranking-geral/pdf', verificarAdminEscola, async (req, res) => {
    const feiraId = req.session.adminEscola.feiraAtualId;
    const escolaId = req.session.adminEscola.escolaId;
    if (!feiraId) {
        req.flash('error_msg', 'Selecione uma feira para gerar o ranking geral.');
        return res.redirect('/admin/dashboard?tab=relatorios');
    }
    try {
        const feira = await Feira.findById(feiraId);
        const projetos = await Projeto.find({ feiraId: feiraId, escolaId: escolaId }).populate('categoria').populate('criterios');
        const avaliacoes = await Avaliacao.find({ feiraId: feiraId, escolaId: escolaId }).populate('projeto').populate('criteriosAvaliacao.criterio');
        const criteriosOficiais = await Criterio.find({ feiraId: feiraId, escolaId: escolaId });

        const rankingGeral = [];

        for (const projeto of projetos) {
            const avaliacoesDoProjeto = avaliacoes.filter(a => a.projeto && a.projeto._id.equals(projeto._id));

            let mediaPonderadaProjeto = 0;
            let somaPesos = 0;

            if (avaliacoesDoProjeto.length > 0) {
                let totalNotasCriterios = {};
                let contagemNotasCriterios = {};

                avaliacoesDoProjeto.forEach(avaliacao => {
                    avaliacao.criteriosAvaliacao.forEach(ca => {
                        const criterioId = ca.criterio._id.toString();
                        if (!totalNotasCriterios[criterioId]) {
                            totalNotasCriterios[criterioId] = 0;
                            contagemNotasCriterios[criterioId] = 0;
                        }
                        totalNotasCriterios[criterioId] += ca.nota;
                        contagemNotasCriterios[criterioId]++;
                    });
                });

                criteriosOficiais.forEach(criterio => {
                    const criterioId = criterio._id.toString();
                    if (contagemNotasCriterios[criterioId] > 0) {
                        const mediaCriterio = totalNotasCriterios[criterioId] / contagemNotasCriterios[criterioId];
                        mediaPonderadaProjeto += mediaCriterio * criterio.peso;
                        somaPesos += criterio.peso;
                    }
                });
            }

            const notaFinalProjeto = somaPesos > 0 ? (mediaPonderadaProjeto / somaPesos) : 0;

            rankingGeral.push({
                _id: projeto._id,
                titulo: projeto.titulo,
                categoria: projeto.categoria ? projeto.categoria.nome : 'N/A',
                notaFinal: notaFinalProjeto.toFixed(2),
                turma: projeto.turma
            });
        }

        // Ordenar ranking geral por nota final (decrescente)
        rankingGeral.sort((a, b) => parseFloat(b.notaFinal) - parseFloat(a.notaFinal));

        const relatorioHtml = await ejs.renderFile(path.join(__dirname, '../views/pdf/ranking-geral.ejs'), {
            feira: feira,
            rankingGeral: rankingGeral,
            formatarData: (dateString) => {
                if (!dateString) return '';
                const date = new Date(dateString);
                return date.toLocaleDateString('pt-BR');
            }
        });

        const browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath,
            headless: chromium.headless
        });
        const page = await browser.newPage();
        await page.setContent(relatorioHtml, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '1in', right: '1in', bottom: '1in', left: '1in' } });
        await browser.close();

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=ranking_geral_${feira.nome}.pdf`);
        res.send(pdfBuffer);

    } catch (error) {
        console.error('Erro ao gerar PDF de ranking geral:', error);
        req.flash('error_msg', 'Erro ao gerar o ranking geral.');
        res.redirect('/admin/dashboard?tab=relatorios');
    }
});

router.get('/relatorio-por-projeto/pdf', verificarAdminEscola, async (req, res) => {
    const feiraId = req.session.adminEscola.feiraAtualId;
    const escolaId = req.session.adminEscola.escolaId;
    if (!feiraId) {
        req.flash('error_msg', 'Selecione uma feira para gerar o relatório por projeto.');
        return res.redirect('/admin/dashboard?tab=relatorios');
    }
    try {
        const feira = await Feira.findById(feiraId);
        const projetos = await Projeto.find({ feiraId: feiraId, escolaId: escolaId }).populate('categoria').populate('criterios');
        const avaliacoes = await Avaliacao.find({ feiraId: feiraId, escolaId: escolaId }).populate('projeto').populate('avaliador').populate('criteriosAvaliacao.criterio');
        const criteriosOficiais = await Criterio.find({ feiraId: feiraId, escolaId: escolaId });

        let relatorioFinalPorProjeto = {}; // Constrói o mesmo objeto do dashboard geral

        for (const projeto of projetos) {
            const avaliacoesDoProjeto = avaliacoes.filter(a => a.projeto && a.projeto._id.equals(projeto._id));
            let notasPorCriterio = {};
            criteriosOficiais.forEach(c => notasPorCriterio[c._id.toString()] = { total: 0, count: 0, nome: c.nome, peso: c.peso });

            avaliacoesDoProjeto.forEach(avaliacao => {
                avaliacao.criteriosAvaliacao.forEach(ca => {
                    const criterioId = ca.criterio._id.toString();
                    if (notasPorCriterio[criterioId]) {
                        notasPorCriterio[criterioId].total += ca.nota;
                        notasPorCriterio[criterioId].count++;
                    }
                });
            });

            let mediaPonderadaProjeto = 0;
            let somaPesos = 0;
            let detalhesCriterios = [];

            criteriosOficiais.forEach(criterio => {
                const criterioStats = notasPorCriterio[criterio._id.toString()];
                let mediaCriterio = criterioStats.count > 0 ? criterioStats.total / criterioStats.count : 0;
                mediaPonderadaProjeto += mediaCriterio * criterio.peso;
                somaPesos += criterio.peso;
                detalhesCriterios.push({
                    nome: criterio.nome,
                    peso: criterio.peso,
                    media: mediaCriterio.toFixed(2),
                });
            });

            const notaFinalProjeto = somaPesos > 0 ? (mediaPonderadaProjeto / somaPesos) : 0;

            relatorioFinalPorProjeto[projeto._id] = {
                projeto: projeto,
                notaFinal: notaFinalProjeto.toFixed(2),
                detalhesCriterios: detalhesCriterios,
                avaliacoesIndividuais: avaliacoesDoProjeto.map(av => ({
                    avaliador: av.avaliador ? av.avaliador.nome : 'Desconhecido',
                    notaGeral: av.notaGeral,
                    observacoes: av.observacoes,
                    criteriosAvaliados: av.criteriosAvaliacao.map(ca => ({
                        nome: ca.criterio ? ca.criterio.nome : 'Desconhecido',
                        nota: ca.nota,
                        observacao: ca.observacao
                    }))
                }))
            };
        }

        const relatorioHtml = await ejs.renderFile(path.join(__dirname, '../views/pdf/relatorio-por-projeto.ejs'), {
            feira: feira,
            relatorioFinalPorProjeto: relatorioFinalPorProjeto,
            formatarData: (dateString) => {
                if (!dateString) return '';
                const date = new Date(dateString);
                return date.toLocaleDateString('pt-BR');
            }
        });

        const browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath,
            headless: chromium.headless
        });
        const page = await browser.newPage();
        await page.setContent(relatorioHtml, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '1in', right: '1in', bottom: '1in', left: '1in' } });
        await browser.close();

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=relatorio_por_projeto_${feira.nome}.pdf`);
        res.send(pdfBuffer);

    } catch (error) {
        console.error('Erro ao gerar PDF de relatório por projeto:', error);
        req.flash('error_msg', 'Erro ao gerar o relatório por projeto.');
        res.redirect('/admin/dashboard?tab=relatorios');
    }
});


module.exports = router;