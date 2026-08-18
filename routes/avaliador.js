// routes/avaliador.js

const express = require('express');
const router = express.Router();

const mongoose = require('mongoose');

const Avaliador = require('../models/Avaliador');
const Projeto = require('../models/Projeto');
const Avaliacao = require('../models/Avaliacao');
const Criterio = require('../models/Criterio');
const Feira = require('../models/Feira');
const Escola = require('../models/Escola');
const Feedback = require('../models/Feedback');

const QRCode = require('qrcode');


// ============================================================
// MIDDLEWARE - VERIFICAR AVALIADOR
// ============================================================

async function verificarAvaliador(req, res, next) {
    try {
        if (res.headersSent) {
            console.warn('Headers já enviados em verificarAvaliador, abortando.');
            return;
        }

        if (!req.session || !req.session.avaliador) {
            req.flash('error_msg', 'Acesso não autorizado. Informe seu PIN.');
            return res.redirect('/avaliador/login');
        }

        const avaliador = await Avaliador.findById(
            req.session.avaliador.id
        );

        if (!avaliador || !avaliador.ativo) {
            req.flash(
                'error_msg',
                'Acesso não autorizado. Informe seu PIN.'
            );

            return res.redirect('/avaliador/login');
        }

        // Mantém o avaliador completo disponível nas rotas
        res.locals.avaliador = avaliador;

        next();

    } catch (err) {
        console.error('Erro no middleware verificarAvaliador:', err);

        if (!res.headersSent) {
            req.flash(
                'error_msg',
                'Erro ao verificar acesso do avaliador.'
            );

            return res.redirect('/avaliador/login');
        }
    }
}


// ============================================================
// LOGIN
// ============================================================

router.get('/login', (req, res) => {
    res.render('avaliador/login', {
        titulo: 'Login do Avaliador',
        layout: 'layouts/public',
        error_msg: req.flash('error_msg'),
        success_msg: req.flash('success_msg')
    });
});


// ============================================================
// VALIDAR PIN
// ============================================================

router.post('/login', async (req, res) => {
    const { pin } = req.body;

    try {
        const avaliador = await Avaliador.findOne({
            pin,
            ativo: true
        }).populate('projetosAtribuidos');

        if (!avaliador) {
            req.flash(
                'error_msg',
                'PIN inválido ou avaliador inativo.'
            );

            return res.redirect('/avaliador/login');
        }

        if (!avaliador.escolaId || !avaliador.feira) {
            req.flash(
                'error_msg',
                'O cadastro do avaliador está incompleto. Escola ou feira não identificada.'
            );

            return res.redirect('/avaliador/login');
        }

        req.session.avaliador = {
            id: avaliador._id.toString(),
            nome: avaliador.nome,
            escolaId: avaliador.escolaId.toString(),
            feira: avaliador.feira.toString()
        };

        req.flash(
            'success_msg',
            'Login realizado com sucesso!'
        );

        return res.redirect('/avaliador/dashboard');

    } catch (err) {
        console.error('Erro no login do avaliador:', err);

        if (!res.headersSent) {
            req.flash(
                'error_msg',
                'Erro ao tentar autenticar. Detalhes: ' + err.message
            );

            return res.redirect('/avaliador/login');
        }
    }
});


// ============================================================
// DASHBOARD DO AVALIADOR
// ============================================================
// IMPORTANTE:
// O dashboard NÃO utiliza mais todos os critérios da feira.
// O status de cada projeto é calculado somente pelos critérios
// existentes em projeto.criterios.
// ============================================================

