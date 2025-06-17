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

// ===========================================
// VERIFICAÇÃO DE MODELOS (Adicionado para depuração)
// ===========================================
if (!Feira || typeof Feira.findOne !== 'function' ||
    !Projeto || typeof Projeto.findOne !== 'function' ||
    !Categoria || typeof Categoria.findOne !== 'function' ||
    !Criterio || typeof Criterio.findOne !== 'function' ||
    !Avaliador || typeof Avaliador.findOne !== 'function' ||
    !Avaliacao || typeof Avaliacao.findOne !== 'function' ||
    !Admin || typeof Admin.findOne !== 'function' ||
    !Escola || typeof Escola.findOne !== 'function') {
    console.error('ERRO CRÍTICO: Um ou mais modelos Mongoose não foram carregados corretamente. Verifique os caminhos de importação e a exportação dos modelos.');
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
// MIDDLEWARE DE AUTENTICAÇÃO
// ===========================================

// Middleware para verificar se o usuário é um admin autenticado e tem escolaId na sessão
function verificarAdminEscola(req, res, next) {
    if (res.headersSent) {
        console.warn('Headers já enviados, impedindo redirecionamento em verificarAdminEscola.');
        return;
    }

    if (req.session.adminEscola && req.session.adminEscola.role === 'admin' && req.session.adminEscola.escolaId) {
        return next();
    }

    if (req.session.adminEscola && !req.session.adminEscola.escolaId) {
        const errorMessage = 'Seu perfil de administrador não está vinculado a uma escola válida. Faça login novamente ou entre em contato com o suporte.';
        
        req.session.destroy(err => {
            if (err) console.error('Erro ao destruir sessão por falta de escolaId:', err);
            if (!res.headersSent) {
                res.clearCookie('connect.sid');
                req.flash('error_msg', errorMessage);
                res.redirect('/admin/login');
            }
        });
        return;
    }

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
        const admin = await Admin.findOne({ email: usuario }).populate('escolaId');

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
                        layout: 'layouts/public',
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
        console.error('Erro no login do admin:', err);
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
    // Define a mensagem flash ANTES de destruir a sessão
    req.flash('success_msg', 'Você saiu da sua conta de administrador.'); 
    // Destrói a sessão e, no callback, limpa o cookie e redireciona
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

// Função auxiliar para gerar PDF com Puppeteer
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
                const day = String(date.getDate()).padStart(2, '0');
                return `${day}/${month}/${year}`;
            }
        });

        // Configuração Puppeteer para Render com @sparticuz/chromium
        browser = await puppeteer.launch({
            args: [...chromium.args, '--hide-scrollbars', '--disable-web-security'],
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(), 
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
            const updatedEscola = await Escola.findOneAndUpdate({ _id: id, _id: adminEscolaId }, {
                nome, endereco, telefone, email, descricao, diretor, responsavel
            }, { new: true });

            if (!updatedEscola) {
                req.flash('error_msg', 'Informações da escola não encontradas ou você não tem permissão para editá-las.');
                return res.redirect('/admin/dashboard?tab=configuracoes');
            }

            req.flash('success_msg', 'Informações da escola atualizadas com sucesso!');
        } else {
            const newEscola = new Escola({
                nome, endereco, telefone, email, descricao, diretor, responsavel
            });
            await newEscola.save();

            await Admin.findByIdAndUpdate(req.session.adminEscola.id, { escolaId: newEscola._id });
            req.session.adminEscola.escolaId = newEscola._id.toString();

            req.flash('success_msg', 'Informações da escola salvas com sucesso!');
        }
        res.redirect('/admin/dashboard?tab=configuracoes');
    } catch (err) {
        console.error('Erro ao salvar informações da escola:', err);
        req.flash('error_msg', 'Erro ao salvar informações da escola. Detalhes: ' + err.message);
        res.redirect('/admin/dashboard?tab=configuracoes');
    }
});

