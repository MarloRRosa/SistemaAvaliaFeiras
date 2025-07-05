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
 * @param {object} admin Objeto do administrador com nome e email.
 * @param {string} temporaryPassword A senha temporária gerada.
 * @param {string} appUrl A URL base da aplicação para links.
 * @returns {Promise<boolean>} True se o e-mail foi enviado, false caso contrário.
 */
async function sendAdminTemporaryPasswordEmail(admin, temporaryPassword, appUrl) {
    const mailOptions = {
        from: `"AvaliaFeiras" <${process.env.EMAIL_USER}>`,
        to: admin.email,
        subject: 'Sua Senha de Administrador do AvaliaFeiras foi Redefinida',
        html: `
            <p>Olá, ${admin.nome},</p>
            <p>Sua senha de administrador da escola no sistema AvaliaFeiras foi redefinida pelo Super Admin.</p>
            <p>Sua nova senha provisória é: <strong>${temporaryPassword}</strong></p>
            <p>Recomendamos fortemente que você altere sua senha imediatamente após o login para garantir a segurança da sua conta.</p>
            <p>Clique aqui para fazer login: <a href="${appUrl}/admin/login">${appUrl}/admin/login</a></p>
            <p>Atenciosamente,<br>Equipe AvaliaFeiras</p>
            <hr>
            <p style="font-size: 10px; color: #777;">Este é um e-mail automático, por favor, não responda.</p>
        `
    };

    try {
        if (process.env.EMAIL_USER && process.env.EMAIL_HOST && process.env.EMAIL_PASS) {
            const transporter = nodemailer.createTransport({
                host: process.env.EMAIL_HOST,
                port: parseInt(process.env.EMAIL_PORT, 10),
                secure: process.env.EMAIL_SECURE === 'true',
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS
                },
                tls: {
                    rejectUnauthorized: false
                }
            });
            await transporter.sendMail(mailOptions);
            console.log(`E-mail com senha provisória enviado para ${admin.email}`);
            return true;
        } else {
            console.warn('Variáveis de ambiente de e-mail não configuradas. E-mail de senha provisória para admin não será enviado.');
            return false;
        }
    } catch (error) {
        console.error(`Erro ao enviar e-mail de senha provisória para ${admin.email}:`, error);
        return false;
    }
}

/**
 * Middleware para verificar se o usuário é um Super Admin e está autenticado.
 * @param {object} req Objeto de requisição.
 * @param {object} res Objeto de resposta.
 * @param {function} next Próxima função middleware.
 */
function verificarSuperAdmin(req, res, next) {
    if (res.headersSent) {
        console.warn('Headers já enviados em verificarSuperAdmin, abortando.');
        return;
    }
    if (req.session && req.session.superAdminId) {
        return next();
    }
    req.flash('error_msg', 'Você precisa estar logado como Super Admin para acessar esta área.');
    res.redirect('/superadmin/login');
}

// Configuração do Nodemailer (mantida aqui para ser acessível às rotas de e-mail)
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT, 10),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false
    }
});


// ========================================================================
// ROTAS DE AUTENTICAÇÃO DO SUPER ADMIN
// ========================================================================