router.get('/dashboard', verificarAvaliador, async (req, res) => {
    if (res.headersSent) {
        return;
    }
    try {
        const avaliadorData = res.locals.avaliador;
        const escolaDoAvaliador = await Escola.findById(
    avaliadorData.escolaId
).lean();

const feiraDoAvaliador = await Feira.findById(
    avaliadorData.feira
).lean();

        // Buscar somente os projetos atribuídos ao avaliador
        await avaliadorData.populate({
            path: 'projetosAtribuidos'
        });
        const projetosComStatus = await Promise.all(
            avaliadorData.projetosAtribuidos.map(async (projeto) => {

                // ------------------------------------------------
                // CRITÉRIOS DO PRÓPRIO PROJETO
                // ------------------------------------------------
                const criteriosDoProjeto = Array.isArray(projeto.criterios)
                    ? projeto.criterios
                    : [];
                const totalCriteriosProjeto = criteriosDoProjeto.length;

                // ------------------------------------------------
                // BUSCAR AVALIAÇÃO DESTE AVALIADOR PARA ESTE PROJETO
                // ------------------------------------------------
                const avaliacao = await Avaliacao.findOne({
                    avaliador: avaliadorData._id,
                    projeto: projeto._id,
                    feira: projeto.feira,
                    escolaId: projeto.escolaId
                }).lean();
                let criteriosAvaliados = 0;
                if (avaliacao && Array.isArray(avaliacao.itens)) {
                    criteriosAvaliados = avaliacao.itens.filter(item => {
                        const criterioId = String(item.criterio);
                        const pertenceAoProjeto =
                            criteriosDoProjeto.some(
                                criterio =>
                                    String(criterio) === criterioId
                            );
                        const possuiNota =
                            item.nota !== undefined &&
                            item.nota !== null &&
                            item.nota >= 5 &&
                            item.nota <= 10;
                        return pertenceAoProjeto && possuiNota;
                    }).length;
                }

                // ------------------------------------------------
                // STATUS
                // ------------------------------------------------
                let statusAvaliacao = 'Pendente';
                let corStatus = 'text-yellow-600';
                // Projeto sem critérios:
                // não deveria normalmente acontecer, mas tratamos
                // de maneira segura.
                if (totalCriteriosProjeto === 0) {
                    if (avaliacao) {
                        statusAvaliacao = 'Avaliado';
                        corStatus = 'text-green-600';
                    }
                } else if (
                    criteriosAvaliados === totalCriteriosProjeto
                ) {
                    statusAvaliacao = 'Avaliado';
                    corStatus = 'text-green-600';
                } else if (criteriosAvaliados > 0) {
                    statusAvaliacao = 'Em Processo';
                    corStatus = 'text-orange-600';
                }
                return {
                    ...projeto.toObject(),

                    // Informações úteis para a view
                    totalCriterios: totalCriteriosProjeto,
                    criteriosAvaliados,
                    statusAvaliacao,
                    corStatus,
                    avaliadoPorAvaliador:
                        statusAvaliacao === 'Avaliado'
                };
            })
        );

        const todosProjetosAvaliados =
            projetosComStatus.length > 0 &&
            projetosComStatus.every(
                projeto =>
                    projeto.statusAvaliacao === 'Avaliado'
            );
        res.render('avaliador/dashboard', {
            escola: escolaDoAvaliador,
            feira: feiraDoAvaliador,
            titulo: 'Meus Projetos',
            projetos: projetosComStatus,
            avaliador: avaliadorData,
            todosProjetosAvaliados,
            layout: 'layouts/public',
            error_msg: req.flash('error_msg'),
            success_msg: req.flash('success_msg')
        });
    } catch (err) {
        console.error(
            'Erro ao carregar projetos do avaliador:',
            err
        );
        if (!res.headersSent) {
            req.flash(
                'error_msg',
                'Erro ao carregar seus projetos. Detalhes: ' +
                err.message
            );
            return res.redirect('/avaliador/login');
        }
    }
});

