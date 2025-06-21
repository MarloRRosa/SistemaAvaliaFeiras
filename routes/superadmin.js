// routes/superadmin.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Escola = require('../models/Escola');
const Admin = require('../models/Admin');
const SuperAdmin = require('../models/SuperAdmin');
const Avaliador = require('../models/Avaliador');
const Projeto = require('../models/Projeto');
const Avaliacao = require('../models/Avaliacao');
const Criterio = require('../models/Criterio');
const Feira = require('../models/Feira');
const bcrypt = require('bcryptjs');
const SolicitacaoAcesso = require('../models/SolicitacaoAcesso');
const nodemailer = require('nodemailer');
const passport = require('passport'); // Importante: Adicione esta linha se você lida com passport.authenticate aqui
require('dotenv').config();

// ========================================================================
// Funções Auxiliares e Configurações
// ========================================================================

/**
 * Hashes uma senha usando bcrypt.
 * @param {string} password A senha em texto plano.
 * @returns {Promise<string>} A senha hashed.
 */
async function hashPassword(password) {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    return hash;
}

/**
 * Gera uma senha temporária aleatória.
 * @param {number} length O comprimento da senha (padrão: 8).
 * @returns {string} A senha temporária.
 */
function generateTemporaryPassword(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

// Configuração do Nodemailer
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: process.env.EMAIL_SECURE === 'true', // true para 465, false para outras portas
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Middleware para verificar se o usuário é Super Admin
// Esta é a linha 60
function verificarSuperAdmin(req, res, next) {
    // Certifique-se de que req.isAuthenticated() exista antes de chamá-lo
    // Isso deve estar garantido pela configuração do Passport.js no seu app.js
    if (req.isAuthenticated && req.isAuthenticated() && req.user.role === 'superadmin') {
        return next();
    }
    req.flash('error_msg', 'Você não tem permissão de Super Administrador ou não está logado.');
    res.redirect('/superadmin/login');
}

// ========================================================================
// Rotas de Páginas
// ========================================================================

// Rota de Login do Super Admin (GET)
// ESTA ROTA NÃO DEVE TER O verificarSuperAdmin como middleware.
router.get('/login', (req, res) => {
    // Se o usuário JÁ ESTÁ autenticado como superadmin, redireciona para o dashboard
    if (req.isAuthenticated && req.isAuthenticated() && req.user.role === 'superadmin') {
        return res.redirect('/superadmin/dashboard');
    }
    // Caso contrário, renderiza a página de login
    res.render('superadmin/login', { titulo: 'Login Super Admin', layout: 'layout_login' });
});

// Rota para processar o Login do Super Admin (POST)
// Use a estratégia 'superadmin-local' que você definiu no app.js
router.post('/login', passport.authenticate('superadmin-local', {
    successRedirect: '/superadmin/dashboard',
    failureRedirect: '/superadmin/login',
    failureFlash: true
}));


// Rota para o Dashboard do Super Admin
// Esta sim DEVE USAR o verificarSuperAdmin, pois exige autenticação.
router.get('/dashboard', verificarSuperAdmin, async (req, res) => {
    try {
        const activeTab = req.query.tab || 'visao-geral';

        // Remova a pré-carga de dados aqui se você quiser que tudo seja carregado via API.
        // Se você quiser manter a visão geral pré-carregada, mantenha esta lógica.
        let dataForInitialTab = {};
        if (activeTab === 'visao-geral') {
            dataForInitialTab.totalEscolas = await Escola.countDocuments();
            dataForInitialTab.totalAdmins = await Admin.countDocuments();
            dataForInitialTab.totalAvaliadores = await Avaliador.countDocuments();
            dataForInitialTab.totalProjetos = await Projeto.countDocuments();
            dataForInitialTab.totalAvaliacoes = await Avaliacao.countDocuments();
            dataForInitialTab.totalSolicitacoesPendentes = await SolicitacaoAcesso.countDocuments({ status: 'Pendente' });
        }

        const success_msg = req.flash('success_msg');
        const error_msg = req.flash('error_msg');
        const error = req.flash('error');

        res.render('superadmin/dashboard', {
            titulo: 'Dashboard Super Admin',
            userName: req.user.nome,
            userRole: 'Super Admin',
            activeTab: activeTab,
            dataForTab: dataForInitialTab,
            success_msg,
            error_msg,
            error
        });

    } catch (err) {
        console.error('Erro ao carregar dashboard do Super Admin:', err);
        req.flash('error_msg', 'Erro ao carregar o dashboard.');
        res.redirect('/superadmin/login');
    }
});

// ========================================================================
// NOVAS ROTAS DE API PARA CARREGAMENTO DINÂMICO DAS ABAS (AJAX/FETCH)
// Todas estas devem ter verificarSuperAdmin
// ========================================================================

// API para dados da aba "Visão Geral"
router.get('/api/dashboard/visao-geral', verificarSuperAdmin, async (req, res) => {
    try {
        const totalEscolas = await Escola.countDocuments();
        const totalAdmins = await Admin.countDocuments();
        const totalAvaliadores = await Avaliador.countDocuments();
        const totalProjetos = await Projeto.countDocuments();
        const totalAvaliacoes = await Avaliacao.countDocuments();
        const totalSolicitacoesPendentes = await SolicitacaoAcesso.countDocuments({ status: 'Pendente' });

        res.json({
            totalEscolas,
            totalAdmins,
            totalAvaliadores,
            totalProjetos,
            totalAvaliacoes,
            totalSolicitacoesPendentes
        });
    } catch (err) {
        console.error('Erro ao carregar dados da Visão Geral (API):', err);
        res.status(500).json({ message: 'Erro ao carregar dados da Visão Geral.' });
    }
});

// API para dados da aba "Gerenciar Escolas"
router.get('/api/dashboard/gerenciar-escolas', verificarSuperAdmin, async (req, res) => {
    try {
        const escolas = await Escola.find().sort({ nome: 1 }).lean();
        // Populando admin para cada escola, se necessário
        for (const escola of escolas) {
            escola.admin = await Admin.findOne({ escola: escola._id }).lean();
        }
        res.json(escolas);
    } catch (err) {
        console.error('Erro ao carregar dados de Gerenciar Escolas (API):', err);
        res.status(500).json({ message: 'Erro ao carregar dados das escolas.' });
    }
});

// API para dados da aba "Solicitações"
router.get('/api/dashboard/solicitacoes', verificarSuperAdmin, async (req, res) => {
    try {
        const solicitacoes = await SolicitacaoAcesso.find({ status: 'Pendente' }).sort({ dataSolicitacao: 'asc' }).lean();
        res.json(solicitacoes);
    } catch (err) {
        console.error('Erro ao carregar dados de Solicitações (API):', err);
        res.status(500).json({ message: 'Erro ao carregar dados das solicitações.' });
    }
});

// TODO: ADICIONAR ROTAS DE API PARA AS OUTRAS ABAS AQUI (PROJETOS SEM AVALIAÇÃO, RANKING, AVALIADORES)
router.get('/api/dashboard/projetos-sem-avaliacao', verificarSuperAdmin, async (req, res) => {
    try {
        // Encontra projetos que não têm avaliações associadas
        const projetosSemAvaliacao = await Projeto.aggregate([
            {
                $lookup: {
                    from: 'avaliacaos', // Nome da coleção de avaliações (geralmente plural e minúsculo)
                    localField: '_id',
                    foreignField: 'projeto',
                    as: 'avaliacoes'
                }
            },
            {
                $match: {
                    'avaliacoes': { $eq: [] } // Onde o array de avaliações está vazio
                }
            },
            {
                $lookup: {
                    from: 'escolas', // Nome da coleção de escolas
                    localField: 'escola',
                    foreignField: '_id',
                    as: 'escolaInfo'
                }
            },
            {
                $unwind: { path: '$escolaInfo', preserveNullAndEmptyArrays: true } // Para desconstruir o array escolaInfo
            },
            {
                $project: {
                    titulo: 1,
                    autores: 1,
                    escola: '$escolaInfo.nome' // Pega apenas o nome da escola
                }
            }
        ]);
        res.json(projetosSemAvaliacao);
    } catch (err) {
        console.error('Erro ao carregar projetos sem avaliação (API):', err);
        res.status(500).json({ message: 'Erro ao carregar projetos sem avaliação.' });
    }
});

router.get('/api/dashboard/ranking-projetos', verificarSuperAdmin, async (req, res) => {
    try {
        const ranking = await Avaliacao.aggregate([
            {
                $group: {
                    _id: '$projeto',
                    somaNotas: { $sum: '$notaFinal' },
                    contagemAvaliacoes: { $sum: 1 }
                }
            },
            {
                $addFields: {
                    media: { $divide: ['$somaNotas', '$contagemAvaliacoes'] }
                }
            },
            {
                $sort: { media: -1 } // Ordena pela maior média
            },
            {
                $lookup: {
                    from: 'projetos', // Nome da coleção de projetos
                    localField: '_id',
                    foreignField: '_id',
                    as: 'projetoInfo'
                }
            },
            {
                $unwind: '$projetoInfo'
            },
            {
                $lookup: {
                    from: 'escolas', // Nome da coleção de escolas
                    localField: 'projetoInfo.escola',
                    foreignField: '_id',
                    as: 'escolaInfo'
                }
            },
            {
                $unwind: { path: '$escolaInfo', preserveNullAndEmptyArrays: true }
            },
            {
                $project: {
                    projeto: {
                        titulo: '$projetoInfo.titulo',
                        autores: '$projetoInfo.autores',
                        categoria: '$projetoInfo.categoria'
                    },
                    escola: '$escolaInfo',
                    media: 1,
                    contagemAvaliacoes: 1
                }
            }
        ]);

        res.json(ranking);
    } catch (err) {
        console.error('Erro ao carregar ranking de projetos (API):', err);
        res.status(500).json({ message: 'Erro ao carregar ranking de projetos.' });
    }
});

router.get('/api/dashboard/resumo-avaliadores', verificarSuperAdmin, async (req, res) => {
    try {
        const avaliadores = await Avaliador.aggregate([
            {
                $lookup: {
                    from: 'avaliacaos', // Nome da coleção de avaliações
                    localField: '_id',
                    foreignField: 'avaliador',
                    as: 'avaliacoesRealizadas'
                }
            },
            {
                $project: {
                    nome: 1,
                    email: 1,
                    avaliacoesRealizadas: { $size: '$avaliacoesRealizadas' } // Conta o número de avaliações
                }
            },
            {
                $sort: { nome: 1 }
            }
        ]);
        res.json(avaliadores);
    } catch (err) {
        console.error('Erro ao carregar resumo de avaliadores (API):', err);
        res.status(500).json({ message: 'Erro ao carregar resumo de avaliadores.' });
    }
});


// ========================================================================
// Rotas de CRUD para Escolas (EXISTENTES - MANTIDAS)
// ========================================================================

// Rota para listar todas as escolas (se você tiver uma página separada para isso)
router.get('/escolas', verificarSuperAdmin, async (req, res) => {
    try {
        const escolas = await Escola.find().sort({ nome: 1 }).lean();
        for (const escola of escolas) {
            escola.admin = await Admin.findOne({ escola: escola._id }).lean();
        }

        const success_msg = req.flash('success_msg');
        const error_msg = req.flash('error_msg');

        res.render('superadmin/gerenciar_escolas', {
            titulo: 'Gerenciar Escolas',
            userName: req.user.nome,
            userRole: 'Super Admin',
            escolas: escolas,
            success_msg,
            error_msg
        });
    } catch (err) {
        console.error('Erro ao listar escolas:', err);
        req.flash('error_msg', 'Erro ao carregar a lista de escolas.');
        res.redirect('/superadmin/dashboard');
    }
});

// Rota para exibir o formulário de cadastro de nova escola
router.get('/escolas/nova', verificarSuperAdmin, (req, res) => {
    res.render('superadmin/nova_escola', {
        titulo: 'Cadastrar Nova Escola',
        userName: req.user.nome,
        userRole: 'Super Admin'
    });
});

// Rota para processar o cadastro de nova escola
router.post('/escolas/nova', verificarSuperAdmin, async (req, res) => {
    const { nome, emailContato, telefoneContato, endereco, senhaAdmin } = req.body;

    const errors = [];

    if (!nome || typeof nome == undefined || nome == null) {
        errors.push({ text: 'Nome da escola inválido.' });
    }
    if (!emailContato || typeof emailContato == undefined || emailContato == null) {
        errors.push({ text: 'E-mail de contato inválido.' });
    }
    if (!senhaAdmin || typeof senhaAdmin == undefined || senhaAdmin == null || senhaAdmin.length < 6) {
        errors.push({ text: 'A senha do administrador deve ter pelo menos 6 caracteres.' });
    }

    if (errors.length > 0) {
        res.render('superadmin/nova_escola', {
            titulo: 'Cadastrar Nova Escola',
            userName: req.user.nome,
            userRole: 'Super Admin',
            errors: errors,
            escola: req.body
        });
    } else {
        try {
            const existingEscola = await Escola.findOne({ $or: [{ nome: nome }, { emailContato: emailContato }] });
            if (existingEscola) {
                req.flash('error_msg', 'Já existe uma escola com este nome ou e-mail de contato.');
                return res.redirect('/superadmin/escolas/nova');
            }

            const adminEmail = `${nome.toLowerCase().replace(/\s/g, '')}@admin.com`;
            const hashedPassword = await hashPassword(senhaAdmin);

            const novaEscola = new Escola({
                nome,
                emailContato,
                telefoneContato,
                endereco,
                dataCadastro: new Date()
            });

            const escolaSalva = await novaEscola.save();

            const novoAdmin = new Admin({
                nome: `Admin ${nome}`,
                email: adminEmail,
                password: hashedPassword,
                escola: escolaSalva._id
            });

            await novoAdmin.save();

            req.flash('success_msg', 'Escola e administrador cadastrados com sucesso!');
            res.redirect('/superadmin/escolas');
        } catch (err) {
            console.error('Erro ao cadastrar escola:', err);
            req.flash('error_msg', 'Erro ao cadastrar escola. Tente novamente.');
            res.redirect('/superadmin/escolas/nova');
        }
    }
});

// Rota para detalhes da escola e edição
router.get('/escolas/:id/detalhes', verificarSuperAdmin, async (req, res) => {
    try {
        const escola = await Escola.findById(req.params.id).lean();
        if (!escola) {
            req.flash('error_msg', 'Escola não encontrada.');
            return res.redirect('/superadmin/escolas');
        }
        escola.admin = await Admin.findOne({ escola: escola._id }).lean();

        res.render('superadmin/detalhes_escola', {
            titulo: `Detalhes da Escola: ${escola.nome}`,
            userName: req.user.nome,
            userRole: 'Super Admin',
            escola: escola
        });
    } catch (err) {
        console.error('Erro ao carregar detalhes da escola:', err);
        req.flash('error_msg', 'Erro ao carregar detalhes da escola.');
        res.redirect('/superadmin/escolas');
    }
});

// Rota para editar escola (POST)
router.post('/escolas/:id/editar', verificarSuperAdmin, async (req, res) => {
    const { nome, emailContato, telefoneContato, endereco } = req.body;
    const escolaId = req.params.id;

    const errors = [];

    if (!nome || typeof nome == undefined || nome == null) {
        errors.push({ text: 'Nome da escola inválido.' });
    }
    if (!emailContato || typeof emailContato == undefined || emailContato == null) {
        errors.push({ text: 'E-mail de contato inválido.' });
    }

    if (errors.length > 0) {
        const escola = await Escola.findById(escolaId).lean();
        escola.admin = await Admin.findOne({ escola: escola._id }).lean();
        res.render('superadmin/detalhes_escola', {
            titulo: `Detalhes da Escola: ${escola.nome}`,
            userName: req.user.nome,
            userRole: 'Super Admin',
            escola: { ...escola, ...req.body },
            errors: errors
        });
    } else {
        try {
            await Escola.findByIdAndUpdate(escolaId, {
                nome,
                emailContato,
                telefoneContato,
                endereco
            });
            req.flash('success_msg', 'Dados da escola atualizados com sucesso!');
            res.redirect(`/superadmin/escolas/${escolaId}/detalhes`);
        } catch (err) {
            console.error('Erro ao atualizar escola:', err);
            req.flash('error_msg', 'Erro ao atualizar escola. Tente novamente.');
            res.redirect(`/superadmin/escolas/${escolaId}/detalhes`);
        }
    }
});


// Rota para deletar escola
router.post('/escolas/:id/deletar', verificarSuperAdmin, async (req, res) => {
    try {
        const escolaId = req.params.id;
        const escola = await Escola.findById(escolaId);

        if (!escola) {
            req.flash('error_msg', 'Escola não encontrada para exclusão.');
            return res.redirect('/superadmin/dashboard?tab=gerenciar-escolas');
        }

        await Admin.deleteOne({ escola: escola._id });

        // TODO: Considerar deletar projetos e avaliações associadas à escola
        // await Projeto.deleteMany({ escola: escola._id });
        // await Avaliacao.deleteMany({ escola: escola._id });

        await Escola.deleteOne({ _id: escolaId });
        req.flash('success_msg', `Escola "${escola.nome}" e administrador associado deletados com sucesso.`);
        res.redirect('/superadmin/dashboard?tab=gerenciar-escolas');
    } catch (err) {
        console.error('Erro ao deletar escola:', err);
        req.flash('error_msg', 'Erro ao deletar escola. Tente novamente.');
        res.redirect('/superadmin/dashboard?tab=gerenciar-escolas');
    }
});

// Rota para resetar senha do Admin da Escola
router.post('/escolas/:id/reset-admin-password', verificarSuperAdmin, async (req, res) => {
    try {
        const escolaId = req.params.id;
        const admin = await Admin.findOne({ escola: escolaId });

        if (!admin) {
            req.flash('error_msg', 'Administrador da escola não encontrado.');
            return res.redirect('/superadmin/dashboard?tab=gerenciar-escolas');
        }

        const novaSenhaTemporaria = generateTemporaryPassword();
        const hashedNovaSenha = await hashPassword(novaSenhaTemporaria);

        admin.password = hashedNovaSenha;
        await admin.save();

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: admin.email,
            subject: 'Redefinição de Senha de Administrador AvaliaFeiras',
            html: `
                <p>Olá,</p>
                <p>Sua senha de administrador da escola no sistema AvaliaFeiras foi redefinida.</p>
                <p>Sua nova senha temporária é: <strong>${novaSenhaTemporaria}</strong></p>
                <p>Por favor, use esta senha para fazer login e altere-a o mais rápido possível.</p>
                <p>Atenciosamente,<br>Equipe AvaliaFeiras</p>
                <hr>
                <p style="font-size: 10px; color: #777;">Este é um e-mail automático, por favor, não responda.</p>
            `
        };

        if (process.env.EMAIL_USER && process.env.EMAIL_HOST && process.env.EMAIL_PASS) {
            await transporter.sendMail(mailOptions);
            console.log(`E-mail de redefinição de senha enviado para ${admin.email}`);
        } else {
            console.warn('Variáveis de ambiente de e-mail não configuradas. E-mail de redefinição não será enviado.');
        }

        req.flash('success_msg', `Senha do administrador da escola "${admin.nome.replace('Admin ', '')}" resetada com sucesso e enviada para ${admin.email}.`);
        res.redirect('/superadmin/dashboard?tab=gerenciar-escolas');
    } catch (err) {
        console.error('Erro ao resetar senha do admin:', err);
        req.flash('error_msg', 'Erro ao resetar senha do administrador. Tente novamente.');
        res.redirect('/superadmin/dashboard?tab=gerenciar-escolas');
    }
});