// Rota para o formulário de login do Super Admin
router.get('/login', (req, res) => {
    // Coleta mensagens da URL, se existirem, e as adiciona ao flash
    const message = req.query.message;
    const error = req.query.error;

    if (message === 'logout_success') {
        req.flash('success_msg', 'Você foi desconectado com sucesso.');
    } else if (message) {
        req.flash('success_msg', message);
    }

    if (error === 'logout_failed') {
        req.flash('error_msg', 'Erro ao fazer logout.');
    } else if (error) {
        req.flash('error_msg', error);
    }
    
    // --- CORREÇÃO DO LOOP DE REDIRECIONAMENTO AQUI ---
    // Verifica se há query parameters na URL para limpar
    if (req.originalUrl.includes('?')) {
        const url = new URL(req.originalUrl, `http://${req.headers.host}`); // Cria uma URL completa para manipulação
        const hasParamsToClear = url.searchParams.has('message') || url.searchParams.has('error');

        url.searchParams.delete('message');
        url.searchParams.delete('error');

        // Redireciona APENAS se havia parâmetros para limpar e a URL mudou
        if (hasParamsToClear) {
            res.redirect(url.pathname + url.search);
            return; 
        }
    }

    if (req.session.superAdminId) {
        return res.redirect('/superadmin/dashboard');
    }
    res.render('superadmin/login', {
        titulo: 'Login Super Admin', 
        layout: false, 
        error_msg: req.flash('error_msg'), // Exibe as mensagens flash
        success_msg: req.flash('success_msg') // Exibe as mensagens flash
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
        res.render('superadmin/login', { 
            titulo: 'Login Super Admin', 
            layout: 'layouts/public', 
            error_msg: req.flash('error_msg'),
            success_msg: req.flash('success_msg') 
        });
        return; 
    }

    try {
        const emailLowerCase = email.toLowerCase(); 
        console.log('E-mail para busca no BD (lowercase):', emailLowerCase);

        const superAdmin = await SuperAdmin.findOne({ email: emailLowerCase });
        console.log('Super Admin encontrado:', superAdmin ? superAdmin.email : 'Nenhum');

        if (!superAdmin) {
            console.log('Super Admin não encontrado.');
            req.flash('error_msg', 'Credenciais inválidas.');
            res.render('superadmin/login', { 
                titulo: 'Login Super Admin', 
                layout: false, 
                error_msg: req.flash('error_msg'),
                success_msg: req.flash('success_msg') 
            });
            return;
        }

        const isMatch = await bcrypt.compare(senha, superAdmin.senha);
        console.log('Comparação de senha (isMatch):', isMatch);

        if (!isMatch) {
            console.log('Senha incorreta.');
            req.flash('error_msg', 'Credenciais inválidas.');
            res.render('superadmin/login', { 
                titulo: 'Login Super Admin', 
                layout: 'layouts/public', 
                error_msg: req.flash('error_msg'),
                success_msg: req.flash('success_msg') 
            });
            return;
        }

        req.session.superAdminId = superAdmin._id.toString(); 
        console.log('ID do Super Admin atribuído à sessão (string):', req.session.superAdminId);

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
        if (!res.headersSent) { 
            req.flash('error_msg', 'Ocorreu um erro ao tentar fazer login. Tente novamente.');
            res.render('superadmin/login', { 
                titulo: 'Login Super Admin', 
                layout: 'layouts/public', 
                error_msg: req.flash('error_msg'),
                success_msg: req.flash('success_msg') 
            });
        }
    }
});

// Rota para logout do Super Admin
router.get('/logout', verificarSuperAdmin, (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Erro ao destruir sessão:', err);
            return res.redirect('/superadmin/login?error=logout_failed');
        }
        res.clearCookie('connect.sid'); 
        res.redirect('/superadmin/login?message=logout_success');
    });
});

// ========================================================================
// ROTAS DO DASHBOARD E GESTÃO DE ESCOLAS (AGORA COM ABAS E RELATÓRIOS)
// ========================================================================

