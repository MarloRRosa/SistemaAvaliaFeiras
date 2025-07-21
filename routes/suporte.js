const express = require('express');
const router = express.Router();
const Mensagem = require('../models/mensagensSuporte');
const enviarMensagemTelegram = require('../utils/telegram');
const mongoose = require('mongoose');

// Middleware de verificação de sessão
function verificarUsuario(req, res, next) {
  if (req.session.superadmin || req.session.adminEscola) {
    return next();
  }
  req.flash('error_msg', 'Usuário não autenticado.');
  return res.redirect('/login');
}

// Rota principal do suporte – para ADM ou SuperADM
router.get('/', verificarUsuario, async (req, res) => {
  const user = req.session.superadmin || req.session.adminEscola;
  const filtro = { autorEmail: user.email };

  try {
    const mensagens = await Mensagem.find({
      $or: [
        { autorEmail: user.email },
        { autorTipo: user.tipo === 'SUPERADM' ? 'ADM' : 'SUPERADM' } // opcional: mostrar também as respostas
      ]
    }).sort({ dataEnvio: 1 });

    res.render(user.tipo === 'SUPERADM' ? 'suporte/superadm' : 'suporte/adm', {
      mensagens,
      usuario: user
    });
  } catch (err) {
    console.error('Erro ao buscar mensagens:', err);
    req.flash('error_msg', 'Erro ao carregar mensagens.');
    res.redirect('/');
  }
});

// Enviar nova mensagem (ADM ou SuperADM)
router.post('/', verificarUsuario, async (req, res) => {
  const { mensagem, respostaDe } = req.body;

  if (!mensagem) {
    req.flash('error_msg', 'Mensagem não pode estar vazia.');
    return res.redirect('/suporte');
  }

  const user = req.session.superadmin || req.session.adminEscola;
  const tipo = req.session.superadmin ? 'SUPERADM' : 'ADM';

  try {
    const novaMensagem = new Mensagem({
  autorId: new mongoose.Types.ObjectId(user._id || user.id),
  autorNome: user.nome,
  autorEmail: user.email,
  autorTipo: tipo,
  mensagem,
  respostaDe: respostaDe || null
});

    await novaMensagem.save();

    // Notificação para o Telegram (apenas se for ADM enviando)
    if (tipo === 'ADM') {
      const texto = `📩 Nova dúvida recebida:
Escola: ${user.escola || 'Não informada'}
Usuário: ${user.email}
Mensagem: ${mensagem}`;
      await enviarMensagemTelegram(texto);
    }

    req.flash('success_msg', 'Mensagem enviada com sucesso.');
    res.redirect('/suporte');
  } catch (err) {
    console.error('Erro ao enviar mensagem:', err);
    req.flash('error_msg', 'Erro ao enviar mensagem.');
    res.redirect('/suporte');
  }
});

// (Opcional) Página exclusiva para SuperADM visualizar mensagens agrupadas
router.get('/admin', verificarUsuario, async (req, res) => {
  if (!req.session.superadmin) {
    req.flash('error_msg', 'Acesso restrito ao Super ADM.');
    return res.redirect('/');
  }

  try {
    const mensagens = await Mensagem.find().populate('autorId').sort({ dataEnvio: -1 });
    res.render('suporte/superadm', { mensagens });
  } catch (err) {
    console.error('Erro ao buscar mensagens:', err);
    req.flash('error_msg', 'Erro ao carregar mensagens.');
    res.redirect('/');
  }
});

module.exports = router;