// Rota para adicionar/editar feiras
router.post('/feiras', verificarAdminEscola, async (req, res) => {
    const { id, nome, inicioFeira, fimFeira, status } = req.body;
    const escolaId = req.session.adminEscola.escolaId;

    try {
        if (id) { // Editando uma feira existente
            const updatedFeira = await Feira.findOneAndUpdate(
                { _id: id, escolaId: escolaId }, // Garante que o admin só edite feiras da sua escola
                { nome, inicioFeira, fimFeira, status },
                { new: true }
            );

            if (!updatedFeira) {
                req.flash('error_msg', 'Feira não encontrada ou você não tem permissão para editá-la.');
                return res.redirect('/admin/dashboard?tab=feiras');
            }
            req.flash('success_msg', 'Feira atualizada com sucesso!');
        } else { // Criando uma nova feira
            const newFeira = new Feira({
                nome,
                inicioFeira,
                fimFeira,
                status,
                escolaId: escolaId // Associa a feira à escola do admin logado
            });
            await newFeira.save();
            req.flash('success_msg', 'Feira adicionada com sucesso!');
        }
        res.redirect('/admin/dashboard?tab=feiras');
    } catch (err) {
        console.error('Erro ao salvar feira:', err);
        req.flash('error_msg', 'Erro ao salvar feira. Detalhes: ' + err.message);
        res.redirect('/admin/dashboard?tab=feiras');
    }
});

// Rota para deletar feiras
router.post('/feiras/:id', verificarAdminEscola, async (req, res) => {
    // Esta rota deve ser um DELETE, mas como usamos method-override, aceitamos POST com _method=DELETE
    if (req.body._method !== 'DELETE') {
        req.flash('error_msg', 'Método HTTP inválido para esta operação.');
        return res.redirect('/admin/dashboard?tab=feiras');
    }
    
    const feiraId = req.params.id;
    const escolaId = req.session.adminEscola.escolaId;

    try {
        // Encontra a feira para garantir que pertence à escola do admin
        const feiraToDelete = await Feira.findOne({ _id: feiraId, escolaId: escolaId });

        if (!feiraToDelete) {
            req.flash('error_msg', 'Feira não encontrada ou você não tem permissão para deletá-la.');
            return res.redirect('/admin/dashboard?tab=feiras');
        }

        // Deleta todos os documentos relacionados a esta feira antes de deletar a feira em si
        await Projeto.deleteMany({ feira: feiraId, escolaId: escolaId });
        await Categoria.deleteMany({ feira: feiraId, escolaId: escolaId });
        await Criterio.deleteMany({ feira: feiraId, escolaId: escolaId });
        await Avaliador.deleteMany({ feira: feiraId, escolaId: escolaId });
        await Avaliacao.deleteMany({ feira: feiraId, escolaId: escolaId });

        // Finalmente, deleta a feira
        await Feira.findByIdAndDelete(feiraId);

        req.flash('success_msg', 'Feira e todos os seus dados relacionados foram deletados com sucesso!');
        res.redirect('/admin/dashboard?tab=feiras');
    } catch (err) {
        console.error('Erro ao deletar feira:', err);
        req.flash('error_msg', 'Erro ao deletar feira. Detalhes: ' + err.message);
        res.redirect('/admin/dashboard?tab=feiras');
    }
});


// Rota para Arquivar Feira Atual
router.post('/configuracoes/arquivar', verificarAdminEscola, async (req, res) => {
    const escolaId = req.session.adminEscola.escolaId;

    try {
        const feiraAtiva = await Feira.findOne({ escolaId: escolaId, status: 'ativa' });

        if (feiraAtiva) {
            feiraAtiva.status = 'arquivada';
            feiraAtiva.arquivadaEm = new Date(); // Registra a data de arquivamento
            await feiraAtiva.save();
            req.flash('success_msg', `Feira "${feiraAtiva.nome}" foi arquivada com sucesso!`);
        } else {
            req.flash('error_msg', 'Nenhuma feira ativa encontrada para arquivar.');
        }
        res.redirect('/admin/dashboard?tab=tab-configuracoes');
    } catch (err) {
        console.error('Erro ao arquivar feira:', err);
        req.flash('error_msg', 'Erro ao arquivar feira. Detalhes: ' + err.message);
        res.redirect('/admin/dashboard?tab=tab-configuracoes');
    }
});