router.get('/dashboard', verificarSuperAdmin, async (req, res) => {
    try {
        const activeTab = req.query.tab || 'visao-geral';

        let dataForTab = {
            totalEscolas: 0,
            totalAdmins: 0,
            totalAvaliadores: 0,
            totalProjetos: 0,
            totalAvaliacoes: 0,
            totalSolicitacoesPendentes: 0,
            escolasDetalhes: [],
            solicitacoes: [],
            projetosNaoAvaliados: [],
            todasEscolas: [], 
            selectedEscolaId: '',
            rankingProjetosPorCategoria: {}, 
            resumoAvaliadoresPorEscola: [] 
        };

        const escolasCadastradas = await Escola.find().sort({ nome: 1 }).lean();
        dataForTab.todasEscolas = escolasCadastradas; 

        if (activeTab === 'visao-geral') {
            dataForTab.totalEscolas = await Escola.countDocuments();
            dataForTab.totalAdmins = await Admin.countDocuments();
            dataForTab.totalAvaliadores = await Avaliador.countDocuments();
            dataForTab.totalProjetos = await Projeto.countDocuments();
            dataForTab.totalAvaliacoes = await Avaliacao.countDocuments();
            dataForTab.totalSolicitacoesPendentes = await SolicitacaoAcesso.countDocuments({ status: 'Pendente' });

        } else if (activeTab === 'gerenciar-escolas') {
            const escolasComDetalhes = await Promise.all(escolasCadastradas.map(async (escola) => {
                const adminPrincipal = await Admin.findOne({ escolaId: escola._id });
                const numProjetos = await Projeto.countDocuments({ escolaId: escola._id });
                const numAvaliadores = await Avaliador.countDocuments({ escolaId: escola._id });
                const numAvaliacoes = await Avaliacao.countDocuments({ escolaId: escola._id });

                return {
                    ...escola, 
                    adminEmail: adminPrincipal ? adminPrincipal.email : 'N/A',
                    numProjetos,
                    numAvaliadores,
                    numAvaliacoes
                };
            }));
            dataForTab.escolasDetalhes = escolasComDetalhes;

        } else if (activeTab === 'solicitacoes') {
            dataForTab.solicitacoes = await SolicitacaoAcesso.find({ status: 'Pendente' }).sort({ dataSolicitacao: 'asc' }).lean();

        } else if (activeTab === 'projetos-sem-avaliacao') {
            const selectedEscolaId = req.query.escolaId;
            dataForTab.selectedEscolaId = selectedEscolaId;

            if (selectedEscolaId && mongoose.Types.ObjectId.isValid(selectedEscolaId)) {
                const feiraAtual = await Feira.findOne({ status: 'ativa', escola: selectedEscolaId });

                if (feiraAtual) {
                    const projetos = await Projeto.find({ feira: feiraAtual._id, escolaId: selectedEscolaId }).lean();
                    const avaliacoes = await Avaliacao.find({ feira: feiraAtual._id, escola: selectedEscolaId }).lean();
                    const avaliadores = await Avaliador.find({ feira: feiraAtual._id, escolaId: selectedEscolaId }).lean();
                    const criteriosDaFeira = await Criterio.find({ feira: feiraAtual._id, escolaId: selectedEscolaId }).lean();
                    const totalCriteriosFeira = criteriosDaFeira.length;

                    for (const projeto of projetos) {
                        const avaliacoesDoProjeto = avaliacoes.filter(a => a.projeto && String(a.projeto) === String(projeto._id));
                        
                        let isCompleta = true;
                        if (totalCriteriosFeira > 0) {
                            for (const criterio of criteriosDaFeira) {
                                const temNotaParaCriterio = avaliacoesDoProjeto.some(aval => 
                                    aval.itens.some(item => 
                                        String(item.criterio) === String(criterio._id) && 
                                        item.nota !== undefined && item.nota !== null
                                    )
                                );
                                if (!temNotaParaCriterio) {
                                    isCompleta = false;
                                    break;
                                }
                            }
                        } else {
                            if (!avaliacoesDoProjeto || avaliacoesDoProjeto.length === 0) {
                                isCompleta = false;
                            }
                        }

                        if (!isCompleta) {
                            const assignedEvaluators = avaliadores
                                .filter(av => av.projetosAtribuidos && av.projetosAtribuidos.some(pa => String(pa) === String(projeto._id)))
                                .map(av => av.nome)
                                .join(', ');

                            dataForTab.projetosNaoAvaliados.push({
                                titulo: projeto.titulo,
                                turma: projeto.turma,
                                avaliadoresDesignados: assignedEvaluators || 'Nenhum avaliador atribuído',
                                numAvaliacoesRecebidas: avaliacoesDoProjeto.length,
                                totalCriteriosNecessarios: totalCriteriosFeira
                            });
                        }
                    }
                }
            }
        } else if (activeTab === 'ranking-projetos') {
            const categorias = await Criterio.aggregate([ 
                { $match: { feira: { $ne: null } } }, 
                { $group: { _id: "$categoriaId", nome: { $first: "$categoria.nome" } } },
                { $lookup: { from: 'categorias', localField: '_id', foreignField: '_id', as: 'categoriaInfo' } },
                { $unwind: { path: '$categoriaInfo', preserveNullAndEmptyArrays: true } },
                { $project: { _id: 1, nome: '$categoriaInfo.nome' } } 
            ]);

            let rankingPorCategoria = {};

            for (const categoria of categorias) {
                const projetosDaCategoria = await Projeto.find({ categoria: categoria._id }).lean();
                let projetosComRanking = [];

                for (const projeto of projetosDaCategoria) {
                    const avaliacoesDoProjeto = await Avaliacao.find({ projeto: projeto._id }).lean();
                    
                    if (avaliacoesDoProjeto.length > 0) {
                        let totalPontuacao = 0;
                        let totalPesos = 0;

                        const criteriosOficiaisProjeto = await Criterio.find({ _id: { $in: projeto.criterios } }).lean();
                        
                        let notasPorCriterio = {};
                        criteriosOficiaisProjeto.forEach(crit => {
                            notasPorCriterio[crit._id.toString()] = [];
                        });

                        avaliacoesDoProjeto.forEach(aval => {
                            aval.itens.forEach(item => {
                                if (item.nota !== undefined && item.nota !== null && notasPorCriterio[String(item.criterio)]) {
                                    notasPorCriterio[String(item.criterio)].push(item.nota);
                                }
                            });
                        });

                        criteriosOficiaisProjeto.forEach(crit => {
                            const notasDoCriterio = notasPorCriterio[String(crit._id)];
                            if (notasDoCriterio.length > 0) {
                                const mediaCriterio = notasDoCriterio.reduce((sum, current) => sum + current, 0) / notasDoCriterio.length;
                                totalPontuacao += mediaCriterio * crit.peso;
                                totalPesos += crit.peso;
                            }
                        });

                        let mediaGeral = 0;
                        if (totalPesos > 0) {
                            mediaGeral = (totalPontuacao / totalPesos).toFixed(2);
                        }
                        
                        projetosComRanking.push({
                            titulo: projeto.titulo,
                            mediaGeral: parseFloat(mediaGeral), 
                            numAvaliacoes: avaliacoesDoProjeto.length
                        });
                    }
                }
                rankingPorCategoria[categoria.nome || 'Sem Categoria'] = projetosComRanking; 
            }
            dataForTab.rankingProjetosPorCategoria = rankingPorCategoria;

        } else if (activeTab === 'resumo-avaliadores') {
            let resumoAvaliadores = [];
            for (const escola of escolasCadastradas) {
                const avaliadoresDaEscola = await Avaliador.find({ escolaId: escola._id }).lean();
                
                let avaliadoresFormatados = [];
                for (const avaliador of avaliadoresDaEscola) {
                    const numProjetosAtribuidos = avaliador.projetosAtribuidos ? avaliador.projetosAtribuidos.length : 0;
                    
                    let numAvaliacoesCompletas = 0;
                    if (numProjetosAtribuidos > 0) {
                        for (const projetoId of avaliador.projetosAtribuidos) {
                            const avaliacao = await Avaliacao.findOne({ avaliador: avaliador._id, projeto: projetoId }).lean();
                            if (avaliacao && avaliacao.itens.length > 0) {
                                const projetoDetalhes = await Projeto.findById(projetoId).lean();
                                if (projetoDetalhes && projetoDetalhes.feira) {
                                    const criteriosDaFeira = await Criterio.find({ feira: projetoDetalhes.feira, escolaId: escola._id }).lean();
                                    const totalCriteriosFeira = criteriosDaFeira.length;
                                    const criteriosAvaliadosComNota = avaliacao.itens.filter(item => item.nota !== undefined && item.nota !== null && item.nota >= 5 && item.nota <= 10).length;
                                    
                                    if (totalCriteriosFeira > 0 && criteriosAvaliadosComNota === totalCriteriosFeira) {
                                        numAvaliacoesCompletas++;
                                    } else if (totalCriteriosFeira === 0 && avaliacao.itens.length > 0) { 
                                        numAvaliacoesCompletas++;
                                    }
                                }
                            }
                        }
                    }

                    avaliadoresFormatados.push({
                        nome: avaliador.nome,
                        email: avaliador.email,
                        status: avaliador.ativo ? 'Ativo' : 'Inativo',
                        totalAtribuidos: numProjetosAtribuidos,
                        totalAvaliados: numAvaliacoesCompletas
                    });
                }
                resumoAvaliadores.push({
                    escolaNome: escola.nome,
                    avaliadores: avaliadoresFormatados
                });
            }
            dataForTab.resumoAvaliadoresPorEscola = resumoAvaliadores;
        }
        else if (activeTab === 'relatorio-projetos') {
    let projetosPorEscola = [];

    for (const escola of escolasCadastradas) {
        const projetos = await Projeto.find({ escolaId: escola._id }).populate('categoria').lean();

        const categoriasMap = {};
        projetos.forEach(proj => {
            const categoriaNome = proj.categoria?.nome || 'Sem Categoria';
            if (!categoriasMap[categoriaNome]) categoriasMap[categoriaNome] = [];
            categoriasMap[categoriaNome].push({
                titulo: proj.titulo,
                turma: proj.turma,
                premiado: proj.premiado ? 'Sim' : 'Não',
                media: proj.mediaFinal || 'N/A'
            });
        });

        projetosPorEscola.push({
            escolaNome: escola.nome,
            categorias: categoriasMap
        });
    }

    dataForTab.projetosPorEscola = projetosPorEscola;
}

        res.render('superadmin/dashboard', {
            titulo: 'Painel Super Admin', 
            layout: false, 
            activeTab: activeTab,
            error_msg: req.flash('error_msg'),
            success_msg: req.flash('success_msg'),
            ...dataForTab,
            projetosPorEscola: dataForTab.projetosPorEscola
        });

    } catch (err) {
        console.error('Erro ao carregar dashboard do Super Admin:', err);
        if (!res.headersSent) {
            req.flash('error_msg', 'Erro ao carregar o dashboard. Detalhes: ' + err.message);
            res.redirect('/superadmin/login');
        }
    }
});