// ============================================================
// TELA DE AVALIAÇÃO DO PROJETO
// ============================================================
// IMPORTANTE:
// Aqui está a principal correção.
// Os critérios vêm de projeto.criterios.
// ============================================================
router.get(
    '/avaliar/:projetoId',
    verificarAvaliador,
    async (req, res) => {
        if (res.headersSent) {
            return;
        }
        try {
            const { projetoId } = req.params;
            const avaliadorData = res.locals.avaliador;
            if (!mongoose.Types.ObjectId.isValid(projetoId)) {
                req.flash(
                    'error_msg',
                    'ID do projeto inválido.'
                );
                return res.redirect('/avaliador/dashboard');
            }

            // ------------------------------------------------
            // BUSCAR PROJETO
            // ------------------------------------------------
            const projeto = await Projeto.findById(projetoId)
                .lean();
            if (!projeto) {
                req.flash(
                    'error_msg',
                    'Projeto não encontrado.'
                );
                return res.redirect('/avaliador/dashboard');
            }

            // ------------------------------------------------
            // VALIDAR ESCOLA
            // ------------------------------------------------
            if (
                String(projeto.escolaId) !==
                String(avaliadorData.escolaId)
            ) {
                req.flash(
                    'error_msg',
                    'Este projeto não pertence à sua escola.'
                );
                return res.redirect('/avaliador/dashboard');
            }

            // ------------------------------------------------
            // VALIDAR FEIRA
            // ------------------------------------------------
            if (
                String(projeto.feira) !==
                String(avaliadorData.feira)
            ) {
                req.flash(
                    'error_msg',
                    'Este projeto não pertence à feira do avaliador.'
                );
                return res.redirect('/avaliador/dashboard');
            }

            // ------------------------------------------------
            // VALIDAR SE O PROJETO ESTÁ ATRIBUÍDO AO AVALIADOR
            // ------------------------------------------------
            const avaliadorAtualizado =
                await Avaliador.findById(
                    avaliadorData._id
                ).lean();

            const projetoAtribuido =
                avaliadorAtualizado &&
                Array.isArray(
                    avaliadorAtualizado.projetosAtribuidos
                ) &&
                avaliadorAtualizado.projetosAtribuidos.some(
                    id => String(id) === String(projeto._id)
                );

            if (!projetoAtribuido) {

                req.flash(
                    'error_msg',
                    'Este projeto não está atribuído a você.'
                );

                return res.redirect('/avaliador/dashboard');
            }

            // ------------------------------------------------
            // PEGAR SOMENTE OS IDs DOS CRITÉRIOS DO PROJETO
            // ------------------------------------------------

            const criteriosDoProjeto = Array.isArray(
                projeto.criterios
            )
                ? projeto.criterios
                : [];

            // ------------------------------------------------
            // BUSCAR SOMENTE OS CRITÉRIOS DO PROJETO
            // ------------------------------------------------

            let criterios = [];

            if (criteriosDoProjeto.length > 0) {

                criterios = await Criterio.find({
                    _id: {
                        $in: criteriosDoProjeto
                    },

                    // Segurança adicional
                    feira: projeto.feira,
                    escolaId: projeto.escolaId

                })
                    .sort({ ordemDesempate: 1, nome: 1 })
                    .lean();
            }

            // ------------------------------------------------
            // AVALIAÇÃO EXISTENTE
            // ------------------------------------------------

            const avaliacaoExistente =
                await Avaliacao.findOne({
                    avaliador: avaliadorData._id,
                    projeto: projetoId,
                    feira: projeto.feira,
                    escolaId: projeto.escolaId
                }).populate('itens.criterio');

            // ------------------------------------------------
            // RENDER
            // ------------------------------------------------

            res.render('avaliador/avaliar_projeto', {

                titulo: `Avaliar: ${projeto.titulo}`,

                projeto,

                criterios,

                avaliador: avaliadorData,

                avaliacaoExistente,

                layout: 'layouts/public',

                error_msg: req.flash('error_msg'),

                success_msg: req.flash('success_msg')
            });

        } catch (err) {

            console.error(
                'Erro ao carregar página de avaliação:',
                err
            );

            if (!res.headersSent) {

                req.flash(
                    'error_msg',
                    'Erro ao carregar a página de avaliação do projeto. Detalhes: ' +
                    err.message
                );

                return res.redirect('/avaliador/dashboard');
            }
        }
    }
);


// ============================================================
// SALVAR AVALIAÇÃO
// ============================================================
// IMPORTANTE:
// Somente critérios presentes em projeto.criterios podem ser
// avaliados e salvos.
// ============================================================

