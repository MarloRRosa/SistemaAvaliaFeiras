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
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

/**
 * Envia um e-mail com a senha temporária do administrador.
 * @param {string} email O endereço de e-mail do administrador.
 * @param {string} temporaryPassword A senha temporária gerada.
 * @param {string} escolaNome O nome da escola associada ao administrador.
 */
async function sendAdminTemporaryPasswordEmail(email, temporaryPassword, escolaNome) {
    const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
        secure: process.env.EMAIL_PORT == 465, // true for 465, false for other ports
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
        tls: {
            rejectUnauthorized: false // Aceitar certificados autoassinados ou inválidos, útil para dev
        }
    });

    const mailOptions = {
        from: `AvaliaFeiras <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Sua Senha Temporária - AvaliaFeiras',
        html: `
            <p>Olá,</p>
            <p>Sua conta de administrador para a escola <strong>${escolaNome}</strong> no sistema AvaliaFeiras foi criada com sucesso.</p>
            <p>Sua senha temporária é: <strong>${temporaryPassword}</strong></p>
            <p>Por favor, faça login em ${process.env.APP_BASE_URL}/admin/login e altere sua senha assim que possível.</p>
            <p>Atenciosamente,<br>Equipe AvaliaFeiras</p>
            <hr>
            <p style="font-size: 10px; color: #777;">Este é um e-mail automático, por favor, não responda.</p>
        `
    };

    if (process.env.EMAIL_USER && process.env.EMAIL_HOST && process.env.EMAIL_PASS) {
        await transporter.sendMail(mailOptions);
        console.log(`E-mail de senha temporária enviado para ${email}`);
    } else {
        console.warn('Variáveis de ambiente de e-mail não configuradas. E-mail de senha temporária não será enviado.');
    }
}

/**
 * Middleware para verificar se o usuário é um Super Admin e está autenticado.
 * @param {object} req Objeto de requisição.
 * @param {object} res Objeto de resposta.
 * @param {function} next Próxima função middleware.
 */
function isSuperAdminAuthenticated(req, res, next) {
    if (req.session.superAdminId) {
        return next();
    }
    req.flash('error_msg', 'Acesso negado. Por favor, faça login como Super Admin.');
    res.redirect('/superadmin/login');
}

// ========================================================================
// Rotas de Autenticação
// ========================================================================

// Rota para o formulário de login do Super Admin
router.get('/login', (req, res) => {
    if (req.session.superAdminId) {
        return res.redirect('/superadmin/dashboard'); // Redireciona se já estiver logado
    }
    res.render('superadmin/login', {
        layout: 'layout_login'
    });
});

// Rota para lidar com o login do Super Admin
router.post('/login', async (req, res) => {
    const { email, senha } = req.body;

    console.log('--- Tentativa de Login Super Admin ---');
    console.log('E-mail recebido:', email);

    if (!email || !senha) {
        console.log('Campos vazios.');
        req.flash('error_msg', 'Por favor, preencha todos os campos.');
        return res.redirect('/superadmin/login');
    }

    try {
        const emailLowerCase = email.toLowerCase();
        console.log('E-mail para busca no BD (lowercase):', emailLowerCase);

        const superAdmin = await SuperAdmin.findOne({ email: emailLowerCase });
        console.log('Super Admin encontrado:', superAdmin ? superAdmin.email : 'Nenhum');

        if (!superAdmin) {
            console.log('Super Admin não encontrado.');
            req.flash('error_msg', 'Credenciais inválidas.');
            return res.redirect('/superadmin/login');
        }

        const isMatch = await bcrypt.compare(senha, superAdmin.senha);
        console.log('Comparação de senha (isMatch):', isMatch);

        if (!isMatch) {
            console.log('Senha incorreta.');
            req.flash('error_msg', 'Credenciais inválidas.');
            return res.redirect('/superadmin/login');
        }

        // Atribui o ID do Super Admin à sessão
        req.session.superAdminId = superAdmin._id;
        console.log('ID do Super Admin atribuído à sessão:', req.session.superAdminId);

        // Força o salvamento da sessão antes de redirecionar para garantir persistência
        req.session.save(err => {
            if (err) {
                console.error('Erro ao salvar a sessão após login:', err);
                req.flash('error_msg', 'Ocorreu um erro ao persistir a sessão. Tente novamente.');
                return res.redirect('/superadmin/login');
            }
            console.log('Sessão salva com sucesso. Redirecionando para dashboard.');
            req.flash('success_msg', 'Bem-vindo ao Painel Super Admin!');
            res.redirect('/superadmin/dashboard');
        });

    } catch (err) {
        console.error('Erro no login do Super Admin (catch geral):', err);
        // Garante que o redirecionamento ocorre se req.session.save falhar ou outros erros acontecerem
        if (!res.headersSent) {
            req.flash('error_msg', 'Ocorreu um erro ao tentar fazer login. Tente novamente.');
            res.redirect('/superadmin/login');
        }
    }
});

// Rota para logout do Super Admin
router.get('/logout', isSuperAdminAuthenticated, (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Erro ao destruir sessão:', err);
            req.flash('error_msg', 'Erro ao fazer logout.');
            return res.redirect('/superadmin/dashboard');
        }
        res.clearCookie('connect.sid'); // Limpa o cookie da sessão
        req.flash('success_msg', 'Você foi desconectado com sucesso.');
        res.redirect('/superadmin/login');
    });
});

// ========================================================================
// Rotas do Dashboard
// ========================================================================

// Dashboard do Super Admin
router.get('/dashboard', isSuperAdminAuthenticated, async (req, res) => {
    try {
        const totalEscolas = await Escola.countDocuments();
        const totalAdmins = await Admin.countDocuments();
        const totalAvaliadores = await Avaliador.countDocuments();
        const totalProjetos = await Projeto.countDocuments();
        const totalFeiras = await Feira.countDocuments();
        const solicitacoesPendentes = await SolicitacaoAcesso.countDocuments({ status: 'pendente' });

        res.render('superadmin/dashboard', {
            layout: 'layout_superadmin',
            totalEscolas,
            totalAdmins,
            totalAvaliadores,
            totalProjetos,
            totalFeiras,
            solicitacoesPendentes
        });
    } catch (err) {
        console.error('Erro ao carregar dashboard do Super Admin:', err);
        req.flash('error_msg', 'Erro ao carregar os dados do dashboard.');
        res.redirect('/superadmin/login'); // ou outra rota de erro
    }
});

// ========================================================================
// Rotas de Gerenciamento de Escolas
// ========================================================================

// Listar escolas
router.get('/escolas', isSuperAdminAuthenticated, async (req, res) => {
    try {
        const escolas = await Escola.find().sort({ nome: 'asc' }).lean();
        res.render('superadmin/escolas/index', { layout: 'layout_superadmin', escolas });
    } catch (err) {
        console.error('Erro ao listar escolas:', err);
        req.flash('error_msg', 'Erro ao carregar escolas.');
        res.redirect('/superadmin/dashboard');
    }
});

// Formulário para adicionar nova escola
router.get('/escolas/nova', isSuperAdminAuthenticated, (req, res) => {
    res.render('superadmin/escolas/nova', { layout: 'layout_superadmin' });
});

// Adicionar nova escola (POST)
router.post('/escolas/nova', isSuperAdminAuthenticated, async (req, res) => {
    const { nome, endereco, telefone, emailContato } = req.body;
    let errors = [];

    if (!nome || !endereco || !telefone || !emailContato) {
        errors.push({ text: 'Por favor, preencha todos os campos.' });
    }

    if (errors.length > 0) {
        res.render('superadmin/escolas/nova', {
            layout: 'layout_superadmin',
            errors: errors,
            nome,
            endereco,
            telefone,
            emailContato
        });
    } else {
        try {
            const novaEscola = new Escola({
                nome: nome,
                endereco: endereco,
                telefone: telefone,
                emailContato: emailContato.toLowerCase()
            });

            await novaEscola.save();
            req.flash('success_msg', 'Escola adicionada com sucesso!');
            res.redirect('/superadmin/escolas');
        } catch (err) {
            console.error('Erro ao salvar escola:', err);
            req.flash('error_msg', 'Erro ao adicionar escola. Tente novamente.');
            res.redirect('/superadmin/escolas');
        }
    }
});

// Formulário de edição de escola
router.get('/escolas/editar/:id', isSuperAdminAuthenticated, async (req, res) => {
    try {
        const escola = await Escola.findById(req.params.id).lean();
        if (!escola) {
            req.flash('error_msg', 'Escola não encontrada.');
            return res.redirect('/superadmin/escolas');
        }
        res.render('superadmin/escolas/editar', { layout: 'layout_superadmin', escola });
    } catch (err) {
        console.error('Erro ao carregar escola para edição:', err);
        req.flash('error_msg', 'Erro ao carregar escola para edição.');
        res.redirect('/superadmin/escolas');
    }
});

// Editar escola (POST)
router.post('/escolas/editar/:id', isSuperAdminAuthenticated, async (req, res) => {
    const { nome, endereco, telefone, emailContato } = req.body;
    let errors = [];

    if (!nome || !endereco || !telefone || !emailContato) {
        errors.push({ text: 'Por favor, preencha todos os campos.' });
    }

    if (errors.length > 0) {
        res.render('superadmin/escolas/editar', {
            layout: 'layout_superadmin',
            errors: errors,
            escola: { _id: req.params.id, nome, endereco, telefone, emailContato } // Para manter os dados no formulário
        });
    } else {
        try {
            const escola = await Escola.findById(req.params.id);
            if (!escola) {
                req.flash('error_msg', 'Escola não encontrada.');
                return res.redirect('/superadmin/escolas');
            }

            escola.nome = nome;
            escola.endereco = endereco;
            escola.telefone = telefone;
            escola.emailContato = emailContato.toLowerCase();

            await escola.save();
            req.flash('success_msg', 'Escola atualizada com sucesso!');
            res.redirect('/superadmin/escolas');
        } catch (err) {
            console.error('Erro ao atualizar escola:', err);
            req.flash('error_msg', 'Erro ao atualizar escola. Tente novamente.');
            res.redirect('/superadmin/escolas');
        }
    }
});

// Deletar escola
router.post('/escolas/deletar/:id', isSuperAdminAuthenticated, async (req, res) => {
    try {
        const escola = await Escola.findById(req.params.id);
        if (!escola) {
            req.flash('error_msg', 'Escola não encontrada.');
            return res.redirect('/superadmin/escolas');
        }

        // Verifica e impede a exclusão se houver administradores ou feiras associadas
        const adminsAssociados = await Admin.countDocuments({ escola: escola._id });
        const feirasAssociadas = await Feira.countDocuments({ escola: escola._id });

        if (adminsAssociados > 0) {
            req.flash('error_msg', `Não é possível excluir a escola "${escola.nome}" porque ela possui ${adminsAssociados} administrador(es) associado(s).`);
            return res.redirect('/superadmin/escolas');
        }
        if (feirasAssociadas > 0) {
            req.flash('error_msg', `Não é possível excluir a escola "${escola.nome}" porque ela possui ${feirasAssociadas} feira(s) associada(s).`);
            return res.redirect('/superadmin/escolas');
        }

        await Escola.deleteOne({ _id: req.params.id });
        req.flash('success_msg', 'Escola deletada com sucesso!');
        res.redirect('/superadmin/escolas');
    } catch (err) {
        console.error('Erro ao deletar escola:', err);
        req.flash('error_msg', 'Erro ao deletar escola. Tente novamente.');
        res.redirect('/superadmin/escolas');
    }
});


// ========================================================================
// Rotas de Gerenciamento de Administradores
// ========================================================================

// Listar administradores
router.get('/admins', isSuperAdminAuthenticated, async (req, res) => {
    try {
        const admins = await Admin.find().populate('escola').sort({ nome: 'asc' }).lean();
        res.render('superadmin/admins/index', { layout: 'layout_superadmin', admins });
    } catch (err) {
        console.error('Erro ao listar administradores:', err);
        req.flash('error_msg', 'Erro ao carregar administradores.');
        res.redirect('/superadmin/dashboard');
    }
});

// Formulário para adicionar novo administrador
router.get('/admins/novo', isSuperAdminAuthenticated, async (req, res) => {
    try {
        const escolas = await Escola.find().sort({ nome: 'asc' }).lean();
        res.render('superadmin/admins/novo', { layout: 'layout_superadmin', escolas });
    } catch (err) {
        console.error('Erro ao carregar escolas para novo admin:', err);
        req.flash('error_msg', 'Erro ao carregar escolas.');
        res.redirect('/superadmin/admins');
    }
});

// Adicionar novo administrador (POST)
router.post('/admins/novo', isSuperAdminAuthenticated, async (req, res) => {
    const { nome, email, escolaId } = req.body;
    let errors = [];

    if (!nome || !email || !escolaId) {
        errors.push({ text: 'Por favor, preencha todos os campos.' });
    }

    if (errors.length > 0) {
        try {
            const escolas = await Escola.find().sort({ nome: 'asc' }).lean();
            res.render('superadmin/admins/novo', {
                layout: 'layout_superadmin',
                errors: errors,
                nome,
                email,
                escolaId,
                escolas
            });
        } catch (err) {
            console.error('Erro ao renderizar formulário com erros:', err);
            req.flash('error_msg', 'Ocorreu um erro ao processar sua solicitação.');
            res.redirect('/superadmin/admins');
        }
    } else {
        try {
            const existingAdmin = await Admin.findOne({ email: email.toLowerCase() });
            if (existingAdmin) {
                errors.push({ text: 'Já existe um administrador com este e-mail.' });
                const escolas = await Escola.find().sort({ nome: 'asc' }).lean();
                return res.render('superadmin/admins/novo', {
                    layout: 'layout_superadmin',
                    errors: errors,
                    nome,
                    email,
                    escolaId,
                    escolas
                });
            }

            const temporaryPassword = generateTemporaryPassword();
            const hashedPassword = await hashPassword(temporaryPassword);

            const novaAdmin = new Admin({
                nome: nome,
                email: email.toLowerCase(),
                senha: hashedPassword,
                escola: escolaId
            });

            await novaAdmin.save();

            const escola = await Escola.findById(escolaId);
            if (escola) {
                await sendAdminTemporaryPasswordEmail(email, temporaryPassword, escola.nome);
            } else {
                console.warn(`Escola com ID ${escolaId} não encontrada para enviar e-mail ao admin.`);
            }

            req.flash('success_msg', 'Administrador adicionado com sucesso! Uma senha temporária foi enviada para o e-mail cadastrado.');
            res.redirect('/superadmin/admins');
        } catch (err) {
            console.error('Erro ao adicionar administrador:', err);
            req.flash('error_msg', 'Erro ao adicionar administrador. Tente novamente.');
            res.redirect('/superadmin/admins');
        }
    }
});

// Formulário de edição de administrador
router.get('/admins/editar/:id', isSuperAdminAuthenticated, async (req, res) => {
    try {
        const admin = await Admin.findById(req.params.id).lean();
        if (!admin) {
            req.flash('error_msg', 'Administrador não encontrado.');
            return res.redirect('/superadmin/admins');
        }
        const escolas = await Escola.find().sort({ nome: 'asc' }).lean();
        res.render('superadmin/admins/editar', { layout: 'layout_superadmin', admin, escolas });
    } catch (err) {
        console.error('Erro ao carregar admin para edição:', err);
        req.flash('error_msg', 'Erro ao carregar administrador para edição.');
        res.redirect('/superadmin/admins');
    }
});

// Editar administrador (POST)
router.post('/admins/editar/:id', isSuperAdminAuthenticated, async (req, res) => {
    const { nome, email, escolaId } = req.body;
    let errors = [];

    if (!nome || !email || !escolaId) {
        errors.push({ text: 'Por favor, preencha todos os campos.' });
    }

    if (errors.length > 0) {
        try {
            const escolas = await Escola.find().sort({ nome: 'asc' }).lean();
            res.render('superadmin/admins/editar', {
                layout: 'layout_superadmin',
                errors: errors,
                admin: { _id: req.params.id, nome, email, escola: escolaId },
                escolas
            });
        } catch (err) {
            console.error('Erro ao renderizar formulário com erros:', err);
            req.flash('error_msg', 'Ocorreu um erro ao processar sua solicitação.');
            res.redirect('/superadmin/admins');
        }
    } else {
        try {
            const admin = await Admin.findById(req.params.id);
            if (!admin) {
                req.flash('error_msg', 'Administrador não encontrado.');
                return res.redirect('/superadmin/admins');
            }

            // Verifica se o email já existe para outro admin (se for alterado)
            if (admin.email.toLowerCase() !== email.toLowerCase()) {
                const existingAdmin = await Admin.findOne({ email: email.toLowerCase() });
                if (existingAdmin) {
                    errors.push({ text: 'Já existe outro administrador com este e-mail.' });
                    const escolas = await Escola.find().sort({ nome: 'asc' }).lean();
                    return res.render('superadmin/admins/editar', {
                        layout: 'layout_superadmin',
                        errors: errors,
                        admin: { _id: req.params.id, nome, email, escola: escolaId },
                        escolas
                    });
                }
            }

            admin.nome = nome;
            admin.email = email.toLowerCase();
            admin.escola = escolaId;

            await admin.save();
            req.flash('success_msg', 'Administrador atualizado com sucesso!');
            res.redirect('/superadmin/admins');
        } catch (err) {
            console.error('Erro ao atualizar administrador:', err);
            req.flash('error_msg', 'Erro ao atualizar administrador. Tente novamente.');
            res.redirect('/superadmin/admins');
        }
    }
});

// Resetar senha do administrador
router.post('/admins/resetar-senha/:id', isSuperAdminAuthenticated, async (req, res) => {
    try {
        const admin = await Admin.findById(req.params.id);
        if (!admin) {
            req.flash('error_msg', 'Administrador não encontrado.');
            return res.redirect('/superadmin/admins');
        }

        const temporaryPassword = generateTemporaryPassword();
        admin.senha = await hashPassword(temporaryPassword); // Hash the new temporary password
        await admin.save();

        const escola = await Escola.findById(admin.escola);
        const escolaNome = escola ? escola.nome : 'N/A';

        await sendAdminTemporaryPasswordEmail(admin.email, temporaryPassword, escolaNome);

        req.flash('success_msg', `Senha do administrador ${admin.nome} resetada com sucesso! Uma nova senha temporária foi enviada para ${admin.email}.`);
        res.redirect('/superadmin/admins');
    } catch (err) {
        console.error('Erro ao resetar senha do administrador:', err);
        req.flash('error_msg', 'Erro ao resetar senha do administrador. Tente novamente.');
        res.redirect('/superadmin/admins');
    }
});


// Deletar administrador
router.post('/admins/deletar/:id', isSuperAdminAuthenticated, async (req, res) => {
    try {
        const admin = await Admin.findById(req.params.id);
        if (!admin) {
            req.flash('error_msg', 'Administrador não encontrado.');
            return res.redirect('/superadmin/admins');
        }

        // Verifica se há feiras criadas por este admin (feitas antes de vincular admin a feira)
        // Por enquanto, não há uma ligação direta forte entre admin e feira/projeto/avaliacao
        // Se houvesse, você precisaria verificar e talvez impedir a exclusão ou reatribuir.
        // const feirasCriadas = await Feira.countDocuments({ adminCriador: admin._id });
        // if (feirasCriadas > 0) { ... }

        await Admin.deleteOne({ _id: req.params.id });
        req.flash('success_msg', 'Administrador deletado com sucesso!');
        res.redirect('/superadmin/admins');
    } catch (err) {
        console.error('Erro ao deletar administrador:', err);
        req.flash('error_msg', 'Erro ao deletar administrador. Tente novamente.');
        res.redirect('/superadmin/admins');
    }
});


// ========================================================================
// Rotas de Gerenciamento de Solicitações de Acesso
// ========================================================================

// Envia e-mail de aprovação para solicitação de acesso
async function sendApprovalEmail(solicitacao, temporaryPassword) {
    const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
        secure: process.env.EMAIL_PORT == 465,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
        tls: {
            rejectUnauthorized: false
        }
    });

    const mailOptions = {
        from: `AvaliaFeiras <${process.env.EMAIL_USER}>`,
        to: solicitacao.emailContato,
        subject: 'Sua Solicitação de Acesso foi Aprovada - AvaliaFeiras',
        html: `
            <p>Prezado(a) ${solicitacao.nomeContato},</p>
            <p>Sua solicitação de acesso para a escola <strong>${solicitacao.nomeEscola}</strong> no sistema AvaliaFeiras foi aprovada!</p>
            <p>Uma conta de administrador foi criada para você. Seus dados de acesso são:</p>
            <ul>
                <li><strong>E-mail:</strong> ${solicitacao.emailContato}</li>
                <li><strong>Senha Temporária:</strong> <strong>${temporaryPassword}</strong></li>
            </ul>
            <p>Por favor, faça login em ${process.env.APP_BASE_URL}/admin/login e altere sua senha assim que possível.</p>
            <p>Atenciosamente,<br>Equipe AvaliaFeiras</p>
            <hr>
            <p style="font-size: 10px; color: #777;">Este é um e-mail automático, por favor, não responda.</p>
        `
    };

    if (process.env.EMAIL_USER && process.env.EMAIL_HOST && process.env.EMAIL_PASS) {
        await transporter.sendMail(mailOptions);
        console.log(`E-mail de aprovação enviado para ${solicitacao.emailContato}`);
    } else {
        console.warn('Variáveis de ambiente de e-mail não configuradas. E-mail de aprovação não será enviado.');
    }
}

// Envia e-mail de rejeição para solicitação de acesso
async function sendRejectionEmail(solicitacao, motivo) {
    const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
        secure: process.env.EMAIL_PORT == 465,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
        tls: {
            rejectUnauthorized: false
        }
    });

    const mailOptionsRejeicao = {
        from: `AvaliaFeiras <${process.env.EMAIL_USER}>`,
        to: solicitacao.emailContato,
        subject: 'Atualização sobre sua Solicitação de Acesso - AvaliaFeiras',
        html: `
            <p>Prezado(a) ${solicitacao.nomeContato},</p>
            <p>Informamos que sua solicitação de acesso para a escola <strong>${solicitacao.nomeEscola}</strong> no sistema AvaliaFeiras foi revisada e, infelizmente, não pôde ser aprovada neste momento.</p>
            <p><strong>Motivo:</strong> ${motivo || 'Motivo não especificado.'}</p>
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
}


