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
const Admin = require('../models/Admin');

const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const puppeteer = require('puppeteer');
const chromium = require('@sparticuz/chromium');
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

// Carrega variáveis de ambiente (garante que estão disponíveis para este arquivo)
require('dotenv').config();


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

// Função para formatar data para input HTML (YYYY-MM-DD)
function formatarDataParaInput(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Função para enviar e-mail de redefinição de PIN para avaliador
async function sendResetPinEmail(avaliador) {
    const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
        secure: process.env.EMAIL_SECURE === 'true',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        },
        tls: {
            rejectUnauthorized: false
        }
    });

    const mailOptions = {
        from: `"AvaliaFeiras" <${process.env.EMAIL_USER}>`,
        to: avaliador.email,
        subject: 'Redefinição de PIN do Avaliador - AvaliaFeiras',
        html: `
            <p>Olá, ${avaliador.nome},</p>
            <p>Seu PIN de acesso ao sistema AvaliaFeiras foi redefinido.</p>
            <p>Seu novo PIN é: <strong>${avaliador.pin}</strong></p>
            <p>Por favor, utilize este PIN para acessar sua conta de avaliador.</p>
            <p>Se você não solicitou esta redefinição, por favor, ignore este e-mail.</p>
            <br>
            <p>Atenciosamente,</p>
            <p>Equipe AvaliaFeiras</p>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Email de redefinição de PIN enviado para ${avaliador.email}`);
        return true;
    } catch (error) {
        console.error(`Erro ao enviar email de redefinição de PIN para ${avaliador.email}:`, error);
        return false;
    }
}


// ===========================================
// VERIFICAÇÃO DE MODELOS (Adicionado para depuração)
// ===========================================
// Verifica se os modelos foram carregados corretamente.
// Se qualquer um desses for undefined ou não for um Model Mongoose,
// indica um problema de importação/carregamento.
if (!Feira || typeof Feira.findOne !== 'function' ||
    !Projeto || typeof Projeto.findOne !== 'function' ||
    !Categoria || typeof Categoria.findOne !== 'function' ||
    !Criterio || typeof Criterio.findOne !== 'function' ||
    !Avaliador || typeof Avaliador.findOne !== 'function' ||
    !Avaliacao || typeof Avaliacao.findOne !== 'function' ||
    !Admin || typeof Admin.findOne !== 'function' ||
    !Escola || typeof Escola.findOne !== 'function') {
    console.error('ERRO CRÍTICO: Um ou mais modelos Mongoose não foram carregados corretamente. Verifique os caminhos de importação e a exportação dos modelos.');
    // Isso pode causar um erro de inicialização ou impedir o servidor de subir corretamente.
    // Dependendo da criticidade, você pode querer encerrar o processo: process.exit(1);
}


// ===========================================
// FUNÇÕES AUXILIARES
// ===========================================

// Função para gerar PIN numérico aleatório de 6 dígitos.
function generatePin() {
    return Math.floor(100000 + Math.random() * 900000).toString(); // Gera um número entre 100000 e 999999
}

// Função para formatar data para input HTML (YYYY-MM-DD)
// Já definida acima, mantendo a consistência do seu arquivo.

// ===========================================
// CONFIGURAÇÃO DO NODEMAILER
// ===========================================
// Certifique-se de que as variáveis de ambiente EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, EMAIL_SENDER_ADDRESS estão configuradas.
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT, 10),
    secure: process.env.EMAIL_SECURE === 'true', // Use 'true' para 465 (SSL), 'false' para 587 (TLS/STARTTLS)
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        // Isso é crucial para ambientes como Render que podem ter certificados autoassinados ou proxies
        // Em produção, isso pode ser um risco de segurança e deve ser usado com cautela.
        rejectUnauthorized: false
    }
});

// Função para enviar e-mail com PIN para Avaliador ou redefinição
async function sendAvaliadorPinEmail(avaliador, appUrl, isReset = false) {
    const subject = isReset ? 'Redefinição de PIN do Avaliador - AvaliaFeiras' : 'Seu PIN de Acesso ao Sistema AvaliaFeiras';
    const bodyHtml = isReset ? `
        <p>Olá, ${avaliador.nome},</p>
        <p>Seu PIN de acesso ao sistema AvaliaFeiras foi redefinido.</p>
        <p>Seu novo PIN é: <strong>${avaliador.pin}</strong></p>
        <p>Por favor, utilize este PIN para acessar sua conta de avaliador.</p>
        <p>Se você não solicitou esta redefinição, por favor, ignore este e-mail.</p>
    ` : `
        <p>Olá, ${avaliador.nome},</p>
        <p>Seu PIN de acesso para avaliar projetos no sistema AvaliaFeiras foi gerado:</p>
        <p><strong>PIN: ${avaliador.pin}</strong></p>
        <p>Para aceder ao portal de avaliadores, clique aqui: <a href="${appUrl}/avaliador/login">${appUrl}/avaliador/login</a></p>
        <p>Por favor, não partilhe este PIN. Ele é único para o seu acesso.</p>
    `;

    const mailOptions = {
        from: `"AvaliaFeiras" <${process.env.EMAIL_SENDER_ADDRESS}>`,
        to: avaliador.email,
        subject: subject,
        html: `
            ${bodyHtml}
            <p>Atenciosamente,<br>Equipe AvaliaFeiras</p>
            <hr>
            <p style="font-size: 10px; color: #777;">Este é um e-mail automático, por favor, não responda.</p>
        `
    };

    try {
        if (process.env.EMAIL_USER && process.env.EMAIL_HOST && process.env.EMAIL_PASS && process.env.EMAIL_SENDER_ADDRESS) {
            await transporter.sendMail(mailOptions);
            console.log(`[Email] ${isReset ? 'PIN redefinido' : 'PIN inicial'} enviado para o avaliador ${avaliador.email}`);
            return true;
        } else {
            console.warn('[Email] Variáveis de ambiente de e-mail não configuradas. E-mail de PIN para avaliador não será enviado.');
            return false;
        }
    } catch (error) {
        console.error(`[Email] Erro ao enviar e-mail de PIN para ${avaliador.email}:`, error);
        return false;
    }
}


// ===========================================
// MIDDLEWARE DE AUTENTICAÇÃO
// ===========================================

// Middleware para verificar se o usuário é um admin autenticado e tem escolaId na sessão
function verificarAdminEscola(req, res, next) {
    // É crucial verificar res.headersSent para evitar o erro "Cannot set headers after they are sent to the client"
    if (res.headersSent) {
        console.warn('Headers já enviados, impedindo redirecionamento em verificarAdminEscola.');
        return; // Não faça nada se os headers já foram enviados
    }

    if (req.session.adminEscola && req.session.adminEscola.role === 'admin' && req.session.adminEscola.escolaId) {
        return next();
    }

    // Se o admin logou mas não tem escolaId na sessão (problema de dados ou sessão antiga)
    if (req.session.adminEscola && !req.session.adminEscola.escolaId) {
        const errorMessage = 'Seu perfil de administrador não está vinculado a uma escola válida. Faça login novamente ou entre em contato com o suporte.';
        
        req.session.destroy(err => {
            if (err) console.error('Erro ao destruir sessão por falta de escolaId:', err);
            // Certifica-se de limpar o cookie APENAS se a sessão foi destruída
            if (!res.headersSent) {
                res.clearCookie('connect.sid'); // Limpa o cookie da sessão
                req.flash('error_msg', errorMessage); // Tenta usar flash, mas pode falhar se a sessão já foi embora
                res.redirect('/admin/login');
            }
        });
        return; // Sai da função para evitar o erro "headers already sent"
    }

    // Se não está logado
    req.flash('error_msg', 'Por favor, faça login como administrador para acessar esta página.');
    res.redirect('/admin/login');
}

// Middleware para verificar se o usuário é um super admin (admin@admin.com)
// Esta função parece estar fora do escopo do admin.js para usuários admin normais,
// mas se for usada, é importante garantir a existência do 'isAdmin' ou 'role' na sessão.
// Vou mantê-la como estava, mas a revisão do fluxo de superadmin deve ser feita no routes/superadmin.js
function verificarSuperAdmin(req, res, next) {
    if (req.session && req.session.adminEscola && req.session.adminEscola.email === 'admin@admin.com') {
        return next();
    }
    req.flash('error_msg', 'Você não tem permissão para realizar esta ação.');
    res.redirect('/admin/dashboard');
}