router.post(
    '/avaliar/:projetoId',
    verificarAvaliador,
    async (req, res) => {

        const { projetoId } = req.params;

        try {

            const avaliadorData = res.locals.avaliador;

            const {
                criterios: criteriosRecebidos
            } = req.body;

            // ------------------------------------------------
            // VERIFICAR SE O AVALIADOR JÁ FINALIZOU
            // ------------------------------------------------

            if (avaliadorData.statusAvaliacaoGeral) {

                req.flash(
                    'error_msg',
                    'Suas avaliações já foram finalizadas. Não é possível editar.'
                );

                return res.redirect(
                    '/avaliador/dashboard'
                );
            }

            // ------------------------------------------------
            // BUSCAR PROJETO
            // ------------------------------------------------

            const projeto = await Projeto.findById(projetoId)
                .lean();

            if (!projeto) {

                req.flash(
                    'error_msg',
                    'Projeto não encontrado.'
                );

                return res.redirect('/avaliador/dashboard');
            }

            // ------------------------------------------------
            // VALIDAR ESCOLA
            // ------------------------------------------------

            if (
                String(projeto.escolaId) !==
                String(avaliadorData.escolaId)
            ) {

                req.flash(
                    'error_msg',
                    'Este projeto não pertence à sua escola.'
                );

                return res.redirect('/avaliador/dashboard');
            }

            // ------------------------------------------------
            // VALIDAR FEIRA
            // ------------------------------------------------

            if (
                String(projeto.feira) !==
                String(avaliadorData.feira)
            ) {

                req.flash(
                    'error_msg',
                    'Este projeto não pertence à feira do avaliador.'
                );

                return res.redirect('/avaliador/dashboard');
            }

            // ------------------------------------------------
            // VALIDAR ATRIBUIÇÃO
            // ------------------------------------------------

            const avaliadorCompleto =
                await Avaliador.findById(
                    avaliadorData._id
                ).lean();

            const projetoAtribuido =
                avaliadorCompleto &&
                Array.isArray(
                    avaliadorCompleto.projetosAtribuidos
                ) &&
                avaliadorCompleto.projetosAtribuidos.some(
                    id => String(id) === String(projeto._id)
                );

            if (!projetoAtribuido) {

                req.flash(
                    'error_msg',
                    'Este projeto não está atribuído a você.'
                );

                return res.redirect('/avaliador/dashboard');
            }

            // ------------------------------------------------
            // CRITÉRIOS DO PROJETO
            // ------------------------------------------------

            const criteriosDoProjeto =
                Array.isArray(projeto.criterios)
                    ? projeto.criterios
                    : [];

            const criteriosDoProjetoIds =
                new Set(
                    criteriosDoProjeto.map(
                        id => String(id)
                    )
                );

            // ------------------------------------------------
            // BUSCAR AVALIAÇÃO EXISTENTE
            // ------------------------------------------------

            let avaliacaoExistente =
                await Avaliacao.findOne({
                    avaliador: avaliadorData._id,
                    projeto: projetoId,
                    feira: projeto.feira,
                    escolaId: projeto.escolaId
                });

            // ------------------------------------------------
            // CRIAR NOVA AVALIAÇÃO
            // ------------------------------------------------

            if (!avaliacaoExistente) {

                avaliacaoExistente =
                    new Avaliacao({

                        avaliador:
                            avaliadorData._id,

                        projeto:
                            projetoId,

                        feira:
                            projeto.feira,

                        escolaId:
                            projeto.escolaId,

                        itens: []
                    });
            }

            // ------------------------------------------------
            // MANTER SOMENTE ITENS DE CRITÉRIOS DO PROJETO
            // ------------------------------------------------

            let novosItensAvaliacao =
                Array.isArray(avaliacaoExistente.itens)
                    ? avaliacaoExistente.itens
                        .filter(item =>
                            criteriosDoProjetoIds.has(
                                String(item.criterio)
                            )
                        )
                        .map(item => ({
                            ...item.toObject()
                        }))
                    : [];

            const novosItensMap =
                new Map(
                    novosItensAvaliacao.map(
                        item => [
                            String(item.criterio),
                            item
                        ]
                    )
                );

            // ------------------------------------------------
            // NORMALIZAR BODY
            // ------------------------------------------------

            const dadosRecebidos =
                criteriosRecebidos &&
                typeof criteriosRecebidos === 'object'
                    ? criteriosRecebidos
                    : {};

            // ------------------------------------------------
            // PROCESSAR SOMENTE CRITÉRIOS DO PROJETO
            // ------------------------------------------------

            for (
                const criterioId
                of criteriosDoProjetoIds
            ) {

                const dados =
                    dadosRecebidos[criterioId];

                // Se o formulário não enviou este critério,
                // simplesmente não altera nada.
                if (!dados) {
                    continue;
                }

                const nota =
                    dados.nota;

                const comentario =
                    dados.comentario || '';

                // ------------------------------------------------
                // NOTA VAZIA
                // ------------------------------------------------

                if (
                    nota === undefined ||
                    nota === null ||
                    nota === ''
                ) {

                    const itemExistente =
                        novosItensMap.get(criterioId);

                    if (itemExistente) {
                        itemExistente.comentario =
                            comentario;
                    }

                    continue;
                }

                // ------------------------------------------------
                // VALIDAR NOTA
                // ------------------------------------------------

                const notaNum =
                    parseInt(nota, 10);

                if (
                    isNaN(notaNum) ||
                    notaNum < 5 ||
                    notaNum > 10
                ) {

                    const criterio =
                        await Criterio.findById(
                            criterioId
                        ).lean();

                    req.flash(
                        'error_msg',
                        `Nota inválida para o critério "${criterio?.nome || 'selecionado'}". As notas devem ser entre 5 e 10.`
                    );

                    return res.redirect(
                        `/avaliador/avaliar/${projetoId}`
                    );
                }

                // ------------------------------------------------
                // ATUALIZAR ITEM EXISTENTE
                // ------------------------------------------------

                const itemExistente =
                    novosItensMap.get(criterioId);

                if (itemExistente) {

                    itemExistente.nota =
                        notaNum;

                    itemExistente.comentario =
                        comentario;

                } else {

                    // ------------------------------------------------
                    // CRIAR NOVO ITEM
                    // ------------------------------------------------

                    const novoItem = {

                        criterio:
                            criterioId,

                        nota:
                            notaNum,

                        comentario
                    };

                    novosItensAvaliacao.push(
                        novoItem
                    );

                    novosItensMap.set(
                        criterioId,
                        novoItem
                    );
                }
            }

            // ------------------------------------------------
            // SEGURANÇA EXTRA:
            // NÃO PERMITIR CRITÉRIOS QUE NÃO PERTENCEM AO PROJETO
            // ------------------------------------------------

            novosItensAvaliacao =
                novosItensAvaliacao.filter(
                    item =>
                        criteriosDoProjetoIds.has(
                            String(item.criterio)
                        )
                );

            avaliacaoExistente.itens =
                novosItensAvaliacao;

            // ------------------------------------------------
            // MARCAR COMO INICIADA
            // ------------------------------------------------

            avaliacaoExistente.finalizadaPorAvaliador =
                avaliacaoExistente.itens.some(
                    item =>
                        item.nota !== undefined &&
                        item.nota !== null
                );

            await avaliacaoExistente.save();

            req.flash(
                'success_msg',
                'Avaliação salva com sucesso!'
            );

            return res.redirect(
                '/avaliador/dashboard'
            );

        } catch (err) {

            console.error(
                'Erro ao salvar avaliação do projeto:',
                err
            );

            if (!res.headersSent) {

                if (err.name === 'ValidationError') {

                    const messages =
                        Object.values(err.errors)
                            .map(val => val.message);

                    req.flash(
                        'error_msg',
                        messages.join(', ')
                    );

                } else {

                    req.flash(
                        'error_msg',
                        'Erro ao salvar a avaliação. Detalhes: ' +
                        err.message
                    );
                }

                return res.redirect(
                    `/avaliador/avaliar/${projetoId}`
                );
            }
        }
    }
);