// Rota para Iniciar Nova Feira
router.post('/configuracoes/nova', verificarAdminEscola, async (req, res) => {
    const escolaId = req.session.adminEscola.escolaId;

    try {
        // 1. Encontrar a feira atualmente ativa (se houver)
        const feiraAtivaAnterior = await Feira.findOne({ escolaId: escolaId, status: 'ativa' });

        // 2. Desativar/Arquivar a feira anterior (se existir)
        if (feiraAtivaAnterior) {
            feiraAtivaAnterior.status = 'arquivada';
            feiraAtivaAnterior.arquivadaEm = new Date();
            await feiraAtivaAnterior.save();
            console.log(`Feira anterior "${feiraAtivaAnterior.nome}" arquivada.`);
        }

        // 3. Criar a nova feira
        const nomeNovaFeira = `Feira de Ciências ${new Date().getFullYear() + 1}`; // Sugestão de nome
        const novaFeira = new Feira({
            nome: nomeNovaFeira,
            status: 'ativa',
            escolaId: escolaId,
            inicioFeira: null, // Pode ser definido posteriormente
            fimFeira: null     // Pode ser definido posteriormente
        });
        await novaFeira.save();
        console.log(`Nova feira "${novaFeira.nome}" criada e ativada.`);

        // 4. Copiar Categorias da feira anterior para a nova (se houver)
        if (feiraAtivaAnterior) {
            const categoriasAntigas = await Categoria.find({ feira: feiraAtivaAnterior._id, escolaId: escolaId }).lean();
            const novasCategorias = categoriasAntigas.map(cat => ({
                nome: cat.nome,
                escolaId: escolaId,
                feira: novaFeira._id // Associa à nova feira
            }));
            if (novasCategorias.length > 0) {
                await Categoria.insertMany(novasCategorias);
                console.log(`${novasCategorias.length} categorias copiadas para a nova feira.`);
            }
        }

        // 5. Copiar Critérios da feira anterior para a nova (se houver)
        if (feiraAtivaAnterior) {
            const criteriosAntigos = await Criterio.find({ feira: feiraAtivaAnterior._id, escolaId: escolaId }).lean();
            const novosCriterios = criteriosAntigos.map(crit => ({
                nome: crit.nome,
                peso: crit.peso,
                observacao: crit.observacao,
                escolaId: escolaId,
                feira: novaFeira._id // Associa à nova feira
            }));
            if (novosCriterios.length > 0) {
                await Criterio.insertMany(novosCriterios);
                console.log(`${novosCriterios.length} critérios copiados para a nova feira.`);
            }
        }
        
        // 6. Atualizar avaliadores para a nova feira (opcional, dependendo da sua lógica de negócios)
        // Por exemplo, você pode querer desativar todos os avaliadores da feira anterior ou
        // mantê-los ativos e apenas redefinir seus projetos atribuídos e avaliações.
        // Por enquanto, vamos limpar os projetos atribuidos e avaliações dos avaliadores.
        await Avaliador.updateMany(
            { escolaId: escolaId, feira: feiraAtivaAnterior ? feiraAtivaAnterior._id : null },
            { $set: { projetosAtribuidos: [], pin: generateUniquePin(), ativo: false } } // Desativa, limpa projetos e gera novo PIN
        );
        console.log('Projetos atribuídos e PINs de avaliadores da feira anterior redefinidos.');

        // Se quiser redefinir status de avaliadores para a nova feira
        await Avaliador.updateMany(
            { escolaId: escolaId, feira: feiraAtivaAnterior ? feiraAtivaAnterior._id : null },
            { $set: { feira: novaFeira._id } } // Move avaliadores para a nova feira
        );
        console.log('Avaliadores associados à nova feira.');
        

        req.flash('success_msg', `Nova feira "${novaFeira.nome}" iniciada com sucesso! Categorias e critérios da feira anterior foram copiados.`);
        res.redirect('/admin/dashboard?tab=tab-configuracoes');

    } catch (err) {
        console.error('Erro ao iniciar nova feira:', err);
        req.flash('error_msg', 'Erro ao iniciar nova feira. Detalhes: ' + err.message);
        res.redirect('/admin/dashboard?tab=tab-configuracoes');
    }
});