// Listar solicitações de acesso (pendentes e outras)
router.get('/solicitacoes', isSuperAdminAuthenticated, async (req, res) => {
    try {
        const solicitacoes = await SolicitacaoAcesso.find().sort({ dataCriacao: 'desc' }).lean();
        res.render('superadmin/solicitacoes/index', { layout: 'layout_superadmin', solicitacoes });
    } catch (err) {
        console.error('Erro ao listar solicitações:', err);
        req.flash('error_msg', 'Erro ao carregar solicitações de acesso.');
        res.redirect('/superadmin/dashboard');
    }
});

// Aprovar solicitação de acesso
router.post('/solicitacoes/aprovar/:id', isSuperAdminAuthenticated, async (req, res) => {
    try {
        const solicitacao = await SolicitacaoAcesso.findById(req.params.id);
        if (!solicitacao) {
            req.flash('error_msg', 'Solicitação não encontrada.');
            return res.redirect('/superadmin/solicitacoes');
        }

        if (solicitacao.status !== 'pendente') {
            req.flash('error_msg', 'Esta solicitação já foi processada.');
            return res.redirect('/superadmin/solicitacoes');
        }

        // 1. Criar a Escola
        const novaEscola = new Escola({
            nome: solicitacao.nomeEscola,
            endereco: solicitacao.enderecoEscola,
            telefone: solicitacao.telefoneEscola,
            emailContato: solicitacao.emailContatoEscola.toLowerCase() // Usa o email de contato da escola se disponível, senão o do contato principal
        });
        await novaEscola.save();

        // 2. Gerar senha temporária e hash
        const temporaryPassword = generateTemporaryPassword();
        const hashedPassword = await hashPassword(temporaryPassword);

        // 3. Criar o Administrador
        const novoAdmin = new Admin({
            nome: solicitacao.nomeContato,
            email: solicitacao.emailContato.toLowerCase(),
            senha: hashedPassword,
            escola: novaEscola._id // Vincula ao ID da escola recém-criada
        });
        await novoAdmin.save();

        // 4. Atualizar o status da solicitação
        solicitacao.status = 'aprovada';
        solicitacao.dataProcessamento = Date.now();
        await solicitacao.save();

        // 5. Enviar e-mail de aprovação com senha temporária
        await sendApprovalEmail(solicitacao, temporaryPassword);

        req.flash('success_msg', `Solicitação de "${solicitacao.nomeEscola}" aprovada e administrador criado com sucesso.`);
        res.redirect('/superadmin/solicitacoes');

    } catch (err) {
        console.error('Erro ao aprovar solicitação:', err);
        // Verifica se o erro é devido a um email de admin duplicado
        if (err.code === 11000 && err.keyPattern && err.keyPattern.email) {
            req.flash('error_msg', `Erro ao aprovar a solicitação: Já existe um administrador com o e-mail "${err.keyValue.email}".`);
        } else {
            req.flash('error_msg', `Erro ao aprovar a solicitação: ${err.message || err}.`);
        }
        if (!res.headersSent) {
            res.redirect('/superadmin/solicitacoes');
        }
    }
});