// ============================================================
// FINALIZAR TODAS AS AVALIAÇÕES
// ============================================================
// Cada projeto possui seus próprios critérios.
// Não usamos mais o total de critérios da feira.
// ============================================================

router.post(
    '/finalizar-avaliacoes',
    verificarAvaliador,
    async (req, res) => {

        try {

            const avaliadorData =
                res.locals.avaliador;

            // ------------------------------------------------
            // VERIFICAR SE JÁ FINALIZOU
            // ------------------------------------------------

            if (
                avaliadorData.statusAvaliacaoGeral
            ) {

                req.flash(
                    'error_msg',
                    'Suas avaliações já foram finalizadas.'
                );

                return res.redirect(
                    '/avaliador/dashboard'
                );
            }

            // ------------------------------------------------
            // BUSCAR PROJETOS ATRIBUÍDOS
            // ------------------------------------------------

            const avaliadorCompleto =
                await Avaliador.findById(
                    avaliadorData._id
                ).populate('projetosAtribuidos');

            if (!avaliadorCompleto) {

                req.flash(
                    'error_msg',
                    'Avaliador não encontrado.'
                );

                return res.redirect(
                    '/avaliador/login'
                );
            }

            const projetosAtribuidos =
                avaliadorCompleto.projetosAtribuidos || [];

            // ------------------------------------------------
            // VERIFICAR CADA PROJETO INDIVIDUALMENTE
            // ------------------------------------------------

            const projetosNaoCompletos = [];

            for (
                const projeto
                of projetosAtribuidos
            ) {

                // ------------------------------------------------
                // CRITÉRIOS DESTE PROJETO
                // ------------------------------------------------

                const criteriosDoProjeto =
                    Array.isArray(projeto.criterios)
                        ? projeto.criterios.map(
                            id => String(id)
                        )
                        : [];

                const totalCriteriosProjeto =
                    criteriosDoProjeto.length;

                // ------------------------------------------------
                // BUSCAR AVALIAÇÃO DESTE PROJETO
                // ------------------------------------------------

                const avaliacao =
                    await Avaliacao.findOne({

                        avaliador:
                            avaliadorData._id,

                        projeto:
                            projeto._id,

                        feira:
                            projeto.feira,

                        escolaId:
                            projeto.escolaId
                    }).lean();

                // ------------------------------------------------
                // PROJETO SEM CRITÉRIOS
                // ------------------------------------------------

                if (
                    totalCriteriosProjeto === 0
                ) {

                    if (!avaliacao) {

                        projetosNaoCompletos.push(
                            projeto
                        );
                    }

                    continue;
                }

                // ------------------------------------------------
                // CONTAR SOMENTE CRITÉRIOS DESTE PROJETO
                // ------------------------------------------------

                const criteriosAvaliados =
                    avaliacao &&
                    Array.isArray(avaliacao.itens)

                        ? avaliacao.itens.filter(
                            item => {

                                const criterioId =
                                    String(
                                        item.criterio
                                    );

                                return (
                                    criteriosDoProjeto.includes(
                                        criterioId
                                    ) &&
                                    item.nota !== undefined &&
                                    item.nota !== null &&
                                    item.nota >= 5 &&
                                    item.nota <= 10
                                );
                            }
                        ).length

                        : 0;

                // ------------------------------------------------
                // VERIFICAR SE ESTÁ COMPLETO
                // ------------------------------------------------

                if (
                    criteriosAvaliados !==
                    totalCriteriosProjeto
                ) {

                    projetosNaoCompletos.push(
                        projeto
                    );
                }
            }

            // ------------------------------------------------
            // EXISTEM PROJETOS PENDENTES
            // ------------------------------------------------

            if (
                projetosNaoCompletos.length > 0
            ) {

                const titles =
                    projetosNaoCompletos
                        .map(
                            projeto =>
                                projeto.titulo
                        )
                        .join(', ');

                req.flash(
                    'error_msg',
                    `Você precisa avaliar todos os critérios dos projetos atribuídos antes de finalizar. Projetos pendentes: ${titles}.`
                );

                return res.redirect(
                    '/avaliador/dashboard'
                );
            }

            // ------------------------------------------------
            // TUDO COMPLETO
            // ------------------------------------------------

            avaliadorCompleto.ativo = false;

            avaliadorCompleto.statusAvaliacaoGeral = true;

            await avaliadorCompleto.save();

            // ------------------------------------------------
            // ENCERRAR SESSÃO
            // ------------------------------------------------

            req.session.destroy(err => {

                if (err) {

                    console.error(
                        'Erro ao encerrar sessão do avaliador:',
                        err
                    );

                    if (!res.headersSent) {
                        return res.redirect(
                            '/avaliador/login'
                        );
                    }

                    return;
                }

                if (!res.headersSent) {

                    return res.redirect(
                        '/avaliador/agradecimento'
                    );
                }
            });

        } catch (err) {

            console.error(
                'Erro ao finalizar avaliações do avaliador:',
                err
            );

            if (!res.headersSent) {

                req.flash(
                    'error_msg',
                    'Erro ao tentar finalizar avaliações. Detalhes: ' +
                    err.message
                );

                return res.redirect(
                    '/avaliador/dashboard'
                );
            }
        }
    }
);


