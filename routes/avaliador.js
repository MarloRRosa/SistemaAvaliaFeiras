// routes/avaliador.js
const express = require('express');
const router = express.Router();
const Avaliador = require('../models/Avaliador');
const Projeto = require('../models/Projeto');
const Avaliacao = require('../models/Avaliacao');
const Criterio = require('../models/Criterio');
const Feira = require('../models/Feira'); // Importe o modelo Feira
const Escola = require('../models/Escola'); // Importe o modelo Escola
const QRCode = require('qrcode');
const Feedback = require('../models/Feedback');

// Middleware para verificar sessão do avaliador e se o PIN está ativo
async function verificarAvaliador(req, res, next) {
    if (res.headersSent) { // Previne o erro "Cannot set headers after they are sent to the client"
        console.warn('Headers já enviados em verificarAvaliador, abortando.');
        return;
    }
    if (req.session && req.session.avaliador) {
        const avaliador = await Avaliador.findById(req.session.avaliador.id);
        if (avaliador && avaliador.ativo) {
            res.locals.avaliador = avaliador; // Armazena o objeto avaliador completo para uso posterior
            return next();
        }
    }
    req.flash('error_msg', 'Acesso não autorizado. Informe seu PIN.');
    res.redirect('/avaliador/login');
}

// Tela de login via PIN
router.get('/login', (req, res) => {
    res.render('avaliador/login', {
        titulo: 'Login do Avaliador',
        layout: 'layouts/public',
        error_msg: req.flash('error_msg'), // Adicionado para exibir mensagens de erro
        success_msg: req.flash('success_msg') // Adicionado para exibir mensagens de sucesso
    });
});

// Validação do PIN
router.post('/login', async (req, res) => {
    const { pin } = req.body;
    try {
        const avaliador = await Avaliador.findOne({ pin, ativo: true })
            .populate('projetosAtribuidos');

        if (!avaliador) {
            req.flash('error_msg', 'PIN inválido ou avaliador inativo.');
            return res.redirect('/avaliador/login');
        }

        // Removido: avaliador.statusAvaliacaoGeral é um campo para ser definido pelo admin
        // e não deve bloquear o login, mas sim indicar um estado final.
        // Se a intenção é que o avaliador não possa mais logar após finalizar,
        // o campo 'ativo' no Avaliador já faz essa função.
        // if (avaliador.statusAvaliacaoGeral) {
        //     req.flash('error_msg', 'Seu PIN já foi desativado pois você finalizou suas avaliações.');
        //     return res.redirect('/avaliador/login');
        // }

        // Garantir que escolaId e feira sejam sempre incluídos na sessão do avaliador
        // Eles vêm do modelo Avaliador, que agora os exige.
        req.session.avaliador = {
            id: avaliador._id,
            nome: avaliador.nome,
            escolaId: avaliador.escolaId.toString(), // Converter para string
            feira: avaliador.feira.toString() // Converter para string
        };

        req.flash('success_msg', 'Login realizado com sucesso!');
        res.redirect('/avaliador/dashboard');
    } catch (err) {
        console.error('Erro no login do avaliador:', err);
        if (!res.headersSent) { // Previne o erro "Cannot set headers after they are sent to the client"
            req.flash('error_msg', 'Erro ao tentar autenticar. Detalhes: ' + err.message);
            res.redirect('/avaliador/login');
        }
    }
});