// Rejeitar solicitação de acesso
router.post('/solicitacoes/rejeitar/:id', isSuperAdminAuthenticated, async (req, res) => {
    try {
        const { motivo } = req.body; // Campo para o Super Admin digitar o motivo
        const solicitacao = await SolicitacaoAcesso.findById(req.params.id);
        if (!solicitacao) {
            req.flash('error_msg', 'Solicitação não encontrada.');
            return res.redirect('/superadmin/solicitacoes');
        }

        if (solicitacao.status !== 'pendente') {
            req.flash('error_msg', 'Esta solicitação já foi processada.');
            return res.redirect('/superadmin/solicitacoes');
        }

        solicitacao.status = 'rejeitada';
        solicitacao.dataProcessamento = Date.now();
        solicitacao.motivoRejeicao = motivo; // Salva o motivo
        await solicitacao.save();

        // Enviar e-mail de rejeição
        await sendRejectionEmail(solicitacao, motivo);

        req.flash('success_msg', `Solicitação de "${solicitacao.nomeEscola}" rejeitada com sucesso.`);
        res.redirect('/superadmin/solicitacoes');

    } catch (err) {
        console.error('Erro ao rejeitar solicitação:', err);
        if (!res.headersSent) {
            req.flash('error_msg', `Erro ao rejeitar a solicitação: ${err.message || err}.`);
            res.redirect('/superadmin/solicitacoes');
        }
    }
});