router.get('/escolas/nova', verificarSuperAdmin, (req, res) => {
    res.render('superadmin/nova-escola', {
        titulo: 'Nova Escola', 
        layout: 'layouts/public', 
        escola: {},
        errors: [],
        error_msg: req.flash('error_msg'),
        success_msg: req.flash('success_msg')
    });
});

router.post('/escolas/nova', verificarSuperAdmin, async (req, res) => {
    const { nome, emailAdmin, senhaAdmin } = req.body;
    let errors = [];

    if (!nome || nome.trim() === '') {
        errors.push({ text: "Nome da escola inválido." });
    }
    if (!emailAdmin || emailAdmin.trim() === '') {
        errors.push({ text: "E-mail do administrador da escola inválido." });
    } else {
        const existingAdmin = await Admin.findOne({ email: emailAdmin });
        if (existingAdmin) {
            errors.push({ text: "Já existe um administrador com este e-mail." });
        }
    }
    if (!senhaAdmin || senhaAdmin.length < 6) {
        errors.push({ text: "A senha do administrador da escola deve ter pelo menos 6 caracteres." });
    }

    if (errors.length > 0) {
        req.flash('error_msg', errors.map(e => e.text).join(', '));
        return res.render('superadmin/nova-escola', {
            titulo: 'Nova Escola', 
            layout: 'layouts/public', 
            escola: { nome, emailAdmin },
            errors: errors,
            error_msg: req.flash('error_msg'),
            success_msg: req.flash('success_msg')
        });
    }

    try {
        const novaEscola = new Escola({
            nome: nome.trim(),
            ativa: true,
            criadaEm: Date.now()
        });
        await novaEscola.save();

        const hashedPasswordAdmin = await hashPassword(senhaAdmin);

        const novoAdmin = new Admin({
            nome: `Admin ${nome.trim()}`,
            email: emailAdmin.trim(),
            senha: hashedPasswordAdmin,
            escolaId: novaEscola._id,
            cargo: 'Administrador Principal',
            telefone: ''
        });
        await novoAdmin.save();

        req.flash('success_msg', 'Escola e administrador inicial criados com sucesso!');
        res.redirect('/superadmin/dashboard?tab=gerenciar-escolas'); 

    } catch (err) {
        console.error('Erro ao adicionar nova escola:', err);
        if (!res.headersSent) {
            if (err.code === 11000 && err.keyPattern && err.keyPattern.nome) {
                req.flash('error_msg', `Erro: Já existe uma escola com o nome "${err.keyValue.nome}". Por favor, use um nome diferente.`);
            } else {
                req.flash('error_msg', 'Erro interno ao adicionar escola. Tente novamente. Detalhes: ' + err.message);
            }
            res.redirect('/superadmin/escolas/nova');
        }
    }
});