// Dashboard do Avaliador - lista de projetos atribuídos
router.get('/dashboard', verificarAvaliador, async (req, res) => {
    if (res.headersSent) return; // Previne o erro "Cannot set headers after they are sent to the client"
    try {
        const avaliadorData = res.locals.avaliador; // Objeto avaliador completo do middleware

        // Popular projetosAtribuidos com seus detalhes completos
        await avaliadorData.populate('projetosAtribuidos');

        let totalCriterios = 0;
        let feiraDoAvaliador = null;

        // O Avaliador já tem a feira e escolaId vinculados, então vamos usá-los
        if (avaliadorData.feira && avaliadorData.escolaId) {
            feiraDoAvaliador = await Feira.findById(avaliadorData.feira).lean();
            if (feiraDoAvaliador) {
                const criteriosParaFeira = await Criterio.find({ feira: feiraDoAvaliador._id, escolaId: avaliadorData.escolaId }).lean();
                totalCriterios = criteriosParaFeira.length;
            }
        }
        
        const projetosComStatus = await Promise.all(avaliadorData.projetosAtribuidos.map(async projeto => {
            const avaliacao = await Avaliacao.findOne({
                avaliador: avaliadorData._id,
                projeto: projeto._id
            });

            let statusAvaliacao = 'Pendente';
            let corStatus = 'text-yellow-600'; // Default para pendente

            if (avaliacao && avaliacao.itens.length > 0) {
                const criteriosAvaliadosComNota = avaliacao.itens.filter(item => item.nota !== undefined && item.nota !== null && item.nota >= 5 && item.nota <= 10).length;

                // Aqui comparamos com o total de critérios da feira atual
                if (criteriosAvaliadosComNota === totalCriterios && totalCriterios > 0) {
                    statusAvaliacao = 'Avaliado';
                    corStatus = 'text-green-600';
                } else if (criteriosAvaliadosComNota > 0) { // Se tem pelo menos uma nota válida, mas não todas
                    statusAvaliacao = 'Em Processo';
                    corStatus = 'text-orange-600';
                }
            }

            return {
                ...projeto.toObject(),
                statusAvaliacao: statusAvaliacao,
                corStatus: corStatus,
                avaliadoPorAvaliador: (statusAvaliacao === 'Avaliado')
            };
        }));

        const todosProjetosAvaliados = projetosComStatus.length > 0 && projetosComStatus.every(p => p.statusAvaliacao === 'Avaliado');

        res.render('avaliador/dashboard', {
            titulo: 'Meus Projetos',
            projetos: projetosComStatus,
            avaliador: avaliadorData,
            todosProjetosAvaliados: todosProjetosAvaliados,
            layout: 'layouts/public',
            error_msg: req.flash('error_msg'), // Adicionado para exibir mensagens de erro
            success_msg: req.flash('success_msg') // Adicionado para exibir mensagens de sucesso
        });
    } catch (err) {
        console.error('Erro ao carregar projetos do avaliador:', err);
        if (!res.headersSent) { // Previne o erro "Cannot set headers after they are sent to the client"
            req.flash('error_msg', 'Erro ao carregar seus projetos. Detalhes: ' + err.message);
            res.redirect('/avaliador/login');
        }
    }
});

// Tela de avaliação de um projeto específico
router.get('/avaliar/:projetoId', verificarAvaliador, async (req, res) => {
    if (res.headersSent) return; // Previne o erro "Cannot set headers after they are sent to the client"
    try {
        const { projetoId } = req.params;
        const avaliadorData = res.locals.avaliador; // Avaliador completo do middleware

        // Verifica se o projeto está realmente atribuído ao avaliador
        const projeto = await Projeto.findById(projetoId).lean();
        if (!projeto || String(projeto.escolaId) !== String(avaliadorData.escolaId) || String(projeto.feira) !== String(avaliadorData.feira)) {
            req.flash('error_msg', 'Projeto não encontrado ou não pertence à sua escola/feira, ou não está atribuído a você.');
            return res.redirect('/avaliador/dashboard');
        }

        // Buscar os critérios para esta feira e escola específica do projeto
        const criterios = await Criterio.find({
            feira: projeto.feira, // Use a feira do projeto
            escolaId: projeto.escolaId // Use a escolaId do projeto
        }).sort('nome'); // Ordena por nome para exibição consistente

        // Popula 'itens.criterio' para que possamos acessar o nome do critério se necessário na avaliaçãoExistente
        const avaliacaoExistente = await Avaliacao.findOne({
            avaliador: avaliadorData._id,
            projeto: projetoId,
            feira: projeto.feira, // Adicionar filtro de feira
            escolaId: projeto.escolaId // Adicionar filtro de escolaId
        }).populate('itens.criterio');

        res.render('avaliador/avaliar_projeto', {
            titulo: `Avaliar: ${projeto.titulo}`,
            projeto: projeto,
            criterios: criterios,
            avaliador: avaliadorData,
            avaliacaoExistente: avaliacaoExistente,
            layout: 'layouts/public',
            error_msg: req.flash('error_msg'), // Adicionado para exibir mensagens de erro
            success_msg: req.flash('success_msg') // Adicionado para exibir mensagens de sucesso
        });

    } catch (err) {
        console.error('Erro ao carregar página de avaliação:', err);
        if (!res.headersSent) { // Previne o erro "Cannot set headers after they are sent to the client"
            req.flash('error_msg', 'Erro ao carregar a página de avaliação do projeto. Detalhes: ' + err.message);
            res.redirect('/avaliador/dashboard');
        }
    }
});