// Detalhes da solicitação
router.get('/solicitacoes/detalhes/:id', isSuperAdminAuthenticated, async (req, res) => {
    try {
        const solicitacao = await SolicitacaoAcesso.findById(req.params.id).lean();
        if (!solicitacao) {
            req.flash('error_msg', 'Solicitação não encontrada.');
            return res.redirect('/superadmin/solicitacoes');
        }
        res.render('superadmin/solicitacoes/detalhes', { layout: 'layout_superadmin', solicitacao });
    } catch (err) {
        console.error('Erro ao carregar detalhes da solicitação:', err);
        req.flash('error_msg', 'Erro ao carregar detalhes da solicitação.');
        res.redirect('/superadmin/solicitacoes');
    }
});

// ========================================================================
// Rotas de Gerenciamento de Feiras (somente leitura para Super Admin)
// ========================================================================

// Listar Feiras (Super Admin)
router.get('/feiras', isSuperAdminAuthenticated, async (req, res) => {
    try {
        // Popula o campo 'escola' com o nome da escola
        const feiras = await Feira.find().populate('escola', 'nome').sort({ dataInicio: 'desc' }).lean();
        res.render('superadmin/feiras/index', { layout: 'layout_superadmin', feiras });
    } catch (err) {
        console.error('Erro ao listar feiras para Super Admin:', err);
        req.flash('error_msg', 'Erro ao carregar feiras.');
        res.redirect('/superadmin/dashboard');
    }
});