router.get('/escolas/:id/editar', verificarSuperAdmin, async (req, res) => {
    try {
        const escola = await Escola.findById(req.params.id).lean();
        if (!escola) {
            req.flash('error_msg', 'Escola não encontrada.');
            return res.redirect('/superadmin/dashboard');
        }

        const admin = await Admin.findOne({ escolaId: escola._id }).lean();
        if (!admin) {
            req.flash('error_msg', 'Administrador principal não encontrado para esta escola. Você pode criar um ao salvar as edições.');
        }

        res.render('superadmin/editar-escola', {
            titulo: 'Editar Escola', 
            escola: escola,
            admin: admin || {},
            layout: 'layouts/public', 
            error_msg: req.flash('error_msg'),
            success_msg: req.flash('success_msg')
        });
    } catch (err) {
        console.error('Erro ao carregar escola para edição:', err);
        if (!res.headersSent) {
            req.flash('error_msg', 'Erro ao carregar escola para edição. Detalhes: ' + err.message);
            res.redirect('/superadmin/dashboard');
        }
    }
});

router.post('/escolas/:id/editar', verificarSuperAdmin, async (req, res) => {
    const { 
        nome, cnpj, endereco, telefone, email, descricao, diretor, responsavel,
        adminNome, adminEmail, adminCargo, adminTelefone,
        novaSenhaAdmin, confirmarSenhaAdmin
    } = req.body;

    let errors = [];

    if (!nome || nome.trim() === '') {
        errors.push('Nome da escola não pode ser vazio.');
    }

    if (!adminNome || adminNome.trim() === '') {
        errors.push('Nome do administrador não pode ser vazio.');
    }
    if (!adminEmail || adminEmail.trim() === '') {
        errors.push('E-mail do administrador não pode ser vazio.');
    } else {
        const existingAdmin = await Admin.findOne({ 
            email: adminEmail.trim(), 
            escolaId: { $ne: req.params.id }
        });
        if (existingAdmin) {
            errors.push('Já existe um administrador com este e-mail.');
        }
    }

    if (novaSenhaAdmin) {
        if (novaSenhaAdmin.length < 6) {
            errors.push('A nova senha do admin deve ter pelo menos 6 caracteres.');
        }
        if (novaSenhaAdmin !== confirmarSenhaAdmin) {
            errors.push('A nova senha e a confirmação de senha do admin não coincidem.');
        }
    }

    if (errors.length > 0) {
        req.flash('error_msg', errors.join(', '));
        const escola = await Escola.findById(req.params.id).lean();
        const admin = await Admin.findOne({ escolaId: req.params.id }).lean();
        return res.render('superadmin/editar-escola', {
            titulo: 'Editar Escola', 
            escola: escola,
            admin: admin || {},
            layout: 'layouts/public', 
            error_msg: req.flash('error_msg'),
            success_msg: req.flash('success_msg')
        });
    }

    try {
        const updatedEscola = await Escola.findByIdAndUpdate(
            req.params.id,
            { 
                nome: nome.trim(), 
                cnpj: cnpj || null,
                endereco: endereco || null,
                telefone: telefone || null,
                email: email || null,
                descricao: descricao || null,
                diretor: diretor || null,
                responsavel: responsavel || null
            },
            { new: true, runValidators: true }
        );

        if (!updatedEscola) {
            req.flash('error_msg', 'Escola não encontrada ou erro na atualização.');
            return res.redirect('/superadmin/dashboard');
        }

        let adminEscola = await Admin.findOne({ escolaId: req.params.id });

        if (!adminEscola) {
            const hashedPassword = novaSenhaAdmin ? await hashPassword(novaSenhaAdmin) : await hashPassword(generateTemporaryPassword());
            adminEscola = new Admin({
                nome: adminNome.trim(),
                email: adminEmail.trim(),
                senha: hashedPassword,
                escolaId: req.params.id,
                cargo: adminCargo || null,
                telefone: adminTelefone || null
            });
            await adminEscola.save();
            req.flash('success_msg', `Escola atualizada e novo administrador principal (${adminEmail.trim()}) criado com sucesso!`);
            if (!novaSenhaAdmin) {
                 req.flash('success_msg', req.flash('success_msg') + ` Uma senha temporária foi gerada e deverá ser comunicada.`);
            }
        } else {
            adminEscola.nome = adminNome.trim();
            adminEscola.email = adminEmail.trim();
            adminEscola.cargo = adminCargo || null;
            adminEscola.telefone = adminTelefone || null;

            if (novaSenhaAdmin) {
                adminEscola.senha = await hashPassword(novaSenhaAdmin);
            }
            await adminEscola.save();
            req.flash('success_msg', 'Escola e administrador atualizados com sucesso!');
        }
        
        res.redirect('/superadmin/dashboard?tab=gerenciar-escolas'); 

    } catch (err) {
        console.error('Erro ao atualizar escola ou admin:', err);
        if (!res.headersSent) {
            let errorMessages = [];
            if (err.name === 'ValidationError') {
                for (let field in err.errors) {
                    errorMessages.push(err.errors[field].message);
                }
            } else if (err.code === 11000) {
                const fieldName = Object.keys(err.keyPattern)[0];
                const fieldValue = err.keyValue[fieldName];
                errorMessages.push(`O valor "${fieldValue}" para o campo "${fieldName}" já existe. Por favor, insira um valor único.`);
            } else {
                errorMessages.push('Erro interno ao atualizar escola. Verifique os dados. Detalhes: ' + err.message);
            }
            req.flash('error_msg', errorMessages.join(', '));
            res.redirect(`/superadmin/escolas/${req.params.id}/editar`);
        }
    }
});