// Rota para adicionar/editar projetos
router.post('/projetos', verificarAdminEscola, async (req, res) => {
    const { id, titulo, descricao, categoria, criterios, turma, alunos } = req.body;
    const escolaId = req.session.adminEscola.escolaId;
    const feiraAtual = await Feira.findOne({ escolaId: escolaId, status: 'ativa' });

    if (!feiraAtual) {
        req.flash('error_msg', 'É necessário ter uma feira ativa para adicionar ou editar projetos.');
        return res.redirect('/admin/dashboard?tab=projetos');
    }

    const alunosArray = alunos ? alunos.split(',').map(a => a.trim()) : [];
    const criteriosArray = criterios || []; // Se for um único critério, pode vir como string. Se múltiplos, como array.

    try {
        if (id) { // Edição
            const updatedProjeto = await Projeto.findOneAndUpdate(
                { _id: id, escolaId: escolaId, feira: feiraAtual._id },
                {
                    titulo,
                    descricao,
                    categoria,
                    criterios: criteriosArray,
                    turma,
                    alunos: alunosArray
                },
                { new: true }
            );
            if (!updatedProjeto) {
                req.flash('error_msg', 'Projeto não encontrado ou você não tem permissão para editá-lo.');
                return res.redirect('/admin/dashboard?tab=projetos');
            }
            req.flash('success_msg', 'Projeto atualizado com sucesso!');
        } else { // Criação
            const newProjeto = new Projeto({
                titulo,
                descricao,
                categoria,
                criterios: criteriosArray,
                turma,
                alunos: alunosArray,
                escolaId: escolaId,
                feira: feiraAtual._id
            });
            await newProjeto.save();
            req.flash('success_msg', 'Projeto adicionado com sucesso!');
        }
        res.redirect('/admin/dashboard?tab=projetos');
    } catch (err) {
        console.error('Erro ao salvar projeto:', err);
        req.flash('error_msg', 'Erro ao salvar projeto. Detalhes: ' + err.message);
        res.redirect('/admin/dashboard?tab=projetos');
    }
});

// Rota para deletar projeto
router.post('/projetos/:id', verificarAdminEscola, async (req, res) => {
    if (req.body._method !== 'DELETE') {
        req.flash('error_msg', 'Método HTTP inválido para esta operação.');
        return res.redirect('/admin/dashboard?tab=projetos');
    }

    const projetoId = req.params.id;
    const escolaId = req.session.adminEscola.escolaId;
    const feiraAtual = await Feira.findOne({ escolaId: escolaId, status: 'ativa' });

    if (!feiraAtual) {
        req.flash('error_msg', 'Nenhuma feira ativa para gerenciar projetos.');
        return res.redirect('/admin/dashboard?tab=projetos');
    }

    try {
        // Deleta o projeto, garantindo que ele pertence à escola e à feira ativa
        const deletedProjeto = await Projeto.findOneAndDelete({ _id: projetoId, escolaId: escolaId, feira: feiraAtual._id });

        if (!deletedProjeto) {
            req.flash('error_msg', 'Projeto não encontrado ou você não tem permissão para deletá-lo nesta feira.');
            return res.redirect('/admin/dashboard?tab=projetos');
        }

        // Opcional: Remover referências a este projeto em avaliações ou avaliadores
        await Avaliacao.deleteMany({ projeto: projetoId, escolaId: escolaId, feira: feiraAtual._id });
        await Avaliador.updateMany(
            { escolaId: escolaId, feira: feiraAtual._id, projetosAtribuidos: projetoId },
            { $pull: { projetosAtribuidos: projetoId } }
        );

        req.flash('success_msg', 'Projeto deletado com sucesso!');
        res.redirect('/admin/dashboard?tab=projetos');
    } catch (err) {
        console.error('Erro ao deletar projeto:', err);
        req.flash('error_msg', 'Erro ao deletar projeto. Detalhes: ' + err.message);
        res.redirect('/admin/dashboard?tab=projetos');
    }
});