// Detalhes da Feira (Super Admin)
router.get('/feiras/detalhes/:id', isSuperAdminAuthenticated, async (req, res) => {
    try {
        const feira = await Feira.findById(req.params.id)
            .populate('escola')
            .populate('criteriosAvaliacao')
            .lean();

        if (!feira) {
            req.flash('error_msg', 'Feira não encontrada.');
            return res.redirect('/superadmin/feiras');
        }

        const projetos = await Projeto.find({ feira: feira._id })
            .populate('escola')
            .lean();

        res.render('superadmin/feiras/detalhes', { layout: 'layout_superadmin', feira, projetos });
    } catch (err) {
        console.error('Erro ao carregar detalhes da feira para Super Admin:', err);
        req.flash('error_msg', 'Erro ao carregar detalhes da feira.');
        res.redirect('/superadmin/feiras');
    }
});

// ========================================================================
// Rotas de Gerenciamento de Projetos (somente leitura para Super Admin)
// ========================================================================

// Listar Projetos (Super Admin)
router.get('/projetos', isSuperAdminAuthenticated, async (req, res) => {
    try {
        const projetos = await Projeto.find()
            .populate('escola')
            .populate('feira', 'nome') // Popula apenas o nome da feira
            .sort({ nome: 'asc' })
            .lean();

        res.render('superadmin/projetos/index', { layout: 'layout_superadmin', projetos });
    } catch (err) {
        console.error('Erro ao listar projetos para Super Admin:', err);
        req.flash('error_msg', 'Erro ao carregar projetos.');
        res.redirect('/superadmin/dashboard');
    }
});

