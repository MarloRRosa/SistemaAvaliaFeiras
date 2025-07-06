// routes/suporte.js
const express = require('express');
const router = express.Router();
const Mensagem = require('../models/mensagensSuporte');
const enviarMensagemTelegram = require('../utils/telegram');

// Tela do ADM – suporte
router.get('/', async (req, res) => {
  const mensagens = await Mensagem.find({ autorId: req.user._id }).sort({ dataEnvio: -1 });
  res.render('suporte/adm', { mensagens });
});

// Enviar nova dúvida (ADM)
router.post('/', async (req, res) => {
  const nova = new Mensagem({
    autorId: req.user._id,
    autorTipo: 'ADM',
    mensagem: req.body.mensagem
  });

  await nova.save();

  // Enviar notificação para o Super ADM no Telegram
  const texto = `📩 Nova dúvida recebida:
Escola: ${req.user.escola || 'Desconhecida'}
Usuário: ${req.user.email}
Mensagem: ${req.body.mensagem}`;
  await enviarMensagemTelegram(texto);

  res.redirect('/suporte');
});

// Super ADM – ver todas as mensagens
router.get('/admin', async (req, res) => {
  const mensagens = await Mensagem.find().populate('autorId').sort({ dataEnvio: -1 });
  res.render('suporte/superadm', { mensagens });
});

// Super ADM responde (opcional)
router.post('/responder/:id', async (req, res) => {
  const resposta = new Mensagem({
    autorId: req.user._id,
    autorTipo: 'SUPERADM',
    mensagem: req.body.resposta
  });

  await resposta.save();
  res.redirect('/suporte/admin');
});

module.exports = router;