router.get('/escolas/:id/inativar', verificarSuperAdmin, async (req, res) => {
    try {
        const escola = await Escola.findByIdAndUpdate(req.params.id, { ativa: false }, { new: true });
        if (!escola) {
            req.flash('error_msg', 'Escola não encontrada.');
            return res.redirect('/superadmin/dashboard?tab=gerenciar-escolas');
        }
        req.flash('success_msg', `Escola "${escola.nome}" inativada com sucesso!`);
        res.redirect('/superadmin/dashboard?tab=gerenciar-escolas');
    } catch (err) {
        console.error('Erro ao inativar escola:', err);
        if (!res.headersSent) {
            req.flash('error_msg', 'Erro ao inativar escola. Detalhes: ' + err.message);
            res.redirect('/superadmin/dashboard?tab=gerenciar-escolas');
        }
    }
});

router.get('/escolas/:id/ativar', verificarSuperAdmin, async (req, res) => {
    try {
        const escola = await Escola.findByIdAndUpdate(req.params.id, { ativa: true }, { new: true });
        if (!escola) {
            req.flash('error_msg', 'Escola não encontrada.');
            return res.redirect('/superadmin/dashboard?tab=gerenciar-escolas');
        }
        req.flash('success_msg', `Escola "${escola.nome}" ativada com sucesso!`);
        res.redirect('/superadmin/dashboard?tab=gerenciar-escolas');
    } catch (err) {
        console.error('Erro ao ativar escola:', err);
        if (!res.headersSent) {
            req.flash('error_msg', 'Erro ao ativar escola. Detalhes: ' + err.message);
            res.redirect('/superadmin/dashboard?tab=gerenciar-escolas');
        }
    }
});

router.post('/escolas/:escolaId/reset-admin-password', verificarSuperAdmin, async (req, res) => {
    const { escolaId } = req.params;

    if (!escolaId || !mongoose.Types.ObjectId.isValid(escolaId)) {
        req.flash('error_msg', 'ID da escola inválido para redefinição de senha do admin.');
        return res.redirect('/superadmin/dashboard?tab=gerenciar-escolas');
    }

    try {
        const escola = await Escola.findById(escolaId);
        if (!escola) {
            req.flash('error_msg', 'Escola não encontrada.');
            return res.redirect('/superadmin/dashboard?tab=gerenciar-escolas');
        }

        const adminEscola = await Admin.findOne({ escolaId: escolaId });
        if (!adminEscola) {
            req.flash('error_msg', 'Nenhum administrador encontrado para esta escola.');
            return res.redirect('/superadmin/dashboard?tab=gerenciar-escolas');
        }

        const novaSenhaProvisoria = generateTemporaryPassword();
        const senhaHasheada = await hashPassword(novaSenhaProvisoria);

        adminEscola.senha = senhaHasheada;
        await adminEscola.save();

        const appUrl = process.env.APP_URL || 'http://localhost:3000';
        const emailSent = await sendAdminTemporaryPasswordEmail(adminEscola, novaSenhaProvisoria, appUrl);

        let successMessage = `Senha do admin da escola "${escola.nome}" redefinida com sucesso! A nova senha provisória para <strong>${adminEscola.email}</strong> é: <strong>${novaSenhaProvisoria}</strong>.`;
        if (!emailSent) {
            successMessage += ' <em>(Não foi possível enviar o e-mail de notificação. Verifique as configurações de e-mail.)</em>';
        }
        
        req.flash('success_msg', successMessage);
        res.redirect('/superadmin/dashboard?tab=gerenciar-escolas');

    } catch (err) {
        console.error('Erro ao redefinir senha do admin da escola:', err);
        if (!res.headersSent) {
            req.flash('error_msg', 'Erro ao redefinir senha do admin da escola. Detalhes: ' + err.message);
            res.redirect('/superadmin/dashboard?tab=gerenciar-escolas');
        }
    }
});