// Detalhes do Projeto (Super Admin)
router.get('/projetos/detalhes/:id', isSuperAdminAuthenticated, async (req, res) => {
    try {
        const projeto = await Projeto.findById(req.params.id)
            .populate('escola')
            .populate('feira')
            .lean();

        if (!projeto) {
            req.flash('error_msg', 'Projeto não encontrado.');
            return res.redirect('/superadmin/projetos');
        }

        // Encontrar as avaliações para este projeto
        const avaliacoes = await Avaliacao.find({ projeto: projeto._id })
            .populate('avaliador', 'nome') // Popula o nome do avaliador
            .populate('criterios.criterioId', 'nome') // Popula o nome do critério
            .lean();

        res.render('superadmin/projetos/detalhes', { layout: 'layout_superadmin', projeto, avaliacoes });
    } catch (err) {
        console.error('Erro ao carregar detalhes do projeto para Super Admin:', err);
        req.flash('error_msg', 'Erro ao carregar detalhes do projeto.');
        res.redirect('/superadmin/projetos');
    }
});


// ========================================================================
// Rotas de Gerenciamento de Avaliadores (somente leitura para Super Admin)
// ========================================================================

// Listar Avaliadores (Super Admin)
router.get('/avaliadores', isSuperAdminAuthenticated, async (req, res) => {
    try {
        const avaliadores = await Avaliador.find().sort({ nome: 'asc' }).lean();
        res.render('superadmin/avaliadores/index', { layout: 'layout_superadmin', avaliadores });
    } catch (err) {
        console.error('Erro ao listar avaliadores para Super Admin:', err);
        req.flash('error_msg', 'Erro ao carregar avaliadores.');
        res.redirect('/superadmin/dashboard');
    }
});