// Envio da avaliação de um projeto específico (POST)
router.post('/avaliar/:projetoId', verificarAvaliador, async (req, res) => {
    const { projetoId } = req.params;
    try {
        const avaliadorData = res.locals.avaliador;
        const { criterios: criteriosRecebidos } = req.body;

        if (avaliadorData.statusAvaliacaoGeral) { // Verifica se já finalizou
            req.flash('error_msg', 'Suas avaliações já foram finalizadas. Não é possível editar.');
            return res.redirect(`/avaliador/dashboard`);
        }

        // Buscar o projeto para obter sua feira e escolaId para a validação dos critérios e associação da avaliação
        const projeto = await Projeto.findById(projetoId).lean();
        if (!projeto || String(projeto.escolaId) !== String(avaliadorData.escolaId) || String(projeto.feira) !== String(avaliadorData.feira)) {
            req.flash('error_msg', 'Projeto não encontrado ou não pertence à sua escola/feira, ou não está atribuído a você.');
            return res.redirect('/avaliador/dashboard');
        }

        let avaliacaoExistente = await Avaliacao.findOne({
            avaliador: avaliadorData._id,
            projeto: projetoId,
            feira: projeto.feira, // Adicionar filtro de feira
            escolaId: projeto.escolaId // Adicionar filtro de escolaId
        });

        // Se não existir, crie um objeto base para a nova avaliação
        if (!avaliacaoExistente) {
            avaliacaoExistente = new Avaliacao({
                avaliador: avaliadorData._id,
                projeto: projetoId,
                feira: projeto.feira, // Use a feira do projeto
                escolaId: projeto.escolaId, // Use a escolaId do projeto
                itens: [] // Inicializa vazio
            });
        }

        // Buscar os critérios oficiais para esta feira/escola para validação e atualização
        const criteriosOficiais = await Criterio.find({
            feira: projeto.feira,
            escolaId: projeto.escolaId
        });

        // Cria um mapa dos itens de avaliação existentes (se houver) para facilitar a atualização
        const novosItensAvaliacao = avaliacaoExistente.itens.map(item => ({ ...item.toObject() }));
        const novosItensMap = new Map(novosItensAvaliacao.map(item => [String(item.criterio), item]));

        // Itera sobre os CRITÉRIOS OFICIAIS para garantir que todos sejam considerados
        for (const criterio of criteriosOficiais) {
            const criterioId = String(criterio._id);
            const dadosRecebidosParaCriterio = criteriosRecebidos ? criteriosRecebidos[criterioId] : undefined;

            if (dadosRecebidosParaCriterio) {
                const { nota, comentario } = dadosRecebidosParaCriterio;

                if (nota === undefined || nota === null || nota === '') {
                    // Se a nota está vazia, apenas atualiza o comentário se o item já existe
                    let itemParaAtualizar = novosItensMap.get(criterioId);
                    if (itemParaAtualizar) {
                        itemParaAtualizar.comentario = comentario || '';
                    }
                    continue; // Pula para o próximo critério se a nota está vazia
                }

                const notaNum = parseInt(nota, 10);

                if (isNaN(notaNum) || notaNum < 5 || notaNum > 10) {
                    req.flash('error_msg', `Nota inválida para o critério "${criterio.nome}". As notas devem ser entre 5 e 10.`);
                    return res.redirect(`/avaliador/avaliar/${projetoId}`);
                }

                let itemParaAtualizar = novosItensMap.get(criterioId);

                if (itemParaAtualizar) {
                    itemParaAtualizar.nota = notaNum;
                    itemParaAtualizar.comentario = comentario || '';
                } else {
                    novosItensAvaliacao.push({
                        criterio: criterioId,
                        nota: notaNum,
                        comentario: comentario || ''
                    });
                }
            }
        }

        avaliacaoExistente.itens = novosItensAvaliacao;

        // Marca que a avaliação deste projeto foi "iniciada/salva" se tiver pelo menos um item com nota
        avaliacaoExistente.finalizadaPorAvaliador = avaliacaoExistente.itens.some(item => item.nota !== undefined && item.nota !== null);
        await avaliacaoExistente.save();

        req.flash('success_msg', 'Avaliação salva com sucesso!');
        res.redirect('/avaliador/dashboard');

    } catch (err) {
        console.error('Erro ao salvar avaliação do projeto:', err);
        if (!res.headersSent) { // Previne o erro "Cannot set headers after they are sent to the client"
            if (err.name === 'ValidationError') {
                let messages = Object.values(err.errors).map(val => val.message);
                req.flash('error_msg', messages.join(', '));
            } else {
                req.flash('error_msg', 'Erro ao salvar a avaliação. Detalhes: ' + err.message);
            }
            res.redirect(`/avaliador/avaliar/${projetoId}`);
        }
    }
});