// ===========================================
// ROTAS DE AUTENTICAÇÃO (ADMIN)
// ===========================================

// Rota de Login (GET) - Renderiza o formulário de login
router.get('/login', (req, res) => {
    res.render('admin/login', {
        layout: 'layouts/public', // Caminho correto para o layout público
        titulo: 'Login Admin',
        error_msg: req.flash('error_msg'),
        success_msg: req.flash('success_msg'),
        error: req.flash('error')
    });
});

// Rota de Login (POST) - Processa o formulário de login
router.post('/login', async (req, res) => {
    const { usuario, senha } = req.body;

    if (!usuario || !senha) {
        req.flash('error_msg', 'Por favor, preencha todos os campos.');
        return res.render('admin/login', { // Caminho correto para a view
            layout: 'layouts/public', // Caminho correto para o layout público
            titulo: 'Login Admin',
            error_msg: req.flash('error_msg'),
            usuario
        });
    }

    try {
        const admin = await Admin.findOne({ email: usuario }).populate('escolaId');

        if (!admin) {
            req.flash('error_msg', 'Credenciais inválidas.');
            return res.render('admin/login', {
                layout: 'layouts/public', // Caminho correto para o layout público
                titulo: 'Login Admin',
                error_msg: req.flash('error_msg'),
                usuario
            });
        }

        const isMatch = await bcrypt.compare(senha, admin.senha);

        if (!isMatch) {
            req.flash('error_msg', 'Credenciais inválidas.');
            return res.render('admin/login', {
                layout: 'layouts/public', // Caminho correto para o layout público
                titulo: 'Login Admin',
                error_msg: req.flash('error_msg'),
                usuario
            });
        }

        let escolaIdParaSessao = null;
        if (admin.escolaId && admin.escolaId._id) {
            escolaIdParaSessao = admin.escolaId._id.toString();
        } else {
            console.error(`Admin ${admin.email} logado mas não possui uma escola associada válida.`);
            const errorMessage = 'Seu perfil de administrador não está vinculado a uma escola válida. Por favor, entre em contato com o suporte.';
            
            req.session.destroy(err => {
                if (err) console.error('Erro ao destruir sessão durante login por falta de escolaId:', err);
                
                if (!res.headersSent) {
                    res.clearCookie('connect.sid'); 
                    res.render('admin/login', {
                        layout: 'layouts/public', // Caminho correto para o layout público
                        titulo: 'Login Admin',
                        error_msg: errorMessage,
                        usuario
                    });
                }
            });
            return;
        }

        req.session.adminEscola = {
            id: admin._id,
            nome: admin.nome,
            email: admin.email,
            role: admin.role || 'admin',
            escolaId: escolaIdParaSessao
        };

        req.flash('success_msg', 'Login de administrador realizado com sucesso!');
        res.redirect('/admin/dashboard');

    } catch (err) {
        console.error('Erro no login do administrador:', err);
        if (!res.headersSent) {
            req.flash('error_msg', 'Erro no servidor. Tente novamente mais tarde. Detalhes: ' + err.message);
            res.render('admin/login', {
                layout: 'layouts/public', // Caminho correto para o layout público
                titulo: 'Login Admin',
                error_msg: req.flash('error_msg'),
                usuario
            });
        }
    }
});

// Rota de Logout (POST)
router.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Erro ao destruir sessão:', err);
            return res.status(500).send('Erro ao fazer logout.');
        }
        res.redirect('/admin/login');
    });
});


// ===================================
// ROTAS DE RECUPERAÇÃO DE SENHA
// ===================================

// Rota GET para exibir o formulário de solicitação de recuperação de senha
router.get('/recuperar-senha', (req, res) => {
    res.render('admin/recuperar-senha', { // Caminho correto para a view
        titulo: 'Recuperar Senha',
        layout: 'layouts/public', // Caminho correto para o layout público
        error_msg: req.flash('error_msg'),
        success_msg: req.flash('success_msg')
    });
});