// Detalhes do Avaliador (Super Admin)
router.get('/avaliadores/detalhes/:id', isSuperAdminAuthenticated, async (req, res) => {
    try {
        const avaliador = await Avaliador.findById(req.params.id).lean();

        if (!avaliador) {
            req.flash('error_msg', 'Avaliador não encontrado.');
            return res.redirect('/superadmin/avaliadores');
        }

        // Opcional: Listar avaliações feitas por este avaliador
        const avaliacoesFeitas = await Avaliacao.find({ avaliador: avaliador._id })
            .populate('projeto', 'nome') // Popula o nome do projeto
            .populate('feira', 'nome')   // Popula o nome da feira
            .lean();

        res.render('superadmin/avaliadores/detalhes', { layout: 'layout_superadmin', avaliador, avaliacoesFeitas });
    } catch (err) {
        console.error('Erro ao carregar detalhes do avaliador para Super Admin:', err);
        req.flash('error_msg', 'Erro ao carregar detalhes do avaliador.');
        res.redirect('/superadmin/avaliadores');
    }
});

// ========================================================================
// Rotas de Gerenciamento de Critérios de Avaliação (somente leitura para Super Admin)
// ========================================================================

// Listar Critérios (Super Admin)
router.get('/criterios', isSuperAdminAuthenticated, async (req, res) => {
    try {
        const criterios = await Criterio.find().sort({ nome: 'asc' }).lean();
        res.render('superadmin/criterios/index', { layout: 'layout_superadmin', criterios });
    } catch (err) {
        console.error('Erro ao listar critérios para Super Admin:', err);
        req.flash('error_msg', 'Erro ao carregar critérios de avaliação.');
        res.redirect('/superadmin/dashboard');
    }
});