// ========================================================================
// ROTAS PARA GERENCIAR SOLICITAÇÕES DE ACESSO
// ========================================================================

router.get('/solicitacoes', verificarSuperAdmin, async (req, res) => {
    try {
        const solicitacoes = await SolicitacaoAcesso.find({ status: 'Pendente' }).sort({ dataSolicitacao: 'asc' }).lean();

        res.render('superadmin/solicitacoes', {
            titulo: 'Gerenciar Solicitações de Acesso', 
            layout: 'layouts/public', 
            solicitacoes: solicitacoes,
            error_msg: req.flash('error_msg'),
            success_msg: req.flash('success_msg')
        });
    } catch (err) {
        console.error('Erro ao buscar solicitações de acesso:', err);
        if (!res.headersSent) {
            req.flash('error_msg', 'Erro ao carregar as solicitações de acesso. Detalhes: ' + err.message);
            res.redirect('/superadmin/dashboard?tab=solicitacoes'); 
        }
    }
});

router.get('/solicitacoes/:id/editar', verificarSuperAdmin, async (req, res) => {
    try {
        const solicitacao = await SolicitacaoAcesso.findById(req.params.id).lean();
        if (!solicitacao) {
            req.flash('error_msg', 'Solicitação de acesso não encontrada.');
            return res.redirect('/superadmin/solicitacoes');
        }

        res.render('superadmin/editar_solicitacao', {
            solicitacao,
            titulo: 'Detalhes da Solicitação', 
            layout: 'layouts/public', 
            error_msg: req.flash('error_msg'),
            success_msg: req.flash('success_msg')
        });
    } catch (err) {
        console.error('Erro ao buscar solicitação para edição:', err);
        if (!res.headersSent) {
            req.flash('error_msg', 'Erro ao carregar detalhes da solicitação. Detalhes: ' + err.message);
            res.redirect('/superadmin/solicitacoes');
        }
    }
});

router.post('/solicitacoes/:id/atualizar', verificarSuperAdmin, async (req, res) => {
    try {
        const { nomeEscola, cnpj, endereco, telefoneEscola, nomeResponsavel, cargoResponsavel, emailContato, telefoneContato } = req.body;

        await SolicitacaoAcesso.findByIdAndUpdate(req.params.id, {
            nomeEscola,
            cnpj,
            endereco,
            telefoneEscola,
            nomeResponsavel,
            cargoResponsavel,
            emailContato,
            telefoneContato
        }, { new: true, runValidators: true });

        req.flash('success_msg', 'Dados da solicitação atualizados com sucesso!');
        res.redirect('/superadmin/solicitacoes/' + req.params.id + '/editar');
    } catch (err) {
        console.error('Erro ao atualizar solicitação:', err);
        if (!res.headersSent) {
            if (err.name === 'ValidationError') {
                let errors = Object.values(err.errors).map(el => el.message);
                req.flash('error_msg', errors.join(', '));
            } else if (err.code === 11000) {
                req.flash('error_msg', 'Erro: Dados duplicados (e-mail ou CNPJ) já cadastrados. Por favor, verifique.');
            } else {
                req.flash('error_msg', 'Erro ao atualizar a solicitação. Tente novamente. Detalhes: ' + err.message);
            }
            res.redirect('/superadmin/solicitacoes/' + req.params.id + '/editar');
        }
    }
});