// ============================================================
// LOGOUT
// ============================================================

router.get('/logout', (req, res) => {

    req.session.destroy(err => {

        if (err) {
            console.error(
                'Erro ao encerrar sessão do avaliador:',
                err
            );
        }

        if (!res.headersSent) {

            return res.redirect(
                '/avaliador/login'
            );
        }
    });
});


// ============================================================
// AGRADECIMENTO
// ============================================================

router.get('/agradecimento', (req, res) => {

    if (res.headersSent) {
        return;
    }

    res.render('avaliador/agradecimento', {

        layout: 'layouts/public',

        titulo:
            'Obrigado por sua participação'
    });
});


// ============================================================
// ACESSO DIRETO VIA PIN
// ============================================================

router.get(
    '/acesso-direto/:pin',
    async (req, res) => {

        try {

            const { pin } = req.params;

            const avaliador =
                await Avaliador.findOne({
                    pin,
                    ativo: true
                }).populate(
                    'projetosAtribuidos'
                );

            if (!avaliador) {

                return res.status(404).send(
                    'PIN inválido ou avaliador desativado.'
                );
            }

            if (
                !avaliador.escolaId ||
                !avaliador.feira
            ) {

                return res.status(400).send(
                    'Cadastro do avaliador incompleto.'
                );
            }

            req.session.avaliador = {

                id:
                    avaliador._id.toString(),

                nome:
                    avaliador.nome,

                escolaId:
                    avaliador.escolaId.toString(),

                feira:
                    avaliador.feira.toString()
            };

            return res.redirect(
                '/avaliador/dashboard'
            );

        } catch (err) {

            console.error(
                'Erro no acesso direto via PIN:',
                err
            );

            return res.status(500).send(
                'Erro ao acessar o sistema.'
            );
        }
    }
);


// ============================================================
// FEEDBACK
// ============================================================

router.post('/feedback', async (req, res) => {

    try {

        const {
            tipo,
            mensagem,
            categoria,
            nome,
            email
        } = req.body;

        const novoFeedback =
            new Feedback({

                tipo:
                    tipo || 'Avaliador',

                mensagem,

                categoria,

                nome:
                    nome?.trim() || '',

                email:
                    email?.trim() || ''
            });

        await novoFeedback.save();

        req.flash(
            'success_msg',
            'Feedback enviado com sucesso!'
        );

        return res.redirect(
            '/avaliador/agradecimento'
        );

    } catch (error) {

        console.error(
            'Erro ao enviar feedback:',
            error
        );

        req.flash(
            'error_msg',
            'Ocorreu um erro ao enviar o feedback. Tente novamente.'
        );

        return res.redirect(
            '/avaliador/agradecimento'
        );
    }
});


module.exports = router;