// ========================================================================
// Rotas de Gerenciamento de Avaliações (somente leitura para Super Admin)
// ========================================================================

// Listar Avaliações (Super Admin)
router.get('/avaliacoes', isSuperAdminAuthenticated, async (req, res) => {
    try {
        const avaliacoes = await Avaliacao.find()
            .populate('projeto', 'nome')
            .populate('avaliador', 'nome')
            .populate('feira', 'nome')
            .lean();

        res.render('superadmin/avaliacoes/index', { layout: 'layout_superadmin', avaliacoes });
    } catch (err) {
        console.error('Erro ao listar avaliações para Super Admin:', err);
        req.flash('error_msg', 'Erro ao carregar avaliações.');
        res.redirect('/superadmin/dashboard');
    }
});

// Detalhes da Avaliação (Super Admin)
router.get('/avaliacoes/detalhes/:id', isSuperAdminAuthenticated, async (req, res) => {
    try {
        const avaliacao = await Avaliacao.findById(req.params.id)
            .populate('projeto')
            .populate('avaliador')
            .populate('feira')
            .populate('criterios.criterioId', 'nome descricao') // Popula nome e descrição dos critérios
            .lean();

        if (!avaliacao) {
            req.flash('error_msg', 'Avaliação não encontrada.');
            return res.redirect('/superadmin/avaliacoes');
        }

        // Calcula a pontuação total da avaliação
        avaliacao.pontuacaoTotal = avaliacao.criterios.reduce((acc, c) => acc + (c.pontuacao || 0), 0);

        res.render('superadmin/avaliacoes/detalhes', { layout: 'layout_superadmin', avaliacao });
    } catch (err) {
        console.error('Erro ao carregar detalhes da avaliação para Super Admin:', err);
        req.flash('error_msg', 'Erro ao carregar detalhes da avaliação.');
        res.redirect('/superadmin/avaliacoes');
    }
});


module.exports = router;