// Rotas para Categorias
router.post('/categorias', verificarAdminEscola, async (req, res) => {
    const { id, nome } = req.body;
    const escolaId = req.session.adminEscola.escolaId;
    const feiraAtual = await Feira.findOne({ escolaId: escolaId, status: 'ativa' });

    if (!feiraAtual) {
        req.flash('error_msg', 'É necessário ter uma feira ativa para adicionar ou editar categorias.');
        return res.redirect('/admin/dashboard?tab=categorias');
    }

    try {
        if (id) { // Edição
            const updatedCategoria = await Categoria.findOneAndUpdate(
                { _id: id, escolaId: escolaId, feira: feiraAtual._id },
                { nome },
                { new: true }
            );
            if (!updatedCategoria) {
                req.flash('error_msg', 'Categoria não encontrada ou você não tem permissão para editá-la.');
                return res.redirect('/admin/dashboard?tab=categorias');
            }
            req.flash('success_msg', 'Categoria atualizada com sucesso!');
        } else { // Criação
            const newCategoria = new Categoria({
                nome,
                escolaId: escolaId,
                feira: feiraAtual._id
            });
            await newCategoria.save();
            req.flash('success_msg', 'Categoria adicionada com sucesso!');
        }
        res.redirect('/admin/dashboard?tab=categorias');
    } catch (err) {
        console.error('Erro ao salvar categoria:', err);
        req.flash('error_msg', 'Erro ao salvar categoria. Detalhes: ' + err.message);
        res.redirect('/admin/dashboard?tab=categorias');
    }
});

router.post('/categorias/:id', verificarAdminEscola, async (req, res) => {
    if (req.body._method !== 'DELETE') {
        req.flash('error_msg', 'Método HTTP inválido para esta operação.');
        return res.redirect('/admin/dashboard?tab=categorias');
    }

    const categoriaId = req.params.id;
    const escolaId = req.session.adminEscola.escolaId;
    const feiraAtual = await Feira.findOne({ escolaId: escolaId, status: 'ativa' });

    if (!feiraAtual) {
        req.flash('error_msg', 'Nenhuma feira ativa para gerenciar categorias.');
        return res.redirect('/admin/dashboard?tab=categorias');
    }

    try {
        const deletedCategoria = await Categoria.findOneAndDelete({ _id: categoriaId, escolaId: escolaId, feira: feiraAtual._id });
        if (!deletedCategoria) {
            req.flash('error_msg', 'Categoria não encontrada ou você não tem permissão para deletá-la.');
            return res.redirect('/admin/dashboard?tab=categorias');
        }
        // Opcional: Atualizar projetos que usam esta categoria para null ou uma categoria padrão
        await Projeto.updateMany({ categoria: categoriaId, escolaId: escolaId, feira: feiraAtual._id }, { $unset: { categoria: "" } }); // Remove a referência da categoria nos projetos
        req.flash('success_msg', 'Categoria deletada com sucesso!');
        res.redirect('/admin/dashboard?tab=categorias');
    } catch (err) {
        console.error('Erro ao deletar categoria:', err);
        req.flash('error_msg', 'Erro ao deletar categoria. Detalhes: ' + err.message);
        res.redirect('/admin/dashboard?tab=categorias');
    }
});

// Rotas para Critérios
router.post('/criterios', verificarAdminEscola, async (req, res) => {
    const { id, nome, peso, observacao } = req.body;
    const escolaId = req.session.adminEscola.escolaId;
    const feiraAtual = await Feira.findOne({ escolaId: escolaId, status: 'ativa' });

    if (!feiraAtual) {
        req.flash('error_msg', 'É necessário ter uma feira ativa para adicionar ou editar critérios.');
        return res.redirect('/admin/dashboard?tab=criterios');
    }

    try {
        if (id) { // Edição
            const updatedCriterio = await Criterio.findOneAndUpdate(
                { _id: id, escolaId: escolaId, feira: feiraAtual._id },
                { nome, peso, observacao },
                { new: true }
            );
            if (!updatedCriterio) {
                req.flash('error_msg', 'Critério não encontrado ou você não tem permissão para editá-lo.');
                return res.redirect('/admin/dashboard?tab=criterios');
            }
            req.flash('success_msg', 'Critério atualizado com sucesso!');
        } else { // Criação
            const newCriterio = new Criterio({
                nome,
                peso,
                observacao,
                escolaId: escolaId,
                feira: feiraAtual._id
            });
            await newCriterio.save();
            req.flash('success_msg', 'Critério adicionado com sucesso!');
        }
        res.redirect('/admin/dashboard?tab=criterios');
    } catch (err) {
        console.error('Erro ao salvar critério:', err);
        req.flash('error_msg', 'Erro ao salvar critério. Detalhes: ' + err.message);
        res.redirect('/admin/dashboard?tab=criterios');
    }
});

