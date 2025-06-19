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
const generatePIN = () => Math.floor(1000 + Math.random() * 9000).toString();

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
    cport({
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

// ===========================================
// ROTAS DE AUTENTICAÇÃO (ADMIN)
// ===========================================

// Rota de Login (GET) - Renderiza o formulário de login
router.get('/login', (req, res) => {
    res.render('admin/login', {
        layout: 'layouts/public',
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
        return res.render('admin/login', {
            layout: 'layouts/public',
            titulo: 'Login Admin',
            error_msg: req.flash('error_msg'),
            usuario
        });
    }

    try {
        // Popula o campo 'escolaId' para garantir que o objeto escola esteja disponível
        const admin = await Admin.findOne({ email: usuario }).populate('escolaId'); // USANDO escolaId AQUI

        if (!admin) {
            req.flash('error_msg', 'Credenciais inválidas.');
            return res.render('admin/login', {
                layout: 'layouts/public',
                titulo: 'Login Admin',
                error_msg: req.flash('error_msg'),
                usuario
            });
        }

        const isMatch = await bcrypt.compare(senha, admin.senha);

        if (!isMatch) {
            req.flash('error_msg', 'Credenciais inválidas.');
            return res.render('admin/login', {
                layout: 'layouts/public',
                titulo: 'Login Admin',
                error_msg: req.flash('error_msg'),
                usuario
            });
        }

        let escolaIdParaSessao = null;
        // Verifica se 'admin.escolaId' e 'admin.escolaId._id' são válidos
        if (admin.escolaId && admin.escolaId._id) { // USANDO escolaId AQUI
            escolaIdParaSessao = admin.escolaId._id.toString(); // Converte para string
        } else {
            // Se o admin não tem uma escola associada válida (ou a referência está quebrada)
            console.error(`Admin ${admin.email} logado mas não possui uma escola associada válida.`);
            const errorMessage = 'Seu perfil de administrador não está vinculado a uma escola válida. Por favor, entre em contato com o suporte.';
            
            // Destrói a sessão primeiro e, no callback, renderiza a página de login
            req.session.destroy(err => {
                if (err) console.error('Erro ao destruir sessão durante login por falta de escolaId:', err);
                
                // Limpa o cookie da sessão após a destruição da sessão.
                // Verifica se os headers já foram enviados antes de tentar limpar cookies/renderizar.
                if (!res.headersSent) {
                    res.clearCookie('connect.sid'); 
                    // Passa a mensagem de erro diretamente, já que req.flash pode não funcionar após session.destroy
                    res.render('admin/login', {
                        layout: 'layouts/public',
                        titulo: 'Login Admin',
                        error_msg: errorMessage,
                        usuario
                    });
                }
            });
            return; // Sai da função para evitar que o código continue e tente enviar outra resposta
        }

        req.session.adminEscola = {
            id: admin._id,
            nome: admin.nome,
            email: admin.email,
            role: admin.role || 'admin',
            escolaId: escolaIdParaSessao // Usa o ID da escola validado
        };

        req.flash('success_msg', 'Login de administrador realizado com sucesso!');
        res.redirect('/admin/dashboard');

    } catch (err) {
        console.error('Erro no login do admin:', err);
        // Verifica se os headers já foram enviados antes de tentar renderizar uma página de erro
        if (!res.headersSent) {
            req.flash('error_msg', 'Erro no servidor. Tente novamente mais tarde. Detalhes: ' + err.message);
            res.render('admin/login', {
                layout: 'layouts/public',
                titulo: 'Login Admin',
                error_msg: req.flash('error_msg'),
                usuario
            });
        }
    }
});

// Rota de Logout (POST)
router.post('/logout', verificarAdminEscola, (req, res, next) => {
    req.flash('success_msg', 'Você saiu da sua conta de administrador.'); 
    req.session.destroy(err => {
        if (err) {
            console.error('Erro ao destruir sessão:', err);
            return next(err);
        }
        res.clearCookie('connect.sid');
        res.redirect('/admin/login');
    });
});

// ===================================
// ROTAS DE RECUPERAÇÃO DE SENHA
// ===================================

// Rota GET para exibir o formulário de solicitação de recuperação de senha
router.get('/recuperar-senha', (req, res) => {
    res.render('admin/recuperar-senha', {
        titulo: 'Recuperar Senha',
        layout: 'layouts/public',
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
        // Encontra o admin, mas não precisamos popular a escola aqui para a recuperação de senha
        const admin = await Admin.findOne({ email: email });

        if (!admin) {
            // Mensagem genérica para segurança: não revela se o e-mail existe
            req.flash('success_msg', 'Se o e-mail informado estiver cadastrado, um link de redefinição será enviado.');
            return res.redirect('/admin/recuperar-senha');
        }

        const token = crypto.randomBytes(20).toString('hex');

        admin.resetPasswordToken = token;
        admin.resetPasswordExpires = Date.now() + 3600000; // 1 hora
        await admin.save();

        const resetURL = `${process.env.APP_URL || 'http://localhost:3000'}/admin/resetar-senha/${token}`;

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

        res.render('admin/resetar-senha', {
            titulo: 'Redefinir Senha',
            token: req.params.token,
            layout: 'layouts/public',
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
        return res.render('admin/resetar-senha', {
            titulo: 'Redefinir Senha',
            token: token,
            layout: 'layouts/public',
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
        res.render('admin/resetar-senha', {
            titulo: 'Redefinir Senha',
            token: token,
            layout: 'layouts/public',
            error_msg: req.flash('error_msg')
        });
    }
});


// ===========================================
// ROTAS DE RELATÓRIOS (PDF) - COM PUPPETEER
// ==========================================
async function generatePdfReport(req, res, templateName, data, filename) {
    let browser;
    try {
        const escolaId = req.session.adminEscola.escolaId;
        const escola = await Escola.findById(escolaId).lean();
        const feiraAtual = await Feira.findOne({ escolaId: escolaId, status: 'ativa' }).lean();

        const html = await ejs.renderFile(path.join(__dirname, `../views/admin/${templateName}.ejs`), {
            layout: false,
            escola,
            feiraAtual,
            ...data,
            formatarData: (dateString) => {
                if (!dateString) return 'N/A';
                const date = new Date(dateString);
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0'); // padStart(2, '0') para garantir 2 dígitos
                return `${day}/${month}/${year}`;
            }
        });

        // Configuração Puppeteer para Render com @sparticuz/chromium
        browser = await puppeteer.launch({
            args: [...chromium.args, '--hide-scrollbars', '--disable-web-security'],
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(), // Corrigido: `executablePath` é uma propriedade, não uma função
            headless: chromium.headless,
            ignoreHTTPSErrors: true,
        });

        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });

        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            displayHeaderFooter: true,
            headerTemplate: `<div style="font-size: 8px; margin-left: 1cm; margin-right: 1cm; color: #777; text-align: right;">${filename.replace(/_/g, ' ').toUpperCase()}</div>`,
            footerTemplate: `<div style="font-size: 8px; margin-left: 1cm; margin-right: 1cm; color: #777; text-align: center;">Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>`,
            margin: {
                top: '2cm',
                right: '1cm',
                bottom: '2cm',
                left: '1cm'
            }
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
        res.send(pdf);

    } catch (err) {
        console.error(`Erro ao gerar PDF de ${filename}:`, err);
        if (!res.headersSent) {
            req.flash('error_msg', `Erro ao gerar PDF de ${filename}. Detalhes: ` + err.message);
            res.redirect('/admin/dashboard?tab=relatorios');
        }
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}


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
        const feiraAtual = await Feira.findOne({ status: 'ativa', escolaId: escolaId }); // USANDO escolaId AQUI
        const feiras = await Feira.find({ escolaId: escolaId }).sort({ inicioFeira: -1 }); // USANDO escolaId AQUI

        const escolaDoAdmin = await Escola.findById(escolaId); // Pega a escola do admin logado
        const escolas = await Escola.find({}); // Todas as escolas para o dropdown de avaliadores (se necessário para algum modal)

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

        if (feiraAtual) {
            feiraAtual.inicioFeiraFormatted = formatarDataParaInput(feiraAtual.inicioFeira);
            feiraAtual.fimFeiraFormatted = formatarDataParaInput(feiraAtual.fimFeira);
        }

        // --- INÍCIO: PREPARAÇÃO DE DADOS PARA O DASHBOARD GERAL (TODAS AS ABAS) ---
        // Todas as buscas agora incluem o filtro 'escolaId: escolaId'
        const projetosFetched = feiraAtual ? await Projeto.find({ feira: feiraAtual._id, escolaId: escolaId }).populate('categoria').populate('criterios').lean() : []; // USANDO escolaId AQUI
        const categoriasFetched = feiraAtual ? await Categoria.find({ feira: feiraAtual._id, escolaId: escolaId }).lean() : []; // USANDO escolaId AQUI
        const criteriosOficiais = feiraAtual ? await Criterio.find({ feira: feiraAtual._id, escolaId: escolaId }).lean() : []; // USANDO escolaId AQUI
        const avaliadoresFetched = feiraAtual ? await Avaliador.find({ feira: feiraAtual._id, escolaId: escolaId }).populate('projetosAtribuidos').lean() : []; // USANDO escolaId AQUI
        const avaliacoesFetched = feiraAtual ? await Avaliacao.find({ feira: feiraAtual._id, escolaId: escolaId }).lean() : []; // USANDO escolaId AQUI

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
                            totalNotaPonderada += mediaCriterio * criterioProjeto.peso;
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
                    mediasCriteriosProjeto[String(criterioOficial._id)] = parseFloat(sumNotas / notasDoCriterioParaEsteProjeto.length).toFixed(2);
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
        res.render('admin/dashboard', {
    titulo: 'Dashboard Admin',
    layout: false,
    usuarioLogado: req.session.adminEscola,
    activeTab: activeTab,
    feiras,
    escolas,
    feiraAtual: feiraAtual ? feiraAtual.toObject() : null,
    projetos: projetosFetched,
    categorias: categoriasFetched,
    criterios: criteriosOficiais,
    avaliadores: avaliadoresFetched,
    avaliacoes: avaliacoesFetched,
    projetosPorCategoria,
    avaliacoesPorAvaliadorCount,
    mediaAvaliacaoPorCriterio,
    statusProjetosCount,
    escola,
    totalProjetos,
    totalAvaliadores,
    projetosAvaliadosCompletosCount,
    projetosPendentesAvaliacaoCount,
    mediaGeralAvaliacoes,
    relatorioFinalPorProjeto,
    formatarDatasParaInput: formatarDataParaInput // ✅ ESSA LINHA corrige o erro
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
    const adminEscolaId = req.session.adminEscola.escolaId; // Obtém o ID da escola da sessão

    try {
        const feira = await Feira.findOne({ status: 'ativa', escolaId: adminEscolaId }); // USANDO escolaId AQUI

        if (!feira) {
            req.flash('error_msg', 'Nenhuma feira ativa encontrada para esta escola. Não é possível criar um projeto.');
            return res.redirect('/admin/dashboard?tab=projetos');
        }

        const novoProjeto = new Projeto({
            titulo,
            descricao,
            turma,
            alunos: typeof alunos === 'string'
            ? alunos.split('\n').map(a => a.trim()).filter(Boolean)
            : Array.isArray(alunos) ? alunos : [],
            criterios: Array.isArray(criterios) ? criterios : (criterios ? [criterios] : []),
            categoria,
            escolaId: adminEscolaId, // Vincula à escola do admin logado (USANDO escolaId AQUI)
            feira: feira._id // Vincula à feira ativa
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
router.post('/projetos/:id/editar', verificarAdminEscola, async (req, res) => {
    const { id } = req.params;
    const { titulo, descricao, categoria, turma, alunos, criterios } = req.body;
    const adminEscolaId = req.session.adminEscola.escolaId;

    // Validação de ID antes de tentar a operação no banco
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        req.flash('error_msg', 'ID do projeto inválido para edição.');
        return res.redirect('/admin/dashboard?tab=projetos');
    }

    try {
        // Garante que o projeto a ser atualizado pertence à escola do admin
        const updatedProjeto = await Projeto.findOneAndUpdate(
            { _id: id, escolaId: adminEscolaId }, // USANDO escolaId AQUI
            {
                titulo,
                descricao,
                categoria,
                turma,
                alunos: typeof alunos === 'string'
                ? alunos.split('\n').map(a => a.trim()).filter(Boolean)
                : Array.isArray(alunos) ? alunos : [],
                criterios: Array.isArray(criterios) ? criterios.filter(Boolean) : (criterios ? [criterios].filter(Boolean) : [])
            },
            { new: true }
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
    const adminEscolaId = req.session.adminEscola.escolaId;

    // Validação de ID antes de tentar a operação no banco
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        req.flash('error_msg', 'ID do projeto inválido para exclusão.');
        return res.redirect('/admin/dashboard?tab=projetos');
    }

    try {
        // Encontra o projeto e garante que pertence à escola do admin
        const projetoParaExcluir = await Projeto.findOne({ _id: id, escolaId: adminEscolaId }); // USANDO escolaId AQUI
        if (!projetoParaExcluir) {
            req.flash('error_msg', 'Projeto não encontrado ou você não tem permissão para excluí-lo.');
            return res.redirect('/admin/dashboard?tab=projetos');
        }

        await Avaliacao.deleteMany({ projeto: id, escolaId: adminEscolaId }); // Exclui avaliações do projeto nesta escola (USANDO escolaId AQUI)
        await Projeto.deleteOne({ _id: id, escolaId: adminEscolaId }); // Exclui o projeto da escola (USANDO escolaId AQUI)

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
  const { nome, email, projetosAtribuidos } = req.body;
  const escolaId = req.session.adminEscola.escolaId;

  try {
    const feira = await Feira.findOne({ status: 'ativa', escolaId });
    if (!feira) {
      req.flash('error_msg', 'Nenhuma feira ativa encontrada para a escola.');
      return res.redirect('/admin/dashboard?tab=avaliadores');
    }

    const emailExistente = await Avaliador.findOne({ email, escolaId });
    if (emailExistente) {
      req.flash('error_msg', 'Já existe um avaliador com este e-mail cadastrado para sua escola.');
      return res.redirect('/admin/dashboard?tab=avaliadores');
    }

    const pin = generatePIN();

    const novoAvaliador = new Avaliador({
      nome,
      email,
      pin,
      escolaId,
      feira: feira._id,
      projetosAtribuidos: Array.isArray(projetosAtribuidos) ? projetosAtribuidos : [projetosAtribuidos]
    });

    await novoAvaliador.save();

    // Envio de e-mail usando remetente validado (SendGrid via Nodemailer)
    const transporter = nodemailer.createTransport({
      service: 'SendGrid',
      auth: {
        user: 'apikey',
        pass: process.env.SENDGRID_API_KEY
      }
    });

    await transporter.sendMail({
      from: 'AvaliaFeiras <docsrosas@gmail.com>', 
      to: email,
      subject: 'Bem-vindo ao AvaliaFeiras',
      html: `<p>Olá ${nome},</p>
             <p>Você foi cadastrado como avaliador no sistema AvaliaFeiras.</p>
             <p><strong>PIN de acesso:</strong> ${pin}</p>
             <p>Acesse o sistema e utilize seu PIN para avaliar os projetos atribuídos.</p>`
    });

    req.flash('success_msg', 'Avaliador cadastrado e e-mail enviado com sucesso.');
  } catch (err) {
    console.error('Erro ao cadastrar avaliador:', err);
    req.flash('error_msg', 'Erro ao cadastrar avaliador. Detalhes: ' + err.message);
  }

  res.redirect('/admin/dashboard?tab=avaliadores');
});

router.put('/avaliadores/:id', verificarAdminEscola, async (req, res) => {
  const { id } = req.params;
  const { nome, email, projetosAtribuidos } = req.body;
  const escolaId = req.session.adminEscola.escolaId;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    req.flash('error_msg', 'ID do avaliador inválido para edição.');
    return res.redirect('/admin/dashboard?tab=avaliadores');
  }

  try {
    const avaliadorAtualizado = await Avaliador.findOneAndUpdate(
      { _id: id, escolaId },
      {
        nome,
        email,
        projetosAtribuidos: Array.isArray(projetosAtribuidos) ? projetosAtribuidos : [projetosAtribuidos]
      },
      { new: true }
    );

    if (!avaliadorAtualizado) {
      req.flash('error_msg', 'Avaliador não encontrado ou não pertence à sua escola.');
    } else {
      req.flash('success_msg', 'Avaliador atualizado com sucesso.');
    }
  } catch (err) {
    console.error('Erro ao atualizar avaliador:', err);
    req.flash('error_msg', 'Erro ao atualizar avaliador. Detalhes: ' + err.message);
  }

  res.redirect('/admin/dashboard?tab=avaliadores');
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
router.post('/avaliadores/:id/excluir', verificarAdminEscola, async (req, res) => {
  const { id } = req.params;
  const escolaId = req.session.adminEscola.escolaId;

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    req.flash('error_msg', 'ID do avaliador inválido para exclusão.');
    return res.redirect('/admin/dashboard?tab=avaliadores');
  }

  try {
    const resultado = await Avaliador.deleteOne({ _id: id, escolaId });
    if (resultado.deletedCount === 0) {
      req.flash('error_msg', 'Avaliador não encontrado ou não pertence à sua escola.');
    } else {
      req.flash('success_msg', 'Avaliador excluído com sucesso.');
    }
  } catch (err) {
    console.error('Erro ao excluir avaliador:', err);
    req.flash('error_msg', 'Erro ao excluir avaliador. Detalhes: ' + err.message);
  }

  res.redirect('/admin/dashboard?tab=avaliadores');
});


// ===========================================
// ROTAS CRUD - FEIRAS
// ===========================================

// Criar nova feira sem excluir dados antigos
router.post('/feiras', verificarAdminEscola, async (req, res) => {
    const { nome, inicioFeira, fimFeira } = req.body;
    const escolaId = req.session.adminEscola.escolaId;

    try {
        // Arquiva outras feiras da mesma escola
        await Feira.updateMany({ escolaId, status: 'ativa' }, { $set: { status: 'arquivada' } });

        const novaFeira = new Feira({
            nome,
            inicioFeira: new Date(inicioFeira.split('-').reverse().join('-')), // DD-MM-YYYY → Date
            fimFeira: new Date(fimFeira.split('-').reverse().join('-')),
            status: 'ativa',
            escolaId
        });

        await novaFeira.save();
        req.flash('success_msg', 'Nova feira criada com sucesso!');
        res.redirect('/admin/dashboard?tab=feiras');
    } catch (err) {
        console.error('Erro ao criar feira:', err);
        req.flash('error_msg', 'Erro ao criar nova feira. Tente novamente.');
        res.redirect('/admin/dashboard?tab=feiras');
    }
});


// Editar Feira (PUT)
router.post('/feiras/editar', verificarAdminEscola, async (req, res) => {
  const { feiraId, nome, inicioFeira, fimFeira, status } = req.body;
  const escolaId = req.session.adminEscola.escolaId;

  try {
    await Feira.updateOne(
      { _id: feiraId, escolaId },
      {
        nome,
        inicioFeira: new Date(inicioFeira),
        fimFeira: new Date(fimFeira),
        status
      }
    );
    req.flash('success_msg', 'Feira atualizada com sucesso!');
    res.redirect('/admin/dashboard?tab=feiras');
  } catch (err) {
    console.error('Erro ao editar feira:', err);
    req.flash('error_msg', 'Erro ao editar feira. Tente novamente.');
    res.redirect('/admin/dashboard?tab=feiras');
  }
});

// Excluir Feira (POST)
router.post('/feiras/excluir', verificarAdminEscola, async (req, res) => {
  const { feiraId } = req.body;
  const escolaId = req.session.adminEscola.escolaId;
  try {
    await Feira.deleteOne({ _id: feiraId, escolaId });
    req.flash('success_msg', 'Feira excluída com sucesso.');
    res.redirect('/admin/dashboard?tab=feiras');
  } catch (err) {
    console.error('Erro ao excluir feira:', err);
    req.flash('error_msg', 'Erro ao excluir feira.');
    res.redirect('/admin/dashboard?tab=feiras');
  }
});

// Mudar Status da Feira (POST - usando POST para simplicidade, idealmente PUT)
router.post('/feiras/status/:id', verificarAdminEscola, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // Assume que o status (ativa/arquivada) vem do formulário
    const adminEscolaId = req.session.adminEscola.escolaId;

    // Validação de ID antes de tentar a operação no banco
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        req.flash('error_msg', 'ID da feira inválido para mudança de status.');
        return res.redirect('/admin/dashboard?tab=feiras');
    }

    try {
        // Encontra a feira e garante que ela pertence à escola do admin
        const feira = await Feira.findOne({ _id: id, escolaId: adminEscolaId }); // USANDO escolaId AQUI
        if (!feira) {
            req.flash('error_msg', 'Feira não encontrada ou não pertence a esta escola.');
            return res.redirect('/admin/dashboard?tab=feiras');
        }

        // Se o status for 'ativa', desativa outras feiras ativas da mesma escola
        if (status === 'ativa') {
            // Garante que o ID usado no $ne é um ObjectId válido
            await Feira.updateMany(
                { _id: { $ne: new mongoose.Types.ObjectId(id) }, status: 'ativa', escolaId: adminEscolaId }, // USANDO escolaId AQUI
                { status: 'arquivada' }
            );
        } else if (status === 'arquivada') {
            // Se estiver arquivando, garante que não há mais nenhuma feira ativa automaticamente
            // (Embora o updateMany acima já cuide de "outras ativas")
        }


        feira.status = status;
        // Se a feira está sendo arquivada, registra a data de arquivamento
        if (status === 'arquivada' && !feira.arquivadaEm) {
            feira.arquivadaEm = Date.now();
        } else if (status === 'ativa' && feira.arquivadaEm) {
            // Se está sendo reativada, remove a data de arquivamento
            feira.arquivadaEm = undefined;
        }

        await feira.save();

        req.flash('success_msg', `Status da feira "${feira.nome}" alterado para "${status}" com sucesso!`);
        res.redirect('/admin/dashboard?tab=feiras');
    } catch (err) {
        console.error('Erro ao mudar status da feira:', err);
        req.flash('error_msg', 'Erro ao mudar status da feira. Detalhes: ' + err.message);
        res.redirect('/admin/dashboard?tab=feiras');
    }
});


// Rota para Iniciar Nova Feira (POST) - Arquiva a atual e limpa dados
router.post('/configuracoes/nova', verificarAdminEscola, async (req, res) => {
    const adminEscolaId = req.session.adminEscola.escolaId;

    try {
        const feiraAtual = await Feira.findOne({ status: 'ativa', escolaId: adminEscolaId }); // USANDO escolaId AQUI

        if (feiraAtual) {
            // 1. Arquiva a feira atual
            feiraAtual.status = 'arquivada';
            feiraAtual.arquivadaEm = Date.now();
            await feiraAtual.save();

            // 2. Apaga projetos, avaliadores, categorias, critérios e avaliações associados à feira arquivada
            // Filtrando por feira E escola para garantir isolamento
            await Projeto.deleteMany({ feira: feiraAtual._id, escolaId: adminEscolaId }); // USANDO escolaId AQUI
            await Avaliador.deleteMany({ feira: feiraAtual._id, escolaId: adminEscolaId }); // USANDO escolaId AQUI
            await Avaliacao.deleteMany({ feira: feiraAtual._id, escolaId: adminEscolaId }); // USANDO escolaId AQUI
            await Categoria.deleteMany({ feira: feiraAtual._id, escolaId: adminEscolaId }); // USANDO escolaId AQUI
            await Criterio.deleteMany({ feira: feiraAtual._id, escolaId: adminEscolaId }); // USANDO escolaId AQUI
        }
        
        // 3. Cria uma nova feira (com nome padrão e status 'ativa')
        const novaFeira = new Feira({
            nome: `Feira de Ciências ${new Date().getFullYear()}`, // Nome padrão
            status: 'ativa',
            escolaId: adminEscolaId // Vincula à escola do admin logado (USANDO escolaId AQUI)
        });
        await novaFeira.save();

        req.flash('success_msg', 'Nova feira iniciada com sucesso! A feira anterior foi arquivada.');
        res.redirect('/admin/dashboard?tab=feiras'); // Redireciona para a aba de feiras
    } catch (err) {
        console.error('Erro ao iniciar nova feira:', err);
        req.flash('error_msg', 'Erro ao iniciar nova feira. Detalhes: ' + err.message);
        res.redirect('/admin/dashboard?tab=configuracoes');
    }
});


// Excluir Feira (DELETE)
router.delete('/feiras/:id', verificarAdminEscola, async (req, res) => {
    const { id } = req.params;
    const adminEscolaId = req.session.adminEscola.escolaId;

    // Validação de ID antes de tentar a operação no banco
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        req.flash('error_msg', 'ID da feira inválido para exclusão.');
        return res.redirect('/admin/dashboard?tab=feiras');
    }

    try {
        // Encontra a feira e garante que ela pertence à escola do admin antes de excluir
        const feiraParaExcluir = await Feira.findOne({ _id: id, escolaId: adminEscolaId }); // USANDO escolaId AQUI
        if (!feiraParaExcluir) {
            req.flash('error_msg', 'Feira não encontrada ou você não tem permissão para excluí-la.');
            return res.redirect('/admin/dashboard?tab=feiras');
        }

        // Exclui todos os dados associados àquela feira E escola
        await Projeto.deleteMany({ feira: id, escolaId: adminEscolaId }); // USANDO escolaId AQUI
        await Avaliador.deleteMany({ feira: id, escolaId: adminEscolaId }); // USANDO escolaId AQUI
        await Avaliacao.deleteMany({ feira: id, escolaId: adminEscolaId }); // USANDO escolaId AQUI
        await Categoria.deleteMany({ feira: id, escolaId: adminEscolaId }); // USANDO escolaId AQUI
        await Criterio.deleteMany({ feira: id, escolaId: adminEscolaId }); // USANDO escolaId AQUI
        
        await Feira.deleteOne({ _id: id, escolaId: adminEscolaId }); // Finalmente, exclui a feira (USANDO escolaId AQUI)

        req.flash('success_msg', 'Feira e todos os dados associados excluídos com sucesso!');
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
    const adminEscolaId = req.session.adminEscola.escolaId;

    try {
        const feira = await Feira.findOne({ status: 'ativa', escolaId: adminEscolaId }); // USANDO escolaId AQUI

        if (!feira) {
            req.flash('error_msg', 'Nenhuma feira ativa encontrada para esta escola. Não é possível criar uma categoria.');
            return res.redirect('/admin/dashboard?tab=categorias');
        }

        const novaCategoria = new Categoria({
            nome,
            escolaId: adminEscolaId, // USANDO escolaId AQUI
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
    const adminEscolaId = req.session.adminEscola.escolaId;

    // Validação de ID antes de tentar a operação no banco
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        req.flash('error_msg', 'ID da categoria inválido para edição.');
        return res.redirect('/admin/dashboard?tab=categorias');
    }

    try {
        // Garante que a categoria a ser atualizada pertence à escola do admin
        const updatedCategoria = await Categoria.findOneAndUpdate(
            { _id: id, escolaId: adminEscolaId }, // USANDO escolaId AQUI
            { nome }, 
            { new: true }
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
router.delete('/categorias/:id/excluir', verificarAdminEscola, async (req, res) => {
    const adminEscolaId = req.session.adminEscola.escolaId;

    // Validação de ID antes de tentar a operação no banco
    if (!req.params.id || !mongoose.Types.ObjectId.isValid(req.params.id)) {
        req.flash('error_msg', 'ID da categoria inválido para exclusão.');
        return res.redirect('/admin/dashboard?tab=categorias');
    }

    try {
        // Encontra a categoria e garante que pertence à escola do admin antes de excluir
        const categoriaParaExcluir = await Categoria.findOne({ _id: req.params.id, escolaId: adminEscolaId }); // USANDO escolaId AQUI
        if (!categoriaParaExcluir) {
            req.flash('error_msg', 'Categoria não encontrada ou você não tem permissão para excluí-la.');
            return res.redirect('/admin/dashboard?tab=categorias');
        }

        await Categoria.deleteOne({ _id: req.params.id, escolaId: adminEscolaId }); // USANDO escolaId AQUI
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
    const adminEscolaId = req.session.adminEscola.escolaId;

    try {
        const feira = await Feira.findOne({ status: 'ativa', escolaId: adminEscolaId }); // USANDO escolaId AQUI

        if (!feira) {
            req.flash('error_msg', 'Nenhuma feira ativa encontrada para esta escola. Não é possível criar um critério.');
            return res.redirect('/admin/dashboard?tab=criterios');
        }

        const novo = new Criterio({
            nome,
            peso,
            observacao,
            escolaId: adminEscolaId, // USANDO escolaId AQUI
            feira: feira._id
        });

        await novo.save();
        req.flash('success_msg', 'Critério criado com sucesso!');
    } catch (err) {
        console.error('Erro ao criar critério:', err);
        req.flash('error_msg', 'Erro ao criar critério. Detalhes: ' + err.message);
    }

    res.redirect('/admin/dashboard?tab=criterios');
});


// Editar Critério (PUT)
router.put('/criterios/:id', verificarAdminEscola, async (req, res) => {
    const { nome, peso, observacao } = req.body;
    const adminEscolaId = req.session.adminEscola.escolaId;

    // Validação de ID antes de tentar a operação no banco
    if (!req.params.id || !mongoose.Types.ObjectId.isValid(req.params.id)) {
        req.flash('error_msg', 'ID do critério inválido para edição.');
        return res.redirect('/admin/dashboard?tab=criterios');
    }

    try {
        // Garante que o critério a ser atualizado pertence à escola do admin
        const updatedCriterio = await Criterio.findOneAndUpdate(
            { _id: req.params.id, escolaId: adminEscolaId }, // USANDO escolaId AQUI
            { nome, peso, observacao }
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
router.delete('/criterios/:id/excluir', verificarAdminEscola, async (req, res) => {
    const adminEscolaId = req.session.adminEscola.escolaId;

    // Validação de ID antes de tentar a operação no banco
    if (!req.params.id || !mongoose.Types.ObjectId.isValid(req.params.id)) {
        req.flash('error_msg', 'ID do critério inválido para exclusão.');
        return res.redirect('/admin/dashboard?tab=criterios');
    }

    try {
        // Encontra o critério e garante que pertence à escola do admin antes de excluir
        const criterioParaExcluir = await Criterio.findOne({ _id: req.params.id, escolaId: adminEscolaId }); // USANDO escolaId AQUI
        if (!criterioParaExcluir) {
            req.flash('error_msg', 'Critério não encontrado ou você não tem permissão para excluí-lo.');
            return res.redirect('/admin/dashboard?tab=criterios');
        }

        await Criterio.deleteOne({ _id: req.params.id, escolaId: adminEscolaId }); // USANDO escolaId AQUI
        req.flash('success_msg', 'Critério excluído com sucesso!');
    } catch (err) {
        console.error('Erro ao excluir critério:', err);
        req.flash('error_msg', 'Erro ao excluir critério. Detalhes: ' + err.message);
    }

    res.redirect('/admin/dashboard?tab=criterios');
});


// ===========================================
// ROTAS DE RELATÓRIOS (PDF)
// ===========================================

// Rota para Resultados Finais
router.get('/resultados-finais/pdf', verificarAdminEscola, async (req, res) => {
    try {
        const escolaId = req.session.adminEscola.escolaId;
        const feiraAtual = await Feira.findOne({ status: 'ativa', escolaId: escolaId });
        if (!feiraAtual) {
            req.flash('error_msg', 'Nenhuma feira ativa para esta escola para gerar o relatório de resultados finais.');
            if (!res.headersSent) { return res.redirect('/admin/dashboard?tab=relatorios'); }
        }

        const projetos = await Projeto.find({ feira: feiraAtual._id, escolaId: escolaId })
            .populate('categoria')
            .populate('criterios')
            .lean();
        const avaliacoes = await Avaliacao.find({ feira: feiraAtual._id, escolaId: escolaId }).lean();

        for (const projeto of projetos) {
            let totalNotaPonderada = 0;
            let totalPeso = 0;
            let criteriosAvaliadosCount = new Set();
            if (projeto.criterios && Array.isArray(projeto.criterios)) {
                for (const criterioProjeto of projeto.criterios) {
                    const avaliacoesDoCriterio = avaliacoes.flatMap(avaliacao => {
                        const notasArray = avaliacao.notas || avaliacao.itens;
                        return (notasArray && Array.isArray(notasArray)) ? notasArray.filter(nota =>
                            String(nota.criterio) === String(criterioProjeto._id) &&
                            avaliacao.projeto && String(avaliacao.projeto) === String(projeto._id) &&
                            nota.nota !== undefined && nota.nota !== null
                        ) : [];
                    });

                    if (avaliacoesDoCriterio.length > 0) {
                        const sumNotasCriterio = avaliacoesDoCriterio.reduce((acc, curr) => acc + parseFloat(curr.nota), 0);
                        const mediaCriterio = sumNotasCriterio / avaliacoesDoCriterio.length;
                        totalNotaPonderada += mediaCriterio * criterioProjeto.peso;
                        totalPeso += criterioProjeto.peso;
                        criteriosAvaliadosCount.add(String(criterioProjeto._id));
                    }
                }
            }
            projeto.notaFinal = totalPeso > 0 ? parseFloat(totalNotaPonderada / totalPeso).toFixed(2) : 'N/A';
            projeto.criteriosAvaliadosCount = criteriosAvaliadosCount.size;
            projeto.totalCriterios = projeto.criterios ? projeto.criterios.length : 0;
        }

        const projetosOrdenados = projetos.sort((a, b) => {
            const notaA = parseFloat(a.notaFinal);
            const notaB = parseFloat(b.notaFinal);
            if (isNaN(notaA) && isNaN(notaB)) return 0;
            if (isNaN(notaA)) return 1;
            if (isNaN(notaB)) return -1;
            return notaB - notaA;
        });

        const escola = await Escola.findById(escolaId).lean() || { nome: "Nome da Escola", diretor: "Diretor da Escola" };

        await generatePdfReport(req, res, 'pdf-resultados', {
            titulo: 'Resultados Finais',
            nomeFeira: feiraAtual.nome,
            projetos: projetosOrdenados,
            escola: escola
        }, `resultados-finais_${feiraAtual.nome}`);

    } catch (error) {
        console.error('Erro ao gerar PDF de resultados finais:', error);
        if (!res.headersSent) {
            req.flash('error_msg', 'Erro ao gerar PDF de resultados finais. Detalhes: ' + error.message);
            res.redirect('/admin/dashboard?tab=relatorios');
        }
    }
});


// Rota para PDF de Avaliações Completas
router.get('/avaliacoes/pdf', verificarAdminEscola, async (req, res) => {
    try {
        const escolaId = req.session.adminEscola.escolaId;
        const feiraAtual = await Feira.findOne({ status: 'ativa', escolaId: escolaId });
        if (!feiraAtual) {
            req.flash('error_msg', 'Nenhuma feira ativa para esta escola para gerar o relatório de avaliações.');
            if (!res.headersSent) { return res.redirect('/admin/dashboard?tab=relatorios'); }
        }

        const avaliacoes = await Avaliacao.find({ feira: feiraAtual._id, escolaId: escolaId })
            .populate('avaliador')
            .populate({ path: 'projeto', populate: { path: 'categoria' } })
            .lean();

        const criteriosMap = {};
        const todosCriterios = await Criterio.find({ feira: feiraAtual._id, escolaId: escolaId }).lean();
        todosCriterios.forEach(c => { criteriosMap[c._id.toString()] = c.nome; });

        const avaliacoesParaRelatorio = avaliacoes.map(avaliacao => {
            const notasArray = avaliacao.notas || avaliacao.itens;
            const notasComNomesDeCriterio = (notasArray || []).map(item => ({
                criterioNome: criteriosMap[String(item.criterio)] || 'Critério Desconhecido',
                valor: parseFloat(item.nota),
                observacao: item.comentario || ''
            }));
            return { ...avaliacao, notasComNomesDeCriterio: notasComNomesDeCriterio };
        });

        const escola = await Escola.findById(escolaId).lean() || { nome: "Nome da Escola" };

        await generatePdfReport(req, res, 'pdf-avaliacoes', {
            titulo: 'Avaliações Completas',
            nomeFeira: feiraAtual.nome,
            avaliacoes: avaliacoesParaRelatorio,
            escola: escola
        }, `avaliacoes_${feiraAtual.nome}`);

    } catch (error) {
        console.error('Erro ao gerar PDF de avaliações:', error);
        if (!res.headersSent) {
            req.flash('error_msg', 'Erro ao gerar PDF de avaliações. Detalhes: ' + error.message);
            res.redirect('/admin/dashboard?tab=relatorios');
        }
    }
});

// Rota para PDF de Projetos Sem Avaliação
router.get('/projetos-sem-avaliacao/pdf', verificarAdminEscola, async (req, res) => {
    try {
        const escolaId = req.session.adminEscola.escolaId;
        const feiraAtual = await Feira.findOne({ status: 'ativa', escolaId: escolaId });
        if (!feiraAtual) {
            req.flash('error_msg', 'Nenhuma feira ativa para esta escola para gerar o relatório de projetos sem avaliação.');
            if (!res.headersSent) { return res.redirect('/admin/dashboard?tab=relatorios'); }
        }

        const projetos = await Projeto.find({ feira: feiraAtual._id, escolaId: escolaId }).lean();
        const avaliacoes = await Avaliacao.find({ feira: feiraAtual._id, escolaId: escolaId }).lean();
        const avaliadores = await Avaliador.find({ feira: feiraAtual._id, escolaId: escolaId }).lean();

        const projetosSemAvaliacao = [];
        for (const projeto of projetos) {
            const numAvaliadoresAtribuidos = avaliadores.filter(av => av.projetosAtribuidos && av.projetosAtribuidos.some(pa => String(pa) === String(projeto._id))).length;
            const avaliacoesDoProjeto = avaliacoes.filter(a => a.projeto && String(a.projeto) === String(projeto._id));
            if (avaliacoesDoProjeto.length === 0 || avaliacoesDoProjeto.length < numAvaliadoresAtribuidos) {
                const assignedEvaluators = avaliadores
                    .filter(av => av.projetosAtribuidos && av.projetosAtribuidos.some(pa => String(pa) === String(projeto._id)))
                    .map(av => av.nome)
                    .join(', ');
                projetosSemAvaliacao.push({
                    titulo: projeto.titulo,
                    turma: projeto.turma,
                    totalAvaliadores: numAvaliadoresAtribuidos,
                    avaliacoesRecebidas: avaliacoesDoProjeto.length,
                    avaliadoresDesignados: assignedEvaluators || 'Nenhum avaliador atribuído'
                });
            }
        }

        const escola = await Escola.findById(escolaId).lean() || { nome: "Nome da Escola" };

        await generatePdfReport(req, res, 'pdf-projetos-sem-avaliacao', {
            titulo: 'Projetos Sem Avaliação',
            nomeFeira: feiraAtual.nome,
            projetosNaoAvaliados: projetosSemAvaliacao,
            escola: escola
        }, `projetos-sem-avaliacao_${feiraAtual.nome}`);

    } catch (error) {
        console.error('Erro ao gerar PDF de projetos sem avaliação:', error);
        if (!res.headersSent) {
            req.flash('error_msg', 'Erro ao gerar PDF de projetos sem avaliação. Detalhes: ' + error.message);
            res.redirect('/admin/dashboard?tab=relatorios');
        }
    }
});

// Rota para PDF de Ranking por Categoria
router.get('/ranking-categorias/pdf', verificarAdminEscola, async (req, res) => {
    try {
        const escolaId = req.session.adminEscola.escolaId;
        const feiraAtual = await Feira.findOne({ status: 'ativa', escolaId: escolaId });
        if (!feiraAtual) {
            req.flash('error_msg', 'Nenhuma feira ativa para esta escola para gerar o ranking por categoria.');
            if (!res.headersSent) { return res.redirect('/admin/dashboard?tab=relatorios'); }
        }

        const projetos = await Projeto.find({ feira: feiraAtual._id, escolaId: escolaId })
            .populate('categoria')
            .populate('criterios')
            .lean();
        const avaliacoes = await Avaliacao.find({ feira: feiraAtual._id, escolaId: escolaId }).lean();
        const categorias = await Categoria.find({ feira: feiraAtual._id, escolaId: escolaId }).lean();

        const rankingPorCategoria = {};
        for (const projeto of projetos) {
            let totalNotaPonderada = 0;
            let totalPeso = 0;
            const avaliacoesDoProjeto = avaliacoes.filter(a => a.projeto && String(a.projeto) === String(projeto._id));
            const numAvaliacoes = avaliacoesDoProjeto.length;

            if (projeto.criterios && Array.isArray(projeto.criterios)) {
                for (const criterioProjeto of projeto.criterios) {
                    const avaliacoesDoCriterio = avaliacoesDoProjeto.flatMap(avaliacao => {
                        const notasArray = avaliacao.notas || avaliacao.itens;
                        return (notasArray && Array.isArray(notasArray)) ? notasArray.filter(item => String(item.criterio) === String(criterioProjeto._id) && item.nota !== undefined && item.nota !== null) : [];
                    });

                    if (avaliacoesDoCriterio.length > 0) {
                        const sumNotasCriterio = avaliacoesDoCriterio.reduce((acc, curr) => acc + parseFloat(curr.nota), 0);
                        const mediaCriterio = sumNotasCriterio / avaliacoesDoCriterio.length;
                        totalNotaPonderada += mediaCriterio * criterioProjeto.peso;
                        totalPeso += criterioProjeto.peso;
                    }
                }
            }
            projeto.notaFinal = totalPeso > 0 ? parseFloat(totalNotaPonderada / totalPeso).toFixed(2) : 'N/A';
            projeto.numAvaliacoes = numAvaliacoes;
        }

        categorias.forEach(cat => {
            rankingPorCategoria[cat.nome] = projetos
                .filter(p => p.categoria && String(p.categoria._id) === String(cat._id))
                .sort((a, b) => {
                    const notaA = parseFloat(a.notaFinal);
                    const notaB = parseFloat(b.notaFinal);
                    if (isNaN(notaA) && isNaN(notaB)) return 0;
                    if (isNaN(notaA)) return 1;
                    if (isNaN(notaB)) return -1;
                    return notaB - notaA;
                });
        });

        const escola = await Escola.findById(escolaId).lean() || { nome: "Nome da Escola" };

        await generatePdfReport(req, res, 'pdf-ranking-categorias', {
            titulo: 'Ranking por Categoria',
            nomeFeira: feiraAtual.nome,
            rankingPorCategoria: rankingPorCategoria,
            escola: escola
        }, `ranking-categorias_${feiraAtual.nome}`);

    } catch (error) {
        console.error('Erro ao gerar PDF de ranking por categoria:', error);
        if (!res.headersSent) {
            req.flash('error_msg', 'Erro ao gerar PDF de ranking por categoria. Detalhes: ' + error.message);
            res.redirect('/admin/dashboard?tab=relatorios');
        }
    }
});

// Rota para PDF de Resumo de Avaliadores
router.get('/resumo-avaliadores/pdf', verificarAdminEscola, async (req, res) => {
    try {
        const escolaId = req.session.adminEscola.escolaId;
        const feiraAtual = await Feira.findOne({ status: 'ativa', escolaId: escolaId });
        if (!feiraAtual) {
            req.flash('error_msg', 'Nenhuma feira ativa para esta escola para gerar o relatório de resumo de avaliadores.');
            if (!res.headersSent) { return res.redirect('/admin/dashboard?tab=relatorios'); }
        }

        const avaliadores = await Avaliador.find({ feira: feiraAtual._id, escolaId: escolaId }).populate('projetosAtribuidos').lean();
        const avaliacoes = await Avaliacao.find({ feira: feiraAtual._id, escolaId: escolaId }).lean();
        const criterios = await Criterio.find({ feira: feiraAtual._id, escolaId: escolaId }).lean();

        const resumoAvaliadores = await Promise.all(avaliadores.map(async av => {
            const avaliacoesDoAvaliador = avaliacoes.filter(a => String(a.avaliador) === String(av._id));
            
            let totalAtribuidos = av.projetosAtribuidos ? av.projetosAtribuidos.length : 0;
            let totalAvaliados = 0;
            let projetosAvaliadosDetalhes = [];

            if (av.projetosAtribuidos && Array.isArray(av.projetosAtribuidos)) {
                for (const projetoAtribuido of av.projetosAtribuidos) {
                    const avaliacaoDoProjeto = avaliacoesDoAvaliador.find(a => String(a.projeto) === String(projetoAtribuido._id));
                    let statusProjeto = 'Pendente';
                    if (avaliacaoDoProjeto && (avaliacaoDoProjeto.finalizadaPorAvaliador || (avaliacaoDoProjeto.notas || avaliacaoDoProjeto.itens).length > 0)) {
                        totalAvaliados++;
                        statusProjeto = '✅ Avaliado';
                    }
                    const projetoObj = await Projeto.findById(projetoAtribuido._id).lean();
                    if (projetoObj) {
                        projetosAvaliadosDetalhes.push({ titulo: projetoObj.titulo, status: statusProjeto });
                    }
                }
            }
            return {
                nome: av.nome,
                email: av.email,
                pinAtivo: av.pin, 
                ativo: av.ativo,
                totalAtribuidos: totalAtribuidos,
                totalAvaliados: totalAvaliados,
                projetos: projetosAvaliadosDetalhes 
            };
        }));

        const escola = await Escola.findById(escolaId).lean() || { nome: "Nome da Escola" };

        await generatePdfReport(req, res, 'pdf-resumo-avaliadores', {
            titulo: 'Resumo de Avaliadores',
            nomeFeira: feiraAtual.nome,
            avaliadores: resumoAvaliadores,
            escola: escola
        }, `resumo-avaliadores_${feiraAtual.nome}`);

    } catch (error) {
        console.error('Erro ao gerar PDF de resumo de avaliadores:', error);
        if (!res.headersSent) {
            req.flash('error_msg', 'Erro ao gerar PDF de resumo de avaliadores. Detalhes: ' + error.message);
            res.redirect('/admin/dashboard?tab=relatorios');
        }
    }
});


// ROTA: Relatório Consolidado da Feira
router.get('/relatorio-consolidado/pdf', verificarAdminEscola, async (req, res) => {
    try {
        const escolaId = req.session.adminEscola.escolaId;
        const feiraAtual = await Feira.findOne({ status: 'ativa', escolaId: escolaId });
        if (!feiraAtual) {
            req.flash('error_msg', 'Nenhuma feira ativa para esta escola para gerar o relatório consolidado.');
            if (!res.headersSent) { return res.redirect('/admin/dashboard?tab=relatorios'); }
        }

        const projetos = await Projeto.find({ feira: feiraAtual._id, escolaId: escolaId })
            .populate('categoria')
            .populate('criterios')
            .lean();

        const avaliacoes = await Avaliacao.find({ feira: feiraAtual._id, escolaId: escolaId }).lean();
        const criteriosOficiais = await Criterio.find({ feira: feiraAtual._id, escolaId: escolaId }).sort({ nome: 1 }).lean();

        const relatorioFinalPorProjeto = {};

        for (const projeto of projetos) {
            const categoriaNome = projeto.categoria ? projeto.categoria.nome : 'Sem Categoria';
            if (!relatorioFinalPorProjeto[categoriaNome]) {
                relatorioFinalPorProjeto[categoriaNome] = [];
            }

            const avaliacoesDoProjeto = avaliacoes.filter(a => a.projeto && String(a.projeto) === String(projeto._id));
            const numAvaliacoes = avaliacoesDoProjeto.length;
            
            const mediasCriterios = {};
            let totalNotaPonderadaProjeto = 0;
            let totalPesoProjeto = 0;

            for (const criterioOficial of criteriosOficiais) {
                const notasDoCriterioParaEsteProjeto = avaliacoesDoProjeto.flatMap(avaliacao => {
                    const notasArray = avaliacao.notas || avaliacao.itens;
                    return (notasArray && Array.isArray(notasArray)) ? notasArray.filter(item => {
                        const isCriterioMatch = item.criterio && (String(item.criterio) === String(criterioOficial._id));
                        const isValorValid = item.nota !== undefined && item.nota !== null && !isNaN(parseFloat(item.nota));
                        return isCriterioMatch && isValorValid;
                    }) : [];
                });

                if (notasDoCriterioParaEsteProjeto.length > 0) {
                    const sumNotas = notasDoCriterioParaEsteProjeto.reduce((acc, curr) => acc + parseFloat(curr.nota), 0);
                    const mediaCriterio = sumNotas / notasDoCriterioParaEsteProjeto.length;
                    mediasCriterios[String(criterioOficial._id)] = parseFloat(mediaCriterio).toFixed(2);

                    const isCriterioAssociatedToProject = projeto.criterios.some(c => String(c._id) === String(criterioOficial._id));
                    if (isCriterioAssociatedToProject) {
                         totalNotaPonderadaProjeto += parseFloat(mediasCriterios[String(criterioOficial._id)]) * criterioOficial.peso;
                         totalPesoProjeto += criterioOficial.peso;
                    }

                } else {
                    mediasCriterios[String(criterioOficial._id)] = 'N/A';
                }
            }

            const mediaGeralProjeto = totalPesoProjeto > 0 ? parseFloat(totalNotaPonderadaProjeto / totalPesoProjeto).toFixed(2) : 'N/A';

            relatorioFinalPorProjeto[categoriaNome].push({
                titulo: projeto.titulo,
                numAvaliacoes: numAvaliacoes,
                mediasCriterios: mediasCriterios,
                mediaGeral: mediaGeralProjeto
            });
        }

        const escola = await Escola.findById(escolaId).lean() || { nome: "Nome da Escola" };

        await generatePdfReport(req, res, 'pdf-consolidado', {
            titulo: 'Relatório Consolidado da Feira',
            nomeFeira: feiraAtual.nome,
            relatorioFinalPorProjeto: relatorioFinalPorProjeto,
            criteriosOficiais: criteriosOficiais,
            escola: escola
        }, `relatorio-consolidado_${feiraAtual.nome}`);

    } catch (error) {
        console.error('Erro ao gerar PDF do relatório consolidado:', error);
        if (!res.headersSent) {
            req.flash('error_msg', 'Erro ao gerar PDF do relatório consolidado. Detalhes: ' + error.message);
            res.redirect('/admin/dashboard?tab=relatorios');
        }
    }
});


// ===========================================
// ROTAS DE CONFIGURAÇÃO (ADMIN)
// ===========================================

// Atualizar informações da escola (POST)
router.post('/escola', verificarAdminEscola, async (req, res) => {
    const { id, nome, endereco, telefone, email, descricao, diretor, responsavel } = req.body;
    const adminEscolaId = req.session.adminEscola.escolaId;

    try {
        if (id) {
            // Garante que apenas a escola associada ao admin logado possa ser atualizada
            const updatedEscola = await Escola.findOneAndUpdate({ _id: id, _id: adminEscolaId }, { // Dupla verificação do ID da escola
                nome, endereco, telefone, email, descricao, diretor, responsavel
            }, { new: true });

            if (!updatedEscola) {
                req.flash('error_msg', 'Informações da escola não encontradas ou você não tem permissão para editá-las.');
                return res.redirect('/admin/dashboard?tab=configuracoes');
            }

            req.flash('success_msg', 'Informações da escola atualizadas com sucesso!');
        } else {
            // Este bloco é para criar a primeira escola do admin (se ele não tiver uma)
            const newEscola = new Escola({
                nome, endereco, telefone, email, descricao, diretor, responsavel
            });
            await newEscola.save();

            // Vincula esta nova escola ao admin logado
            await Admin.findByIdAndUpdate(req.session.adminEscola.id, { escolaId: newEscola._id }); // USANDO escolaId AQUI
            req.session.adminEscola.escolaId = newEscola._id.toString(); // Atualiza a sessão imediatamente

            req.flash('success_msg', 'Informações da escola salvas com sucesso!');
        }
        res.redirect('/admin/dashboard?tab=configuracoes');
    } catch (err) {
        console.error('Erro ao salvar informações da escola:', err);
        req.flash('error_msg', 'Erro ao salvar informações da escola. Detalhes: ' + err.message);
        res.redirect('/admin/dashboard?tab=configuracoes');
    }
});

// Atualizar datas da feira ativa (POST)
router.post('/configuracoes/feiradata', verificarAdminEscola, async (req, res) => {
    const { feiraId, inicioFeira, fimFeira } = req.body;
    const adminEscolaId = req.session.adminEscola.escolaId;

    // Validação de ID antes de tentar a operação no banco
    if (!feiraId || !mongoose.Types.ObjectId.isValid(feiraId)) {
        req.flash('error_msg', 'ID da feira inválido para atualização de datas.');
        return res.redirect('/admin/dashboard?tab=configuracoes');
    }

    try {
        // Atualiza a feira, garantindo que ela pertence à escola do admin logado
        const updatedFeira = await Feira.findOneAndUpdate(
            { _id: feiraId, escolaId: adminEscolaId }, // Encontra pelo ID E pela escola (USANDO escolaId AQUI)
            { inicioFeira, fimFeira },
            { new: true }
        );

        if (!updatedFeira) {
            req.flash('error_msg', 'Feira não encontrada ou você não tem permissão para atualizar suas datas.');
            return res.redirect('/admin/dashboard?tab=configuracoes');
        }

        req.flash('success_msg', 'Datas da feira atualizadas com sucesso!');
        res.redirect('/admin/dashboard?tab=configuracoes');
    } catch (err) {
        console.error('Erro ao atualizar datas da feira:', err);
        req.flash('error_msg', 'Erro ao atualizar datas da feira. Detalhes: ' + err.message);
        res.redirect('/admin/dashboard?tab=configuracoes');
    }
});


module.exports = router;