// Rota POST para processar a solicitação de recuperação de senha (envia o e-mail)
router.post('/recuperar-senha', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        req.flash('error_msg', 'Por favor, informe seu e-mail.');
        return res.redirect('/admin/recuperar-senha');
    }

    try {
        const admin = await Admin.findOne({ email: email });

        if (!admin) {
            req.flash('success_msg', 'Se o e-mail informado estiver cadastrado, um link de redefinição será enviado.');
            return res.redirect('/admin/recuperar-senha');
        }

        const token = crypto.randomBytes(20).toString('hex');

        admin.resetPasswordToken = token;
        admin.resetPasswordExpires = Date.now() + 3600000; // 1 hora
        await admin.save();

        const resetURL = `${process.env.APP_URL || 'http://localhost:3000'}/admin/resetar-senha/${token}`;

        const mailOptions = {
            from: {
                name: 'AvaliaFeiras',
                address: process.env.EMAIL_SENDER_ADDRESS
            },
            to: admin.email,
            subject: 'Redefinição de Senha - Sistema AvaliaFeiras',
            html: `
                <p>Olá,</p>
                <p>Você solicitou a redefinição da sua senha no Sistema AvaliaFeiras.</p>
                <p>Por favor, clique no link abaixo para redefinir sua senha:</p>
                <p><a href="${resetURL}">${resetURL}</a></p>
                <p>Este link é válido por 1 hora. Se você não solicitou esta redefinição, por favor, ignore este e-mail.</p>
                <p>Atenciosamente,<br>Equipe AvaliaFeiras</p>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`E-mail de redefinição enviado para: ${admin.email}`);
        req.flash('success_msg', 'Um link de redefinição de senha foi enviado para seu e-mail.');
        res.redirect('/admin/recuperar-senha');

    } catch (err) {
        console.error('Erro na solicitação de recuperação de senha:', err);
        req.flash('error_msg', 'Ocorreu um erro ao processar sua solicitação. Por favor, tente novamente.');
        res.redirect('/admin/recuperar-senha');
    }
});

// Rota GET para exibir o formulário de redefinição de senha (com token)
router.get('/resetar-senha/:token', async (req, res) => {
    try {
        const admin = await Admin.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!admin) {
            req.flash('error_msg', 'Token de redefinição de senha inválido ou expirado.');
            return res.redirect('/admin/recuperar-senha');
        }

        res.render('admin/resetar-senha', { // Caminho correto para a view
            titulo: 'Redefinir Senha',
            token: req.params.token,
            layout: 'layouts/public', // Caminho correto para o layout público
            error_msg: req.flash('error_msg'),
            success_msg: req.flash('success_msg')
        });

    } catch (err) {
        console.error('Erro ao carregar página de redefinição:', err);
        req.flash('error_msg', 'Ocorreu um erro ao carregar a página de redefinição. Por favor, tente novamente.');
        res.redirect('/admin/recuperar-senha');
    }
});

// Rota POST para processar a nova senha
router.post('/resetar-senha/:token', async (req, res) => {
    const { token } = req.params;
    const { senha, confirmarSenha } = req.body;

    let errors = [];
    if (senha !== confirmarSenha) {
        errors.push({ msg: 'As senhas não coincidem.' });
    }
    if (senha.length < 6) {
        errors.push({ msg: 'A senha deve ter pelo menos 6 caracteres.' });
    }

    if (errors.length > 0) {
        req.flash('error_msg', errors.map(e => e.msg).join(' '));
        return res.render('admin/resetar-senha', { // Caminho correto para a view
            titulo: 'Redefinir Senha',
            token: token,
            layout: 'layouts/public', // Caminho correto para o layout público
            error_msg: req.flash('error_msg')
        });
    }

    try {
        const admin = await Admin.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!admin) {
            req.flash('error_msg', 'Token de redefinição de senha inválido ou expirado.');
            return res.redirect('/admin/recuperar-senha');
        }

        const salt = await bcrypt.genSalt(10);
        admin.senha = await bcrypt.hash(senha, salt);

        admin.resetPasswordToken = undefined;
        admin.resetPasswordExpires = undefined;

        await admin.save();

        req.flash('success_msg', 'Sua senha foi redefinida com sucesso. Faça login com sua nova senha.');
        res.redirect('/admin/login');

    }
    catch (err) {
        console.error('Erro na redefinição de senha:', err);
        req.flash('error_msg', 'Ocorreu um erro ao redefinir sua senha. Por favor, tente novamente.');
        res.render('admin/resetar-senha', { // Caminho correto para a view
            titulo: 'Redefinir Senha',
            token: token,
            layout: 'layouts/public', // Caminho correto para o layout público
            error_msg: req.flash('error_msg')
        });
    }
});

// ===========================================
// ROTAS DO DASHBOARD (PROTEGIDAS)
// ===========================================

// Rota principal do Dashboard Admin
router.get('/dashboard', verificarAdminEscola, async (req, res) => {
    // É crucial verificar res.headersSent para evitar o erro "Cannot set headers after they are sent to the client"
    if (res.headersSent) {
        console.warn('Headers já enviados na rota do dashboard, abortando renderização.');
        return;
    }
    try {
        // Obtém o escolaId da sessão do admin logado
        const escolaId = req.session.adminEscola.escolaId;

        // Filtra todas as consultas por escolaId
        let feiraAtual = await Feira.findOne({ status: 'ativa', escolaId: escolaId }).lean(); // Use .lean() para objetos JS puros
        let feiras = await Feira.find({ escolaId: escolaId }).sort({ inicioFeira: -1 }).lean();

        const escolaDoAdmin = await Escola.findById(escolaId).lean(); // Pega a escola do admin logado
        const escolas = []; // Não populamos escolas aqui por enquanto, para evitar sobrecarga. Mantenha vazio se não precisar.

        const escola = escolaDoAdmin || { // Garante que 'escola' sempre tenha um valor padrão
            nome: "Nome da Escola",
            endereco: "Endereço da Escola",
            telefone: "(XX) XXXX-XXXX",
            email: "email@escola.com",
            descricao: "Descrição da escola.",
            diretor: "Nome do Diretor",
            responsavel: "Nome do Responsável",
            _id: null
        };
        
        // Lógica para carregar feira pela query param, se houver
        const feiraSelecionadaId = req.query.feiraId;
        if (feiraSelecionadaId && mongoose.Types.ObjectId.isValid(feiraSelecionadaId)) {
            const selectedFeira = await Feira.findOne({ _id: feiraSelecionadaId, escolaId: escolaId }).lean();
            if (selectedFeira) {
                feiraAtual = selectedFeira;
            } else {
                req.flash('error_msg', 'Feira selecionada não encontrada ou não pertence à sua escola.');
            }
        }
        
        // Se não houver feira ativa, mas houver feiras arquivadas, seleciona a mais recente
        if (!feiraAtual && feiras.length > 0) {
            const ultimaFeiraArquivada = await Feira.findOne({ escolaId: escolaId, status: 'arquivada' }).sort({ createdAt: -1 }).lean();
            if (ultimaFeiraArquivada) {
                feiraAtual = ultimaFeiraArquivada;
            }
        }
        
        // Se ainda não houver feiraAtual e nenhuma feira existente, cria uma feira inicial
        if (!feiraAtual && feiras.length === 0) {
            console.log('Nenhuma feira encontrada. Criando feira inicial para a escola:', escola.nome);
            const novaFeiraInicial = new Feira({
                nome: `Feira Inicial ${new Date().getFullYear()}`,
                escolaId: escolaId,
                status: 'ativa',
                inicioFeira: new Date(),
                fimFeira: new Date(new Date().setFullYear(new Date().getFullYear() + 1)), // Válida por 1 ano
            });
            await novaFeiraInicial.save();
            feiraAtual = novaFeiraInicial.toObject(); // Converter para objeto simples para passar ao EJS
            // Re-fetch feiras to include the newly created one
            feiras = await Feira.find({ escolaId: escolaId }).sort({ inicioFeira: -1 }).lean();
            req.flash('success_msg', 'Nenhuma feira encontrada. Uma feira inicial foi criada automaticamente.');
        }

        if (feiraAtual) {
            feiraAtual.inicioFeiraFormatted = formatarDataParaInput(feiraAtual.inicioFeira);
            feiraAtual.fimFeiraFormatted = formatarDataParaInput(feiraAtual.fimFeira);
        }

        // --- INÍCIO: PREPARAÇÃO DE DADOS PARA O DASHBOARD GERAL (TODAS AS ABAS) ---
        // Todas as buscas agora incluem o filtro 'escolaId: escolaId'
        const projetosFetched = feiraAtual ? await Projeto.find({ feira: feiraAtual._id, escolaId: escolaId }).populate('categoria').populate('criterios').lean() : [];
        const categoriasFetched = feiraAtual ? await Categoria.find({ feira: feiraAtual._id, escolaId: escolaId }).lean() : [];
        const criteriosOficiais = feiraAtual ? await Criterio.find({ feira: feiraAtual._id, escolaId: escolaId }).lean() : [];
        const avaliadoresFetched = feiraAtual ? await Avaliador.find({ feira: feiraAtual._id, escolaId: escolaId }).populate('projetosAtribuidos').lean() : [];
        const avaliacoesFetched = feiraAtual ? await Avaliacao.find({ feira: feiraAtual._id, escola: escolaId }).lean() : []; // 'escola' no Avaliacao é o escolaId

        let projetosPorCategoria = {};
        if (feiraAtual && projetosFetched) {
            projetosFetched.forEach(p => {
                const categoriaNome = p.categoria ? p.categoria.nome : 'Sem Categoria';
                if (!projetosPorCategoria[categoriaNome]) {
                    projetosPorCategoria[categoriaNome] = [];
                }
                projetosPorCategoria[categoriaNome].push(p);
            });
        }

        let avaliacoesPorAvaliadorCount = {};
        if (feiraAtual && avaliadoresFetched) {
            avaliadoresFetched.forEach(av => {
                const avaliacoesFeitas = avaliacoesFetched.filter(a => String(a.avaliador) === String(av._id)).length;
                avaliacoesPorAvaliadorCount[av.nome] = avaliacoesFeitas;
            });
        }

        let mediaAvaliacaoPorCriterio = {};
        if (feiraAtual && avaliacoesFetched.length > 0) {
            const criteriosMap = {};
            avaliacoesFetched.forEach(avaliacao => {
                const notasArray = avaliacao.notas || avaliacao.itens;
                if (notasArray && Array.isArray(notasArray)) {
                    notasArray.forEach(item => {
                        if (item.criterio && item.nota !== undefined && item.nota !== null) {
                            const criterioId = String(item.criterio);
                            if (!criteriosMap[criterioId]) {
                                criteriosMap[criterioId] = { sum: 0, count: 0 };
                            }
                            criteriosMap[criterioId].sum += parseFloat(item.nota);
                            criteriosMap[criterioId].count++;
                        }
                    });
                }
            });

            for (const id in criteriosMap) {
                const criterio = criteriosOficiais.find(c => String(c._id) === id);
                if (criterio) {
                    mediaAvaliacaoPorCriterio[criterio.nome] = criteriosMap[id].sum / criteriosMap[id].count;
                }
            }
        }

        let statusProjetosCount = {
            'Não Avaliado': 0,
            'Em avaliação': 0,
            'Avaliado': 0
        };
        // Métricas para o Dashboard Geral
        let totalProjetos = 0;
        let totalAvaliadores = 0;
        let projetosAvaliadosCompletosCount = 0;
        let projetosPendentesAvaliacaoCount = 0;
        let mediaGeralAvaliacoes = 'N/A';

        if (feiraAtual) {
            totalProjetos = await Projeto.countDocuments({ feira: feiraAtual._id, escolaId: escolaId }); // USANDO escolaId AQUI
            totalAvaliadores = await Avaliador.countDocuments({ feira: feiraAtual._id, escolaId: escolaId }); // USANDO escolaId AQUI

            let totalNotasGerais = 0;
            let countNotasGerais = 0;

            for (const projeto of projetosFetched) {
                const avaliacoesDoProjeto = avaliacoesFetched.filter(a => a.projeto && String(a.projeto) === String(projeto._id));
                const numAvaliadoresAtribuidos = avaliadoresFetched.filter(av => av.projetosAtribuidos && av.projetosAtribuidos.some(pa => String(pa) === String(projeto._id))).length;

                let criteriosAvaliadosSet = new Set();
                if (avaliacoesDoProjeto && Array.isArray(avaliacoesDoProjeto)) {
                    avaliacoesDoProjeto.forEach(avaliacao => {
                        const notasArray = avaliacao.notas || avaliacao.itens;
                        if (notasArray && Array.isArray(notasArray)) {
                            notasArray.forEach(item => {
                                if (item.criterio && item.nota !== undefined && item.nota !== null) {
                                    criteriosAvaliadosSet.add(String(item.criterio));
                                    totalNotasGerais += parseFloat(item.nota);
                                    countNotasGerais++;
                                }
                            });
                        }
                    });
                }
                const criteriosDoProjeto = projeto.criterios ? projeto.criterios.length : 0;

                projeto.avaliacoesFeitas = avaliacoesDoProjeto.length;
                projeto.totalAvaliadores = numAvaliadoresAtribuidos;
                projeto.criteriosAvaliadosCount = criteriosAvaliadosSet.size;
                projeto.totalCriterios = criteriosDoProjeto;

                if (projeto.avaliacoesFeitas === 0) {
                    projeto.statusAvaliacao = 'Não Avaliado';
                    statusProjetosCount['Não Avaliado']++;
                } else if (projeto.avaliacoesFeitas < numAvaliadoresAtribuidos || criteriosAvaliadosSet.size < criteriosDoProjeto) {
                    projeto.statusAvaliacao = 'Em avaliação';
                    statusProjetosCount['Em avaliação']++;
                    projetosPendentesAvaliacaoCount++;
                } else {
                    projeto.statusAvaliacao = 'Avaliado';
                    statusProjetosCount['Avaliado']++;
                    projetosAvaliadosCompletosCount++;
                }

                let totalNotaPonderada = 0;
                let totalPeso = 0;

                if (projeto.criterios && Array.isArray(projeto.criterios)) {
                    for (const criterioProjeto of projeto.criterios) {
                        const avaliacoesDoCriterio = avaliacoesDoProjeto.flatMap(avaliacao => {
                            const notasArray = avaliacao.notas || avaliacao.itens;
                            return (notasArray && Array.isArray(notasArray)) ? notasArray.filter(item => String(item.criterio) === String(criterioProjeto._id) && item.nota !== undefined && item.nota !== null) : [];
                        });

                        if (avaliacoesDoCriterio.length > 0) {
                            const sumNotasCriterio = avaliacoesDoCriterio.reduce((acc, curr) => acc + parseFloat(curr.nota), 0);
                            const mediaCriterio = sumNotasCriterio / avaliacoesDoCriterio.length;
                            totalPontuacao += mediaCriterio * criterioProjeto.peso;
                            totalPeso += criterioProjeto.peso;
                        }
                    }
                }
                projeto.notaFinal = totalPeso > 0 ? parseFloat(totalNotaPonderada / totalPeso).toFixed(2) : '0';
            }

            if (countNotasGerais > 0) {
                mediaGeralAvaliacoes = parseFloat(totalNotasGerais / countNotasGerais).toFixed(2);
            }
        }

        // Preparar relatorioFinalPorProjeto para o novo Dashboard Geral
        const relatorioFinalPorProjeto = {};
        for (const projeto of projetosFetched) {
            const categoriaNome = projeto.categoria ? projeto.categoria.nome : 'Sem Categoria';
            if (!relatorioFinalPorProjeto[categoriaNome]) {
                relatorioFinalPorProjeto[categoriaNome] = [];
            }
            // Preencher mediasCriterios para cada projeto para a tabela
            const mediasCriteriosProjeto = {};
            const avaliacoesDoProjetoParaCriterios = avaliacoesFetched.filter(a => a.projeto && String(a.projeto) === String(projeto._id));
            
            for (const criterioOficial of criteriosOficiais) {
                const notasDoCriterioParaEsteProjeto = avaliacoesDoProjetoParaCriterios.flatMap(avaliacao => {
                    const notasArray = avaliacao.notas || avaliacao.itens;
                    return (notasArray && Array.isArray(notasArray)) ? notasArray.filter(item =>
                        String(item.criterio) === String(criterioOficial._id) &&
                        item.nota !== undefined && item.nota !== null
                    ) : [];
                });
                if (notasDoCriterioParaEsteProjeto.length > 0) {
                    const sumNotas = notasDoCriterioParaEsteProjeto.reduce((acc, curr) => acc + parseFloat(curr.nota), 0);
                    mediasCriteriosProjeto[String(criterioOficial._id)] = parseFloat(sumNotas / notasDoCriterioParaCriterio.length).toFixed(2);
                } else {
                    mediasCriteriosProjeto[String(criterioOficial._id)] = 'N/A';
                }
            }


            relatorioFinalPorProjeto[categoriaNome].push({
                titulo: projeto.titulo,
                numAvaliacoes: projeto.avaliacoesFeitas,
                mediasCriterios: mediasCriteriosProjeto, // Agora preenchido
                mediaGeral: projeto.notaFinal
            });
        }

        // Ordenar projetos dentro de cada categoria por média geral (notaFinal)
        for (const categoria in relatorioFinalPorProjeto) {
            relatorioFinalPorProjeto[categoria].sort((a, b) => {
                const notaA = parseFloat(a.mediaGeral);
                const notaB = parseFloat(b.mediaGeral);
                if (isNaN(notaA) && isNaN(notaB)) return 0;
                if (isNaN(notaA)) return 1;
                if (isNaN(notaB)) return -1;
                return notaB - notaA; // Ordem decrescente
            });
        }
        // --- FIM: PREPARAÇÃO DE DADOS PARA O DASHBOARD GERAL ---


        const activeTab = req.query.tab || 'dashboard-geral';

        // Renderiza o dashboard principal e passa TODOS os dados necessários para as abas
        res.render('admin/dashboard', { // Corrigido: especifica 'admin/dashboard'
            layout: 'layouts/main', // Caminho correto para o layout principal do admin
            titulo: 'Dashboard Admin',
            activeTab: activeTab,
            feiras,
            escolas: escolas,
            feiraAtual: feiraAtual,
            // Dados para a aba de Projetos, Categorias, Critérios, Avaliadores, Feiras
            projetos: projetosFetched,
            categorias: categoriasFetched,
            criterios: criteriosOficiais,
            avaliadores: avaliadoresFetched,
            avaliacoes: avaliacoesFetched,
            // Dados específicos para a aba Dashboard Geral (Visão Geral)
            projetosPorCategoria: projetosPorCategoria,
            avaliacoesPorAvaliadorCount: avaliacoesPorAvaliadorCount,
            mediaAvaliacaoPorCriterio: mediaAvaliacaoPorCriterio,
            statusProjetosCount: statusProjetosCount,
            escola: escola,
            totalProjetos: totalProjetos,
            totalAvaliadores: totalAvaliadores,
            projetosAvaliadosCompletosCount: projetosAvaliadosCompletosCount,
            projetosPendentesAvaliacaoCount: projetosPendentesAvaliacaoCount,
            mediaGeralAvaliacoes: mediaGeralAvaliacoes,
            relatorioFinalPorProjeto: relatorioFinalPorProjeto,
            error_msg: req.flash('error_msg'), // Garante que as mensagens flash são passadas
            success_msg: req.flash('success_msg')
        });

    } catch (error) {
        console.error('Erro ao carregar dashboard do admin:', error);
        // Verifica se os headers já foram enviados antes de tentar renderizar uma página de erro
        if (!res.headersSent) {
            req.flash('error_msg', 'Erro ao carregar o dashboard. Detalhes: ' + error.message); // Melhorar mensagem de erro
            res.redirect('/admin/login');
        }
    }
});

// ===========================================
// ROTAS CRUD - PROJETOS
// ===========================================

// Criar Projeto (POST)
router.post('/projetos', verificarAdminEscola, async (req, res) => {
    const { titulo, descricao, turma, alunos, categoria, criterios } = req.body;
    const escolaId = req.session.adminEscola.escolaId; // Obtém o ID da escola da sessão

    try {
        const feira = await Feira.findOne({ status: 'ativa', escolaId: escolaId });

        if (!feira) {
            req.flash('error_msg', 'Nenhuma feira ativa encontrada para esta escola. Não é possível criar um projeto.');
            return res.redirect('/admin/dashboard?tab=projetos');
        }
        
        let errors = [];
        if (!titulo || titulo.trim() === '') errors.push({ text: 'O título do projeto é obrigatório.' });
        if (!categoria || !mongoose.Types.ObjectId.isValid(categoria)) errors.push({ text: 'Selecione uma categoria válida.' });
        if (!turma || turma.trim() === '') errors.push({ text: 'A turma do projeto é obrigatória.' });

        if (errors.length > 0) {
            req.flash('error_msg', errors.map(e => e.text).join(', '));
            return res.redirect('/admin/dashboard?tab=projetos');
        }


        const novoProjeto = new Projeto({
            titulo: titulo.trim(),
            descricao: descricao || '',
            turma: turma.trim(),
            alunos: alunos ? (Array.isArray(alunos) ? alunos.map(a => a.trim()).filter(a => a) : alunos.split(',').map(a => a.trim()).filter(a => a)) : [],
            criterios: criterios ? (Array.isArray(criterios) ? criterios.map(id => new mongoose.Types.ObjectId(id)) : [new mongoose.Types.ObjectId(criterios)]) : [],
            categoria: new mongoose.Types.ObjectId(categoria),
            escolaId: escolaId,
            feira: feira._id
        });

        await novoProjeto.save();
        req.flash('success_msg', 'Projeto criado com sucesso!');
    } catch (err) {
        console.error('Erro ao criar projeto:', err);
        req.flash('error_msg', 'Erro ao criar projeto. Detalhes: ' + err.message);
    }

    res.redirect('/admin/dashboard?tab=projetos');
});


// Editar Projeto (PUT)
router.put('/projetos/:id', verificarAdminEscola, async (req, res) => {
    const { id } = req.params;
    const { titulo, descricao, categoria, turma, alunos, criterios } = req.body;
    const escolaId = req.session.adminEscola.escolaId;

    // Validação de ID antes de tentar a operação no banco
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        req.flash('error_msg', 'ID do projeto inválido para edição.');
        return res.redirect('/admin/dashboard?tab=projetos');
    }

    let errors = [];
    if (!titulo || titulo.trim() === '') errors.push({ text: 'O título do projeto é obrigatório.' });
    if (!categoria || !mongoose.Types.ObjectId.isValid(categoria)) errors.push({ text: 'Selecione uma categoria válida.' });
    if (!turma || turma.trim() === '') errors.push({ text: 'A turma do projeto é obrigatória.' });

    if (errors.length > 0) {
        req.flash('error_msg', errors.map(e => e.text).join(', '));
        return res.redirect('/admin/dashboard?tab=projetos');
    }

    try {
        const updatedProjeto = await Projeto.findOneAndUpdate(
            { _id: id, escolaId: escolaId },
            {
                titulo: titulo.trim(),
                descricao: descricao || '',
                categoria: new mongoose.Types.ObjectId(categoria),
                turma: turma.trim(),
                alunos: alunos ? (Array.isArray(alunos) ? alunos.map(a => a.trim()).filter(a => a) : alunos.split(',').map(a => a.trim()).filter(a => a)) : [],
                criterios: criterios ? (Array.isArray(criterios) ? criterios.map(id => new mongoose.Types.ObjectId(id)) : [new mongoose.Types.ObjectId(criterios)]) : []
            },
            { new: true, runValidators: true }
        );

        if (!updatedProjeto) {
            req.flash('error_msg', 'Projeto não encontrado ou você não tem permissão para editá-lo.');
            return res.redirect('/admin/dashboard?tab=projetos');
        }

        req.flash('success_msg', 'Projeto atualizado com sucesso!');
    } catch (err) {
        console.error('Erro ao atualizar projeto:', err);
        req.flash('error_msg', 'Erro ao atualizar projeto. Detalhes: ' + err.message);
    }

    res.redirect('/admin/dashboard?tab=projetos');
});


// Excluir Projeto (DELETE)
router.delete('/projetos/:id', verificarAdminEscola, async (req, res) => {
    const { id } = req.params;
    const escolaId = req.session.adminEscola.escolaId;

    // Validação de ID antes de tentar a operação no banco
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        req.flash('error_msg', 'ID do projeto inválido para exclusão.');
        return res.redirect('/admin/dashboard?tab=projetos');
    }

    try {
        // Encontra o projeto e garante que pertence à escola do admin
        const projetoParaExcluir = await Projeto.findOne({ _id: id, escolaId: escolaId });
        if (!projetoParaExcluir) {
            req.flash('error_msg', 'Projeto não encontrado ou você não tem permissão para excluí-lo.');
            return res.redirect('/admin/dashboard?tab=projetos');
        }

        await Avaliacao.deleteMany({ projeto: id, escola: escolaId }); // Exclui avaliações do projeto nesta escola
        await Projeto.deleteOne({ _id: id, escolaId: escolaId }); // Exclui o projeto da escola

        req.flash('success_msg', 'Projeto e suas avaliações excluídos com sucesso!');
    } catch (err) {
        console.error('Erro ao excluir projeto:', err);
        req.flash('error_msg', 'Erro ao excluir projeto. Detalhes: ' + err.message);
    }

    res.redirect('/admin/dashboard?tab=projetos');
});

// ===========================================
// ROTAS CRUD - AVALIADORES
// ===========================================

// Adicionar Avaliador (POST)
router.post('/avaliadores', verificarAdminEscola, async (req, res) => {
    const { nome, email, pin, ativo, projetosAtribuidos, feira } = req.body;
    const adminEscolaId = req.session.adminEscola.escolaId;

    try {
        // Verifica se já existe um avaliador com este e-mail para ESTA ESCOLA
        const existingAvaliador = await Avaliador.findOne({ email, escolaId: adminEscolaId }); // USANDO escolaId AQUI
        if (existingAvaliador) {
            req.flash('error_msg', 'Já existe um avaliador com este e-mail nesta escola.');
            return res.redirect('/admin/dashboard?tab=avaliadores');
        }

        const generatedPin = pin || generateUniquePin();
        const newAvaliador = new Avaliador({
            nome,
            email,
            pin: generatedPin,
            ativo: !!ativo,
            // Garante que projetosAtribuidos é um array válido
            projetosAtribuidos: Array.isArray(projetosAtribuidos) ? projetosAtribuidos : (projetosAtribuidos ? [projetosAtribuidos].filter(Boolean) : []),
            escolaId: adminEscolaId, // Vincula SEMPRE à escola do admin logado (USANDO escolaId AQUI)
            feira: feira // A feira deve ser passada pelo formulário (via modal)
        });

        await newAvaliador.save();

        const emailSent = await sendResetPinEmail(newAvaliador);
        if (emailSent) {
            req.flash('success_msg', `Avaliador ${newAvaliador.nome} adicionado e PIN enviado por e-mail.`);
        } else {
            req.flash('success_msg', `Avaliador ${newAvaliador.nome} adicionado, mas falha ao enviar PIN por e-mail. Verifique as configurações.`);
        }

        res.redirect('/admin/dashboard?tab=avaliadores');
    } catch (err) {
        console.error('Erro ao adicionar avaliador:', err);
        req.flash('error_msg', 'Erro ao adicionar avaliador. Detalhes: ' + err.message);
        res.redirect('/admin/dashboard?tab=avaliadores');
    }
});

// Editar Avaliador (PUT)
router.put('/avaliadores/:id', verificarAdminEscola, async (req, res) => {
    const { id } = req.params;
    const { nome, email, pin, ativo, projetosAtribuidos, feira } = req.body;
    const adminEscolaId = req.session.adminEscola.escolaId;

    // Validação de ID antes de tentar a operação no banco
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        req.flash('error_msg', 'ID do avaliador inválido para edição.');
        return res.redirect('/admin/dashboard?tab=avaliadores');
    }

    try {
        // Encontra o avaliador e garante que ele pertence à escola do admin
        const avaliador = await Avaliador.findOne({ _id: id, escolaId: adminEscolaId }); // USANDO escolaId AQUI
        if (!avaliador) {
            req.flash('error_msg', 'Avaliador não encontrado ou você não tem permissão para editá-lo.');
            return res.redirect('/admin/dashboard?tab=avaliadores');
        }

        // Se o e-mail for alterado, verifica se já existe outro avaliador com ele nesta escola
        if (email !== avaliador.email) {
            const existingAvaliador = await Avaliador.findOne({ email, _id: { $ne: id }, escolaId: adminEscolaId }); // USANDO escolaId AQUI
            if (existingAvaliador) {
                req.flash('error_msg', 'Este e-mail já está em uso por outro avaliador nesta escola.');
                return res.redirect('/admin/dashboard?tab=avaliadores');
            }
        }

        avaliador.nome = nome;
        avaliador.email = email;
        avaliador.pin = pin || avaliador.pin; // Mantém o PIN se não for alterado
        avaliador.ativo = !!ativo;
        avaliador.projetosAtribuidos = Array.isArray(projetosAtribuidos) ? projetosAtribuidos : (projetosAtribuidos ? [projetosAtribuidos].filter(Boolean) : []);
        avaliador.feira = feira; // NOTE: Se `feira` no Avaliador for `feiraId`, isso deve ser ajustado aqui também.

        await avaliador.save();

        req.flash('success_msg', 'Avaliador atualizado com sucesso!');
        res.redirect('/admin/dashboard?tab=avaliadores');
    } catch (err) {
        console.error('Erro ao atualizar avaliador:', err);
        req.flash('error_msg', 'Erro ao atualizar avaliador. Detalhes: ' + err.message);
        res.redirect('/admin/dashboard?tab=avaliadores');
    }
});

// Redefinir PIN do Avaliador (POST)
router.post('/avaliadores/reset-pin/:id', verificarAdminEscola, async (req, res) => {
    const { id } = req.params;
    const adminEscolaId = req.session.adminEscola.escolaId;

    // Validação de ID antes de tentar a operação no banco
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        req.flash('error_msg', 'ID do avaliador inválido para redefinição de PIN.');
        return res.redirect('/admin/dashboard?tab=avaliadores');
    }

    try {
        // Encontra o avaliador e garante que ele pertence à escola do admin
        const avaliador = await Avaliador.findOne({ _id: id, escolaId: adminEscolaId }); // USANDO escolaId AQUI
        if (!avaliador) {
            req.flash('error_msg', 'Avaliador não encontrado ou não pertence a esta escola.');
            return res.redirect('/admin/dashboard?tab=avaliadores');
        }

        const newPin = generateUniquePin();
        avaliador.pin = newPin;
        await avaliador.save();

        const emailSent = await sendResetPinEmail(avaliador);

        if (emailSent) {
            req.flash('success_msg', `PIN do avaliador ${avaliador.nome} redefinido e enviado por e-mail com sucesso.`);
        } else {
            req.flash('error_msg', `PIN do avaliador ${avaliador.nome} redefinido, mas falha ao enviar e-mail.`);
        }
        res.redirect('/admin/dashboard?tab=avaliadores');
    } catch (err) {
        console.error('Erro ao redefinir PIN do avaliador:', err);
        req.flash('error_msg', 'Erro ao redefinir PIN do avaliador. Detalhes: ' + err.message);
        res.redirect('/admin/dashboard?tab=avaliadores');
    }
});


// Excluir Avaliador (DELETE)
router.delete('/avaliadores/:id', verificarAdminEscola, async (req, res) => {
    const { id } = req.params;
    const adminEscolaId = req.session.adminEscola.escolaId;

    // Validação de ID antes de tentar a operação no banco
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        req.flash('error_msg', 'ID do avaliador inválido para exclusão.');
        return res.redirect('/admin/dashboard?tab=avaliadores');
    }

    try {
        // Encontra o avaliador e garante que ele pertence à escola do admin antes de excluir
        const avaliadorParaExcluir = await Avaliador.findOne({ _id: id, escolaId: adminEscolaId }); // USANDO escolaId AQUI
        if (!avaliadorParaExcluir) {
            req.flash('error_msg', 'Avaliador não encontrado ou você não tem permissão para excluí-lo.');
            return res.redirect('/admin/dashboard?tab=avaliadores');
        }
        
        // Exclui avaliações e depois o avaliador, filtrando por escola
        await Avaliacao.deleteMany({ avaliador: id, escolaId: adminEscolaId }); // USANDO escolaId AQUI
        await Avaliador.deleteOne({ _id: id, escolaId: adminEscolaId }); // USANDO escolaId AQUI

        req.flash('success_msg', 'Avaliador e suas avaliações excluídos com sucesso!');
        res.redirect('/admin/dashboard?tab=avaliadores');
    } catch (err) {
        console.error('Erro ao excluir avaliador:', err);
        req.flash('error_msg', 'Erro ao excluir avaliador. Detalhes: ' + err.message);
        res.redirect('/admin/dashboard?tab=avaliadores');
    }
});

// ===========================================
// ROTAS CRUD - FEIRAS
// ===========================================

// Adicionar Feira (POST)
router.post('/feiras', verificarAdminEscola, async (req, res) => {
    const { nome, inicioFeira, fimFeira, status } = req.body;
    const escolaId = req.session.adminEscola.escolaId;

    let errors = [];

    if (!nome || nome.trim() === '') {
        errors.push({ text: 'Por favor, insira um nome para a feira.' });
    }
    if (!status || (status !== 'ativa' && status !== 'arquivada')) {
        errors.push({ text: 'Status da feira inválido.' });
    }

    if (status === 'ativa') {
        const existingActiveFeira = await Feira.findOne({ status: 'ativa', escolaId: escolaId });
        if (existingActiveFeira) {
            errors.push({ text: `Já existe uma feira ativa para esta escola (${existingActiveFeira.nome}). Desative-a antes de ativar uma nova.` });
        }
    }

    if (errors.length > 0) {
        req.flash('error_msg', errors.map(e => e.text).join(', '));
        return res.redirect('/admin/dashboard?tab=feiras');
    }

    try {
        const newFeira = new Feira({
            nome: nome.trim(),
            inicioFeira: inicioFeira || null,
            fimFeira: fimFeira || null,
            status: status,
            escolaId: escolaId
        });

        await newFeira.save();
        req.flash('success_msg', 'Feira adicionada com sucesso!');
    } catch (err) {
        console.error('Erro ao adicionar feira:', err);
        req.flash('error_msg', 'Erro ao adicionar feira. Detalhes: ' + err.message);
    }

    res.redirect('/admin/dashboard?tab=feiras');
});

// Editar Feira (PUT)
router.put('/feiras/:id', verificarAdminEscola, async (req, res) => {
    const { id } = req.params;
    const { nome, inicioFeira, fimFeira, status } = req.body;
    const escolaId = req.session.adminEscola.escolaId;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        req.flash('error_msg', 'ID da feira inválido para edição.');
        return res.redirect('/admin/dashboard?tab=feiras');
    }

    let errors = [];
    if (!nome || nome.trim() === '') errors.push({ text: 'O nome da feira é obrigatório.' });
    if (!status || (status !== 'ativa' && status !== 'arquivada')) errors.push({ text: 'Status da feira inválido.' });

    if (status === 'ativa') {
        const existingActiveFeira = await Feira.findOne({ status: 'ativa', escolaId: escolaId, _id: { $ne: id } });
        if (existingActiveFeira) {
            errors.push({ text: `Já existe outra feira ativa para esta escola (${existingActiveFeira.nome}). Desative-a antes de ativar esta.` });
        }
    }

    if (errors.length > 0) {
        req.flash('error_msg', errors.map(e => e.text).join(', '));
        return res.redirect('/admin/dashboard?tab=feiras');
    }

    try {
        if (status === 'ativa') {
            await Feira.updateMany(
                { _id: { $ne: new mongoose.Types.ObjectId(id) }, status: 'ativa', escolaId: escolaId },
                { status: 'arquivada' }
            );
        }

        const updatedFeira = await Feira.findOneAndUpdate(
            { _id: id, escolaId: escolaId },
            { nome: nome.trim(), inicioFeira: inicioFeira || null, fimFeira: fimFeira || null, status: status },
            { new: true, runValidators: true }
        );

        if (!updatedFeira) {
            req.flash('error_msg', 'Feira não encontrada ou você não tem permissão para editá-la.');
            return res.redirect('/admin/dashboard?tab=feiras');
        }

        req.flash('success_msg', 'Feira atualizada com sucesso!');
    } catch (err) {
        console.error('Erro ao atualizar feira:', err);
        req.flash('error_msg', 'Erro ao atualizar feira. Detalhes: ' + err.message);
    }

    res.redirect('/admin/dashboard?tab=feiras');
});

// Excluir Feira (DELETE)
router.delete('/feiras/:id', verificarAdminEscola, async (req, res) => {
    const { id } = req.params;
    const escolaId = req.session.adminEscola.escolaId;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        req.flash('error_msg', 'ID da feira inválido para exclusão.');
        return res.redirect('/admin/dashboard?tab=feiras');
    }

    try {
        const feiraParaExcluir = await Feira.findOne({ _id: id, escolaId: escolaId });
        if (!feiraParaExcluir) {
            req.flash('error_msg', 'Feira não encontrada ou você não tem permissão para excluí-la.');
            return res.redirect('/admin/dashboard?tab=feiras');
        }

        // Antes de deletar a feira, verificar se ela é a feira ATIVA.
        // Se for a feira ativa, não permitimos a exclusão direta para evitar um estado inconsistente.
        // O usuário deve arquivá-la e/ou iniciar uma nova feira antes de tentar excluir.
        const activeFeiraCheck = await Feira.findOne({ _id: id, escolaId: escolaId, status: 'ativa' });
        if (activeFeiraCheck) {
            req.flash('error_msg', `Não é possível deletar a feira "${feiraParaExcluir.nome}" porque ela está ATIVA. Por favor, arquive-a ou inicie uma nova feira antes de tentar excluí-la.`);
            return res.redirect('/admin/dashboard?tab=feiras');
        }

        // Contar projetos e avaliações associados para avisar o usuário se houver dados
        const numProjetos = await Projeto.countDocuments({ feira: id, escolaId: escolaId });
        const numAvaliacoes = await Avaliacao.countDocuments({ feira: id, escola: escolaId });
        const numAvaliadores = await Avaliador.countDocuments({ feira: id, escolaId: escolaId });
        const numCategorias = await Categoria.countDocuments({ feira: id, escolaId: escolaId });
        const numCriterios = await Criterio.countDocuments({ feira: id, escolaId: escolaId });

        if (numProjetos > 0 || numAvaliacoes > 0 || numAvaliadores > 0 || numCategorias > 0 || numCriterios > 0) {
            // Se houver dados associados, apenas avisa e não exclui
            let message = `Não é possível deletar a feira "${feiraParaExcluir.nome}" porque ela ainda possui dados associados: `;
            if (numProjetos > 0) message += `${numProjetos} projeto(s), `;
            if (numAvaliacoes > 0) message += `${numAvaliacoes} avaliação(ões), `;
            if (numAvaliadores > 0) message += `${numAvaliadores} avaliador(es), `;
            if (numCategorias > 0) message += `${numCategorias} categoria(s), `;
            if (numCriterios > 0) message += `${numCriterios} critério(s).`;
            message += ' Por favor, remova estes dados ou arquive a feira antes de tentar excluí-la.';
            req.flash('error_msg', message);
            return res.redirect('/admin/dashboard?tab=feiras');
        }

        // Se não houver dados associados e não for a feira ativa, procede com a exclusão
        await Feira.deleteOne({ _id: id, escolaId: escolaId });

        req.flash('success_msg', `Feira "${feiraParaExcluir.nome}" excluída com sucesso!`);
    } catch (err) {
        console.error('Erro ao excluir feira:', err);
        req.flash('error_msg', 'Erro ao excluir feira. Detalhes: ' + err.message);
    }

    res.redirect('/admin/dashboard?tab=feiras');
});


// ===========================================
// ROTAS CRUD - CATEGORIAS
// ===========================================

// Adicionar Categoria (POST)
router.post('/categorias', verificarAdminEscola, async (req, res) => {
    const { nome } = req.body;
    const escolaId = req.session.adminEscola.escolaId;

    try {
        const feira = await Feira.findOne({ status: 'ativa', escolaId: escolaId });

        if (!feira) {
            req.flash('error_msg', 'Nenhuma feira ativa encontrada para esta escola. Não é possível criar uma categoria.');
            return res.redirect('/admin/dashboard?tab=categorias');
        }

        if (!nome || nome.trim() === '') {
            req.flash('error_msg', 'Por favor, insira um nome para a categoria.');
            return res.redirect('/admin/dashboard?tab=categorias');
        }

        const novaCategoria = new Categoria({
            nome: nome.trim(),
            escolaId: escolaId,
            feira: feira._id
        });

        await novaCategoria.save();
        req.flash('success_msg', 'Categoria criada com sucesso!');
    } catch (err) {
        console.error('Erro ao criar categoria:', err);
        req.flash('error_msg', 'Erro ao criar categoria. Detalhes: ' + err.message);
    }

    res.redirect('/admin/dashboard?tab=categorias');
});


// Editar Categoria (PUT)
router.put('/categorias/:id', verificarAdminEscola, async (req, res) => {
    const { id } = req.params;
    const { nome } = req.body;
    const escolaId = req.session.adminEscola.escolaId;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        req.flash('error_msg', 'ID da categoria inválido para edição.');
        return res.redirect('/admin/dashboard?tab=categorias');
    }
    if (!nome || nome.trim() === '') {
        req.flash('error_msg', 'Por favor, insira um nome para a categoria.');
        return res.redirect('/admin/dashboard?tab=categorias');
    }

    try {
        const updatedCategoria = await Categoria.findOneAndUpdate(
            { _id: id, escolaId: escolaId },
            { nome: nome.trim() }, 
            { new: true, runValidators: true }
        );

        if (!updatedCategoria) {
            req.flash('error_msg', 'Categoria não encontrada ou você não tem permissão para editá-la.');
            return res.redirect('/admin/dashboard?tab=categorias');
        }

        req.flash('success_msg', 'Categoria atualizada com sucesso!');
    }
    catch (err) {
        console.error('Erro ao atualizar categoria:', err);
        req.flash('error_msg', 'Erro ao atualizar categoria. Detalhes: ' + err.message);
    }

    res.redirect('/admin/dashboard?tab=categorias');
});

// Excluir Categoria (DELETE)
router.delete('/categorias/:id', verificarAdminEscola, async (req, res) => {
    const { id } = req.params;
    const escolaId = req.session.adminEscola.escolaId;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        req.flash('error_msg', 'ID da categoria inválido para exclusão.');
        return res.redirect('/admin/dashboard?tab=categorias');
    }

    try {
        const categoriaParaExcluir = await Categoria.findOne({ _id: id, escolaId: escolaId });
        if (!categoriaParaExcluir) {
            req.flash('error_msg', 'Categoria não encontrada ou você não tem permissão para excluí-la.');
            return res.redirect('/admin/dashboard?tab=categorias');
        }

        // Verifica se há projetos associados a esta categoria para esta escola
        const projetosAssociados = await Projeto.countDocuments({ categoria: id, escolaId: escolaId });
        if (projetosAssociados > 0) {
            req.flash('error_msg', `Não é possível deletar a categoria "${categoriaParaExcluir.nome}" porque ela possui ${projetosAssociados} projeto(s) associado(s).`);
            return res.redirect('/admin/dashboard?tab=categorias');
        }

        await Categoria.deleteOne({ _id: id, escolaId: escolaId });
        req.flash('success_msg', 'Categoria excluída com sucesso!');
    } catch (err) {
        console.error('Erro ao excluir categoria:', err);
        req.flash('error_msg', 'Erro ao excluir categoria. Detalhes: ' + err.message);
    }

    res.redirect('/admin/dashboard?tab=categorias');
});


// ===========================================
// ROTAS CRUD - CRITÉRIOS
// ===========================================

// Adicionar Critério (POST)
router.post('/criterios', verificarAdminEscola, async (req, res) => {
    const { nome, peso, observacao } = req.body;
    const escolaId = req.session.adminEscola.escolaId;

    try {
        const feira = await Feira.findOne({ status: 'ativa', escolaId: escolaId });

        if (!feira) {
            req.flash('error_msg', 'Nenhuma feira ativa encontrada para esta escola. Não é possível criar um critério.');
            return res.redirect('/admin/dashboard?tab=criterios');
        }

        let errors = [];
        if (!nome || nome.trim() === '') errors.push({ text: 'O nome do critério é obrigatório.' });
        if (peso === undefined || peso === null || peso < 1 || peso > 10) errors.push({ text: 'O peso do critério deve ser um número entre 1 e 10.' });

        if (errors.length > 0) {
            req.flash('error_msg', errors.map(e => e.text).join(', '));
            return res.redirect('/admin/dashboard?tab=criterios');
        }

        const novo = new Criterio({
            nome: nome.trim(),
            peso: parseInt(peso, 10),
            observacao: observacao || '',
            escolaId: escolaId,
            feira: feira._id // Associa o critério à feira ativa
        });

        await novo.save();
        req.flash('success_msg', 'Critério adicionado com sucesso!');
    } catch (err) {
        console.error('Erro ao criar critério:', err);
        req.flash('error_msg', 'Erro ao criar critério. Detalhes: ' + err.message);
    }

    res.redirect('/admin/dashboard?tab=criterios');
});


// Editar Critério (PUT)
router.put('/criterios/:id', verificarAdminEscola, async (req, res) => {
    const { id } = req.params;
    const { nome, peso, observacao } = req.body;
    const escolaId = req.session.adminEscola.escolaId;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        req.flash('error_msg', 'ID do critério inválido para edição.');
        return res.redirect('/admin/dashboard?tab=criterios');
    }

    let errors = [];
    if (!nome || nome.trim() === '') errors.push({ text: 'O nome do critério é obrigatório.' });
    if (peso === undefined || peso === null || peso < 1 || peso > 10) errors.push({ text: 'O peso do critério deve ser um número entre 1 e 10.' });

    if (errors.length > 0) {
        req.flash('error_msg', errors.map(e => e.text).join(', '));
        return res.redirect('/admin/dashboard?tab=criterios');
    }

    try {
        const updatedCriterio = await Criterio.findOneAndUpdate(
            { _id: id, escolaId: escolaId },
            { nome: nome.trim(), peso: parseInt(peso, 10), observacao: observacao || '' },
            { new: true, runValidators: true }
        );

        if (!updatedCriterio) {
            req.flash('error_msg', 'Critério não encontrado ou você não tem permissão para editá-lo.');
            return res.redirect('/admin/dashboard?tab=criterios');
        }

        req.flash('success_msg', 'Critério atualizado com sucesso!');
    } catch (err) {
        console.error('Erro ao editar critério:', err);
        req.flash('error_msg', 'Erro ao editar critério. Detalhes: ' + err.message);
    }

    res.redirect('/admin/dashboard?tab=criterios');
});


// Excluir Critério (DELETE)
router.delete('/criterios/:id', verificarAdminEscola, async (req, res) => {
    const { id } = req.params;
    const escolaId = req.session.adminEscola.escolaId;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        req.flash('error_msg', 'ID do critério inválido para exclusão.');
        return res.redirect('/admin/dashboard?tab=criterios');
    }

    try {
        const criterioParaExcluir = await Criterio.findOne({ _id: id, escolaId: escolaId });
        if (!criterioParaExcluir) {
            req.flash('error_msg', 'Critério não encontrado ou você não tem permissão para excluí-lo.');
            return res.redirect('/admin/dashboard?tab=criterios');
        }

        // Verifica se há projetos associados a este critério para esta escola
        const projetosAssociados = await Projeto.countDocuments({ criterios: id, escolaId: escolaId });
        if (projetosAssociados > 0) {
            req.flash('error_msg', `Não é possível deletar o critério "${criterioParaExcluir.nome}" porque ele está associado a ${projetosAssociados} projeto(s).`);
            return res.redirect('/admin/dashboard?tab=criterios');
        }

        await Criterio.deleteOne({ _id: id, escolaId: escolaId });
        req.flash('success_msg', 'Critério excluído com sucesso!');
    } catch (err) {
        console.error('Erro ao excluir critério:', err);
        req.flash('error_msg', 'Erro ao excluir critério. Detalhes: ' + err.message);
    }

    res.redirect('/admin/dashboard?tab=criterios');
});


// ===========================================
// ROTAS DE CONFIGURAÇÃO DA FEIRA ATUAL
// ===========================================

// Rota para arquivar a feira atual
router.post('/configuracoes/arquivar', verificarAdminEscola, async (req, res) => {
    try {
        const escolaId = req.session.adminEscola.escolaId;
        const feiraAtual = await Feira.findOne({ escolaId: escolaId, status: 'ativa' });

        if (!feiraAtual) {
            req.flash('error_msg', 'Nenhuma feira ativa encontrada para arquivar.');
            return res.redirect('/admin/dashboard?tab=tab-configuracoes');
        }

        feiraAtual.status = 'arquivada';
        feiraAtual.arquivadaEm = Date.now();
        await feiraAtual.save();

        req.flash('success_msg', `Feira "${feiraAtual.nome}" arquivada com sucesso!`);
        res.redirect('/admin/dashboard?tab=tab-configuracoes');
    } catch (err) {
        console.error('Erro ao arquivar feira:', err);
        req.flash('error_msg', 'Erro ao arquivar feira. Detalhes: ' + err.message);
        res.redirect('/admin/dashboard?tab=tab-configuracoes');
    }
});

// Rota para iniciar uma nova feira (arquiva a antiga e limpa projetos/avaliadores da feira antiga)
router.post('/configuracoes/nova', verificarAdminEscola, async (req, res) => {
    try {
        const escolaId = req.session.adminEscola.escolaId;
        const feiraAntiga = await Feira.findOne({ escolaId: escolaId, status: 'ativa' });

        // Arquiva a feira antiga, se existir
        if (feiraAntiga) {
            feiraAntiga.status = 'arquivada';
            feiraAntiga.arquivadaEm = Date.now();
            await feiraAntiga.save();

            // Opcional: Limpar projetos e avaliações da feira antiga (cuidado com dados históricos)
            // Esta lógica já foi incluída na rota DELETE da feira, e geralmente não se apaga em 'nova feira',
            // apenas associa-os à feira arquivada. Mantendo comentado por segurança.
            // await Projeto.deleteMany({ feira: feiraAntiga._id, escolaId: escolaId });
            // await Avaliador.deleteMany({ feira: feiraAntiga._id, escolaId: escolaId });
            // await Avaliacao.deleteMany({ feira: feiraAntiga._id, escola: escolaId });
            // await Categoria.deleteMany({ feira: feiraAntiga._id, escolaId: escolaId });
            // await Criterio.deleteMany({ feira: feiraAntiga._id, escolaId: escolaId });
            req.flash('info_msg', `Feira anterior ("${feiraAntiga.nome}") foi arquivada.`);
        }

        // Cria uma nova feira
        const novaFeira = new Feira({
            nome: `Feira ${new Date().getFullYear() + 1}`, // Nome padrão para a próxima feira
            escolaId: escolaId,
            status: 'ativa',
            inicioFeira: new Date(),
            fimFeira: new Date(new Date().setFullYear(new Date().getFullYear() + 1))
        });
        await novaFeira.save();

        req.flash('success_msg', `Nova feira ("${novaFeira.nome}") iniciada com sucesso!`);
        res.redirect('/admin/dashboard?tab=tab-configuracoes');
    } catch (err) {
        console.error('Erro ao iniciar nova feira:', err);
        req.flash('error_msg', 'Erro ao iniciar nova feira. Detalhes: ' + err.message);
        res.redirect('/admin/dashboard?tab=tab-configuracoes');
    }
});

// Rota para atualizar datas da feira atual (POST, mas pode receber _method=PUT)
router.post('/configuracoes/feiradata', verificarAdminEscola, async (req, res) => {
    const { feiraId, inicioFeira, fimFeira } = req.body;
    const escolaId = req.session.adminEscola.escolaId;

    if (!feiraId || !mongoose.Types.ObjectId.isValid(feiraId)) {
        req.flash('error_msg', 'ID da feira inválido para atualização de datas.');
        return res.redirect('/admin/dashboard?tab=tab-configuracoes');
    }

    try {
        const updatedFeira = await Feira.findOneAndUpdate(
            { _id: feiraId, escolaId: escolaId },
            { inicioFeira: inicioFeira || null, fimFeira: fimFeira || null },
            { new: true }
        );

        if (!updatedFeira) {
            req.flash('error_msg', 'Feira não encontrada ou você não tem permissão para atualizar suas datas.');
            return res.redirect('/admin/dashboard?tab=tab-configuracoes');
        }

        req.flash('success_msg', 'Datas da feira atualizadas com sucesso!');
        res.redirect('/admin/dashboard?tab=tab-configuracoes');
    } catch (err) {
        console.error('Erro ao atualizar datas da feira:', err);
        req.flash('error_msg', 'Erro ao atualizar datas da feira. Detalhes: ' + err.message);
        res.redirect('/admin/dashboard?tab=tab-configuracoes');
    }
});


module.exports = router;