router.post('/criterios/:id', verificarAdminEscola, async (req, res) => {
    if (req.body._method !== 'DELETE') {
        req.flash('error_msg', 'Método HTTP inválido para esta operação.');
        return res.redirect('/admin/dashboard?tab=criterios');
    }

    const criterioId = req.params.id;
    const escolaId = req.session.adminEscola.escolaId;
    const feiraAtual = await Feira.findOne({ escolaId: escolaId, status: 'ativa' });

    if (!feiraAtual) {
        req.flash('error_msg', 'Nenhuma feira ativa para gerenciar critérios.');
        return res.redirect('/admin/dashboard?tab=criterios');
    }

    try {
        const deletedCriterio = await Criterio.findOneAndDelete({ _id: criterioId, escolaId: escolaId, feira: feiraAtual._id });
        if (!deletedCriterio) {
            req.flash('error_msg', 'Critério não encontrado ou você não tem permissão para deletá-lo.');
            return res.redirect('/admin/dashboard?tab=criterios');
        }
        // Opcional: Remover este critério dos projetos que o utilizam
        await Projeto.updateMany({ criterios: criterioId, escolaId: escolaId, feira: feiraAtual._id }, { $pull: { criterios: criterioId } });
        req.flash('success_msg', 'Critério deletado com sucesso!');
        res.redirect('/admin/dashboard?tab=criterios');
    } catch (err) {
        console.error('Erro ao deletar critério:', err);
        req.flash('error_msg', 'Erro ao deletar critério. Detalhes: ' + err.message);
        res.redirect('/admin/dashboard?tab=criterios');
    }
});

// Rotas para Avaliadores
router.post('/avaliadores', verificarAdminEscola, async (req, res) => {
    const { id, nome, email, pin, ativo, projetosAtribuidos } = req.body;
    const escolaId = req.session.adminEscola.escolaId;
    const feiraAtual = await Feira.findOne({ escolaId: escolaId, status: 'ativa' });

    if (!feiraAtual) {
        req.flash('error_msg', 'É necessário ter uma feira ativa para adicionar ou editar avaliadores.');
        return res.redirect('/admin/dashboard?tab=avaliadores');
    }

    try {
        if (id) { // Edição
            const updatedAvaliador = await Avaliador.findOneAndUpdate(
                { _id: id, escolaId: escolaId, feira: feiraAtual._id },
                {
                    nome,
                    email,
                    pin, // PIN é mantido se não for alterado na edição
                    ativo: ativo === 'true' || ativo === true, // Converte para booleano
                    projetosAtribuidos: projetosAtribuidos || [],
                },
                { new: true }
            );
            if (!updatedAvaliador) {
                req.flash('error_msg', 'Avaliador não encontrado ou você não tem permissão para editá-lo.');
                return res.redirect('/admin/dashboard?tab=avaliadores');
            }
            req.flash('success_msg', 'Avaliador atualizado com sucesso!');
        } else { // Criação
            // Gera um PIN se não for fornecido
            const newPin = pin || generateUniquePin(4); // Garante 4 dígitos

            const newAvaliador = new Avaliador({
                nome,
                email,
                pin: newPin,
                ativo: ativo === 'true' || ativo === true, // Converte para booleano
                projetosAtribuidos: projetosAtribuidos || [],
                escolaId: escolaId,
                feira: feiraAtual._id
            });
            await newAvaliador.save();
            req.flash('success_msg', `Avaliador adicionado com sucesso! PIN: ${newPin}`);
        }
        res.redirect('/admin/dashboard?tab=avaliadores');
    } catch (err) {
        console.error('Erro ao salvar avaliador:', err);
        req.flash('error_msg', 'Erro ao salvar avaliador. Detalhes: ' + err.message);
        res.redirect('/admin/dashboard?tab=avaliadores');
    }
});