// ========================================================================
// Rotas para Gerenciar Solicitações de Acesso (aprovar/rejeitar) (EXISTENTES - MANTIDAS)
// ========================================================================

// Rota para aprovar solicitação de acesso
router.post('/solicitacoes/:id/aprovar', verificarSuperAdmin, async (req, res) => {
    try {
        const solicitacao = await SolicitacaoAcesso.findById(req.params.id);

        if (!solicitacao) {
            req.flash('error_msg', 'Solicitação não encontrada.');
            return res.redirect('/superadmin/dashboard?tab=solicitacoes');
        }

        const existingEscola = await Escola.findOne({ $or: [{ nome: solicitacao.nomeEscola }, { emailContato: solicitacao.emailContato }] });
        if (existingEscola) {
            req.flash('error_msg', `Já existe uma escola ou email de contato cadastrado com o nome/email "${solicitacao.nomeEscola}" ou "${solicitacao.emailContato}".`);
            solicitacao.status = 'Conflito';
            await solicitacao.save();
            return res.redirect('/superadmin/dashboard?tab=solicitacoes');
        }

        const novaSenhaTemporaria = generateTemporaryPassword();
        const hashedPassword = await hashPassword(novaSenhaTemporaria);

        const novaEscola = new Escola({
            nome: solicitacao.nomeEscola,
            emailContato: solicitacao.emailContato,
            telefoneContato: solicitacao.telefoneContato,
            endereco: solicitacao.endereco,
            dataCadastro: new Date()
        });
        const escolaSalva = await novaEscola.save();

        const adminEmail = `${solicitacao.nomeEscola.toLowerCase().replace(/\s/g, '')}@admin.com`;
        const novoAdmin = new Admin({
            nome: `Admin ${solicitacao.nomeEscola}`,
            email: adminEmail,
            password: hashedPassword,
            escola: escolaSalva._id
        });
        await novoAdmin.save();

        solicitacao.status = 'Aprovada';
        solicitacao.dataAprovacao = new Date();
        await solicitacao.save();

        const mailOptionsAprovacao = {
            from: process.env.EMAIL_USER,
            to: solicitacao.emailContato,
            subject: 'Sua Solicitação de Acesso ao AvaliaFeiras Foi Aprovada!',
            html: `
                <p>Olá ${solicitacao.nomeContato},</p>
                <p>Sua solicitação de acesso para a escola <strong>${solicitacao.nomeEscola}</strong> no sistema AvaliaFeiras foi aprovada!</p>
                <p>Para acessar o painel de administração da sua escola, use as seguintes credenciais:</p>
                <p><strong>URL de Login:</strong> <a href="${req.protocol}://${req.get('host')}/admin/login">${req.protocol}://${req.get('host')}/admin/login</a></p>
                <p><strong>Usuário (E-mail):</strong> <strong>${adminEmail}</strong></p>
                <p><strong>Senha Temporária:</strong> <strong>${novaSenhaTemporaria}</strong></p>
                <p>Por favor, faça login com a senha temporária e altere-a o mais rápido possível para garantir a segurança da sua conta.</p>
                <p>Se tiver alguma dúvida, não hesite em nos contatar.</p>
                <p>Atenciosamente,<br>Equipe AvaliaFeiras</p>
                <hr>
                <p style="font-size: 10px; color: #777;">Este é um e-mail automático, por favor, não responda.</p>
            `
        };

        if (process.env.EMAIL_USER && process.env.EMAIL_HOST && process.env.EMAIL_PASS) {
            await transporter.sendMail(mailOptionsAprovacao);
            console.log(`E-mail de aprovação enviado para ${solicitacao.emailContato}`);
        } else {
            console.warn('Variáveis de ambiente de e-mail não configuradas. E-mail de aprovação não será enviado.');
        }

        req.flash('success_msg', `Solicitação de "${solicitacao.nomeEscola}" aprovada e escola cadastrada com sucesso!`);
        res.redirect('/superadmin/dashboard?tab=solicitacoes');

    } catch (err) {
        console.error('Erro ao aprovar solicitação:', err);
        if (err.code === 11000) {
            req.flash('error_msg', `Erro: Já existe um registro com os dados fornecidos.`);
        } else {
            req.flash('error_msg', `Erro ao aprovar a solicitação: ${err.message}`);
        }
        res.redirect('/superadmin/dashboard?tab=solicitacoes');
    }
});