router.post('/solicitacoes/:id/aprovar', verificarSuperAdmin, async (req, res) => {
    try {
        const solicitacao = await SolicitacaoAcesso.findById(req.params.id);

        if (!solicitacao) {
            req.flash('error_msg', 'Solicitação não encontrada.');
            return res.redirect('/superadmin/solicitacoes');
        }

        if (solicitacao.status !== 'Pendente') {
            req.flash('error_msg', 'Esta solicitação já foi processada.');
            return res.redirect('/superadmin/solicitacoes');
        }

        const novaEscola = new Escola({
            nome: solicitacao.nomeEscola,
            cnpj: solicitacao.cnpj,
            endereco: solicitacao.endereco,
            telefone: solicitacao.telefoneEscola,
        });
        await novaEscola.save();

        const senhaProvisoria = generateTemporaryPassword();
        const senhaHasheada = await hashPassword(senhaProvisoria);

        const novoAdmin = new Admin({
            nome: solicitacao.nomeResponsavel,
            email: solicitacao.emailContato,
            senha: senhaHasheada,
            escolaId: novaEscola._id,
            cargo: solicitacao.cargoResponsavel,
            telefone: solicitacao.telefoneContato,
        });
        await novoAdmin.save();

        solicitacao.status = 'Aprovada';
        solicitacao.dataProcessamento = Date.now();
        solicitacao.processadoPor = req.session.superAdminId;
        await solicitacao.save();

        console.log(`Solicitação APROVADA: Senha Provisória para ${solicitacao.emailContato}: ${senhaProvisoria}`);
        req.flash('success_msg', `Solicitação de acesso aprovada com sucesso! Uma escola (${novaEscola.nome}) e um administrador foram criados. A senha provisória do administrador (${solicitacao.emailContato}) é: <strong>${senhaProvisoria}</strong>. NOTA: Em produção, essa senha seria enviada por e-mail ou o usuário seria instruído a redefinir.`);

        const appUrl = process.env.APP_URL || 'http://localhost:3000';
        const mailOptionsAprovacao = {
            from: process.env.EMAIL_USER,
            to: solicitacao.emailContato,
            subject: 'Sua Solicitação de Acesso ao AvaliaFeiras foi Aprovada!',
            html: `
                <p>Olá, ${solicitacao.nomeResponsavel},</p>
                <p>Sua solicitação de acesso para a escola <strong>${solicitacao.nomeEscola}</strong> no sistema AvaliaFeiras foi aprovada!</p>
                <p>Você pode acessar sua conta de administrador usando as seguintes credenciais:</p>
                <p><strong>E-mail:</strong> ${solicitacao.emailContato}</p>
                <p><strong>Senha Provisória:</strong> ${senhaProvisoria}</p>
                <p>Recomendamos que você altere sua senha no primeiro login para garantir a segurança da sua conta.</p>
                <p>Clique aqui para fazer login: <a href="${appUrl}/admin/login">${appUrl}/admin/login</a></p>
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
        
        res.redirect('/superadmin/solicitacoes');

    } catch (err) {
        console.error('Erro ao aprovar solicitação:', err);
        if (!res.headersSent) {
            if (err.code === 11000) {
                let errorMessage = 'Erro: E-mail ou CNPJ já cadastrado para outra escola/administrador.';
                if (err.keyPattern && err.keyPattern.nome) {
                    errorMessage = `Erro: Já existe uma escola com o nome "${err.keyValue.nome}". Por favor, use um nome diferente para a escola na solicitação.`;
                }
                req.flash('error_msg', errorMessage);
            } else if (err.name === 'ValidationError') {
                let errors = Object.values(err.errors).map(el => el.message);
                req.flash('error_msg', 'Erro de validação: ' + errors.join(', '));
            } else {
                req.flash('error_msg', 'Erro ao aprovar solicitação: ' + err.message);
            }
            res.redirect('/superadmin/solicitacoes');
        }
    }
});

router.post('/solicitacoes/:id/rejeitar', verificarSuperAdmin, async (req, res) => {
    try {
        const solicitacao = await SolicitacaoAcesso.findById(req.params.id);

        if (!solicitacao) {
            req.flash('error_msg', 'Solicitação não encontrada.');
            return res.redirect('/superadmin/solicitacoes');
        }
        if (solicitacao.status !== 'Pendente') {
            req.flash('error_msg', 'Esta solicitação já foi processada.');
            return res.redirect('/superadmin/solicitacoes');
        }

        solicitacao.status = 'Rejeitada';
        solicitacao.dataProcessamento = Date.now();
        solicitacao.processadoPor = req.session.superAdminId;
        await solicitacao.save();

        const appUrl = process.env.APP_URL || 'http://localhost:3000';
        const mailOptionsRejeicao = {
            from: process.env.EMAIL_USER,
            to: solicitacao.emailContato,
            subject: 'Sua Solicitação de Acesso ao AvaliaFeiras foi Rejeitada',
            html: `
                <p>Olá, ${solicitacao.nomeResponsavel},</p>
                <p>Informamos que sua solicitação de cadastro para a escola <strong>${solicitacao.nomeEscola}</strong> no sistema AvaliaFeiras foi revisada e, infelizmente, não pôde ser aprovada neste momento.</p>
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
        res.redirect('/superadmin/solicitacoes');

    } catch (err) {
        console.error('Erro ao rejeitar solicitação:', err);
        if (!res.headersSent) {
            req.flash('error_msg', `Erro ao rejeitar a solicitação: ${err.message || 'Ocorreu um erro inesperado.'}`);
            res.redirect('/superadmin/solicitacoes');
        }
    }
});


module.exports = router;