router.post('/avaliadores/:id', verificarAdminEscola, async (req, res) => {
    if (req.body._method !== 'DELETE') {
        req.flash('error_msg', 'Método HTTP inválido para esta operação.');
        return res.redirect('/admin/dashboard?tab=avaliadores');
    }

    const avaliadorId = req.params.id;
    const escolaId = req.session.adminEscola.escolaId;
    const feiraAtual = await Feira.findOne({ escolaId: escolaId, status: 'ativa' });

    if (!feiraAtual) {
        req.flash('error_msg', 'Nenhuma feira ativa para gerenciar avaliadores.');
        return res.redirect('/admin/dashboard?tab=avaliadores');
    }

    try {
        const deletedAvaliador = await Avaliador.findOneAndDelete({ _id: avaliadorId, escolaId: escolaId, feira: feiraAtual._id });
        if (!deletedAvaliador) {
            req.flash('error_msg', 'Avaliador não encontrado ou você não tem permissão para deletá-lo.');
            return res.redirect('/admin/dashboard?tab=avaliadores');
        }
        // Opcional: Deletar avaliações feitas por este avaliador
        await Avaliacao.deleteMany({ avaliador: avaliadorId, escolaId: escolaId, feira: feiraAtual._id });
        req.flash('success_msg', 'Avaliador deletado com sucesso!');
        res.redirect('/admin/dashboard?tab=avaliadores');
    } catch (err) {
        console.error('Erro ao deletar avaliador:', err);
        req.flash('error_msg', 'Erro ao deletar avaliador. Detalhes: ' + err.message);
        res.redirect('/admin/dashboard?tab=avaliadores');
    }
});

// Rotas para Admins (Usuários Admin adicionais)
router.post('/usuarios', verificarAdminEscola, async (req, res) => {
    const { id, nome, email, senha, isAdmin } = req.body;
    const escolaId = req.session.adminEscola.escolaId;

    try {
        if (id) { // Edição de um usuário admin existente
            const adminToUpdate = await Admin.findOne({ _id: id, escolaId: escolaId });

            if (!adminToUpdate) {
                req.flash('error_msg', 'Usuário admin não encontrado ou você não tem permissão para editá-lo.');
                return res.redirect('/admin/dashboard?tab=tab-configuracoes');
            }

            adminToUpdate.nome = nome;
            adminToUpdate.email = email;
            adminToUpdate.isAdmin = isAdmin === 'true'; // Converte para booleano

            if (senha) { // Somente atualiza a senha se uma nova for fornecida
                const salt = await bcrypt.genSalt(10);
                adminToUpdate.senha = await bcrypt.hash(senha, salt);
            }
            await adminToUpdate.save();
            req.flash('success_msg', 'Usuário admin atualizado com sucesso!');

        } else { // Criação de um novo usuário admin
            const existingAdmin = await Admin.findOne({ email: email, escolaId: escolaId });
            if (existingAdmin) {
                req.flash('error_msg', 'Já existe um usuário admin com este e-mail nesta escola.');
                return res.redirect('/admin/dashboard?tab=tab-configuracoes');
            }

            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(senha, salt);

            const newAdmin = new Admin({
                nome,
                email,
                senha: hashedPassword,
                role: 'admin', // Ou qualquer outro papel padrão
                isAdmin: true, // Ou baseado no input do formulário
                escolaId: escolaId
            });
            await newAdmin.save();
            req.flash('success_msg', 'Novo usuário admin adicionado com sucesso!');
        }
        res.redirect('/admin/dashboard?tab=tab-configuracoes');

    } catch (err) {
        console.error('Erro ao salvar usuário admin:', err);
        req.flash('error_msg', 'Erro ao salvar usuário admin. Detalhes: ' + err.message);
        res.redirect('/admin/dashboard?tab=tab-configuracoes');
    }
});