// Finalizar todas as avaliações do avaliador
router.post('/finalizar-avaliacoes', verificarAvaliador, async (req, res) => {
    try {
        const avaliadorData = res.locals.avaliador;

        if (avaliadorData.statusAvaliacaoGeral) { // Verifica se já finalizou
            req.flash('error_msg', 'Suas avaliações já foram finalizadas.');
            return res.redirect('/avaliador/dashboard');
        }

        // Popula projetosAtribuidos do avaliador para ter acesso aos IDs
        const avaliadorCompleto = await Avaliador.findById(avaliadorData._id).populate('projetosAtribuidos');
        const projetosAtribuidosIds = avaliadorCompleto.projetosAtribuidos.map(p => p._id);

        let totalCriterios = 0;
        if (avaliadorData.feira && avaliadorData.escolaId) {
            const criteriosParaFeira = await Criterio.find({ 
                feira: avaliadorData.feira, // Usa a feira do avaliador
                escolaId: avaliadorData.escolaId // Usa a escolaId do avaliador
            }).lean();
            totalCriterios = criteriosParaFeira.length;
        }


        const projetosNaoCompletos = [];
        for (const projetoId of projetosAtribuidosIds) {
            const avaliacao = await Avaliacao.findOne({
                avaliador: avaliadorData._id,
                projeto: projetoId
            });

            // Considera o projeto incompleto se não há avaliação ou se nem todos os critérios foram pontuados
            // A comparação com totalCriterios só faz sentido se totalCriterios > 0
            if (!avaliacao || (totalCriterios > 0 && avaliacao.itens.filter(item => item.nota !== undefined && item.nota !== null && item.nota >= 5 && item.nota <= 10).length !== totalCriterios)) {
                // Se o projeto tiver 0 critérios, ele é considerado "completo" se tiver uma avaliação existente (mesmo que vazia de itens com nota)
                // Se tem critérios e não foram todos avaliados, é incompleto.
                if (totalCriterios === 0 && avaliacao) {
                    // Projeto sem critérios definidos, e já existe uma avaliação (ok para finalizar)
                } else {
                    projetosNaoCompletos.push(projetoId);
                }
            }
        }

        if (projetosNaoCompletos.length > 0) {
            // Busque os títulos dos projetos não completos para uma mensagem mais informativa
            const projetosTitles = await Projeto.find({ _id: { $in: projetosNaoCompletos } }).select('titulo').lean();
            const titles = projetosTitles.map(p => p.titulo).join(', ');
            req.flash('error_msg', `Você precisa avaliar TODOS os critérios de TODOS os projetos atribuídos antes de finalizar. Projetos pendentes: ${titles}.`);
            return res.redirect('/avaliador/dashboard');
        }

        // Se chegou aqui, todas as avaliações estão completas.
        avaliadorData.ativo = false; // Desativa o avaliador (não pode mais logar com este PIN)
        avaliadorData.statusAvaliacaoGeral = true; // Marca que ele finalizou suas avaliações
        await avaliadorData.save();

        req.session.destroy(err => {
            if (err) {
                console.error('Erro ao encerrar sessão do avaliador:', err);
                if (!res.headersSent) { // Previne o erro "Cannot set headers after they are sent to the client"
                    return res.redirect('/avaliador/login');
                }
                return;
            }
            if (!res.headersSent) { // Previne o erro "Cannot set headers after they are sent to the client"
                res.redirect('/avaliador/agradecimento');
            }
        });

    } catch (err) {
        console.error('Erro ao finalizar avaliações do avaliador:', err);
        if (!res.headersSent) { // Previne o erro "Cannot set headers after they are sent to the client"
            req.flash('error_msg', 'Erro ao tentar finalizar avaliações. Detalhes: ' + err.message);
            res.redirect('/avaliador/dashboard');
        }
    }
});


// Logout do avaliador
router.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) console.error('Erro ao encerrar sessão do avaliador:', err);
        if (!res.headersSent) { // Previne o erro "Cannot set headers after they are sent to the client"
            req.flash('success_msg', 'Você foi desconectado com sucesso.');
            res.redirect('/avaliador/login');
        }
    });
});

router.get('/agradecimento', (req, res) => {
    if (res.headersSent) return; // Previne o erro "Cannot set headers after they are sent to the client"
    res.render('avaliador/agradecimento', {
        layout: 'layouts/public',
        titulo: 'Obrigado por sua participação'
    });
});

// Acesso direto via link com PIN (sem login)
router.get('/acesso-direto/:pin', async (req, res) => {
  try {
    const { pin } = req.params;

    const avaliador = await Avaliador.findOne({ pin, ativo: true }).populate('projetosAtribuidos');

    if (!avaliador) {
      return res.status(404).send('PIN inválido ou avaliador desativado.');
    }

    // Define sessão como se tivesse feito login normalmente
    req.session.avaliador = {
      id: avaliador._id,
      nome: avaliador.nome,
      escolaId: avaliador.escolaId.toString(),
      feira: avaliador.feira.toString()
    };

    return res.redirect('/avaliador/dashboard');
  } catch (err) {
    console.error('Erro no acesso direto via PIN:', err);
    res.status(500).send('Erro ao acessar o sistema.');
  }
});

module.exports = mongoose.model('Feedback', FeedbackSchema);