// Rota para rejeitar solicitação de acesso
router.post('/solicitacoes/:id/rejeitar', verificarSuperAdmin, async (req, res) => {
    try {
        const solicitacao = await SolicitacaoAcesso.findById(req.params.id);

        if (!solicitacao) {
            req.flash('error_msg', 'Solicitação não encontrada.');
            return res.redirect('/superadmin/dashboard?tab=solicitacoes');
        }

        solicitacao.status = 'Rejeitada';
        solicitacao.dataRejeicao = new Date();
        await solicitacao.save();

        const mailOptionsRejeicao = {
            from: process.env.EMAIL_USER,
            to: solicitacao.emailContato,
            subject: 'Sua Solicitação de Acesso ao AvaliaFeiras Foi Revisada',
            html: `
                <p>Olá ${solicitacao.nomeContato},</p>
                <p>Gostaríamos de informar que sua solicitação de acesso para a escola <strong>${solicitacao.nomeEscola}</strong> no sistema AvaliaFeiras foi revisada e, infelizmente, não pôde ser aprovada neste momento.</p>
                <p><strong>Motivo:</strong> [Você pode adicionar um campo no front-end para o Super Admin digitar o motivo]</p>
                <p>Se tiver alguma dúvida ou desejar mais informações, por favor, entre em contato conosco.</p>
                <p>Atenciosamente,<br>Equipe AvaliaFeiras</p>
                <hr>
                <p style="font-size: 10px; color: #777;">Este é um e-mail automático, por favor, não responda.</p>
            `
        };

        if (process.env.EMAIL_USER && process.env.EMAIL_HOST && process.env.EMAIL_PASS) {
            await transporter.sendMail(mailOptionsRejeicao);
            console.log(`E-mail de rejeição enviado para ${solicitacao.emailContato}`);
        } else {
            console.warn('Variáveis de ambiente de e-mail não configuradas. E-mail de rejeição não será enviado.');
        }

        req.flash('success_msg', `Solicitação de "${solicitacao.nomeEscola}" rejeitada com sucesso.`);
        res.redirect('/superadmin/dashboard?tab=solicitacoes');

    } catch (err) {
        console.error('Erro ao rejeitar solicitação:', err);
        if (!res.headersSent) {
            req.flash('error_msg', `Erro ao rejeitar a solicitação: ${err.message}`);
        }
        res.redirect('/superadmin/dashboard?tab=solicitacoes');
    }
});


module.exports = router;