router.post('/usuarios/:id', verificarAdminEscola, async (req, res) => {
    if (req.body._method !== 'DELETE') {
        req.flash('error_msg', 'Método HTTP inválido para esta operação.');
        return res.redirect('/admin/dashboard?tab=tab-configuracoes');
    }

    const userId = req.params.id;
    const escolaId = req.session.adminEscola.escolaId;

    try {
        // Encontra e deleta o usuário admin, garantindo que pertence à escola e não é o admin principal (se tiver um)
        const deletedUser = await Admin.findOneAndDelete({ _id: userId, escolaId: escolaId });

        if (!deletedUser) {
            req.flash('error_msg', 'Usuário admin não encontrado, ou você não tem permissão para deletá-lo, ou é o usuário principal.');
            return res.redirect('/admin/dashboard?tab=tab-configuracoes');
        }
        req.flash('success_msg', 'Usuário admin deletado com sucesso!');
        res.redirect('/admin/dashboard?tab=tab-configuracoes');
    } catch (err) {
        console.error('Erro ao deletar usuário admin:', err);
        req.flash('error_msg', 'Erro ao deletar usuário admin. Detalhes: ' + err.message);
        res.redirect('/admin/dashboard?tab=tab-configuracoes');
    }
});

// Rota do painel principal (Dashboard Admin)
router.get('/dashboard', verificarAdminEscola, async (req, res) => {
    try {
        const escolaId = req.session.adminEscola.escolaId;

        const feiraAtual = await Feira.findOne({ escolaId: escolaId, status: 'ativa' }).lean();
        const feiras = await Feira.find({ escolaId: escolaId }).sort({ inicioFeira: -1 }).lean();
        const projetos = await Projeto.find({ escolaId: escolaId }).populate('categoria criterios').lean();
        const categorias = await Categoria.find({ escolaId: escolaId }).lean();
        const criterios = await Criterio.find({ escolaId: escolaId }).lean();
        const avaliadores = await Avaliador.find({ escolaId: escolaId }).populate('projetosAtribuidos').lean();
        const avaliacoes = await Avaliacao.find({ escolaId: escolaId }).lean();
        const escolas = await Escola.find().lean();

        // Agrupando projetos por categoria
        const projetosPorCategoria = {};
        projetos.forEach(p => {
            const nomeCategoria = (p.categoria && p.categoria.nome) || 'Sem Categoria';
            if (!projetosPorCategoria[nomeCategoria]) {
                projetosPorCategoria[nomeCategoria] = [];
            }
            projetosPorCategoria[nomeCategoria].push(p);
        });

        const totalProjetos = projetos.length;
        const totalAvaliadores = avaliadores.length;

        const projetosAvaliadosCompletosCount = avaliacoes
            .filter(a => a.finalizadaPorAvaliador || (a.notas && a.notas.length > 0))
            .map(a => a.projeto.toString())
            .filter((value, index, self) => self.indexOf(value) === index).length;

        const projetosPendentesAvaliacaoCount = totalProjetos - projetosAvaliadosCompletosCount;

        // Cálculo de média geral
        let somaNotas = 0;
        let totalNotas = 0;
        avaliacoes.forEach(av => {
            const notas = av.notas || av.itens || [];
            notas.forEach(n => {
                if (n.nota !== undefined && n.nota !== null) {
                    somaNotas += parseFloat(n.nota);
                    totalNotas++;
                }
            });
        });

        const mediaGeralAvaliacoes = totalNotas > 0 ? (somaNotas / totalNotas).toFixed(2) : 'N/A';

        res.render('admin/dashboard', {
            layout: 'layouts/admin',
            titulo: 'Painel da Feira',
            feiraAtual,
            feiras,
            projetos,
            categorias,
            criterios,
            avaliadores,
            avaliacoes,
            escolas,
            totalProjetos,
            totalAvaliadores,
            projetosAvaliadosCompletosCount,
            projetosPendentesAvaliacaoCount,
            mediaGeralAvaliacoes,
            projetosPorCategoria
        });

    } catch (err) {
        console.error('Erro ao carregar dashboard:', err);
        req.flash('error_msg', 'Erro ao carregar o painel. Tente novamente.');
        res.redirect('/admin/login');
    }
});



module.exports = router;
