const express = require('express');
const router = express.Router();
const Mensagem = require('../models/mensagensSuporte');
const enviarMensagemTelegram = require('../utils/telegram');

// Middleware simples para verificar se usuário está logado
function verificarLogin(req, res, next) {
  if (!req.user || !req.user._id) {
    req.flash('error_msg', 'Você precisa estar logado para acessar essa página.');
    return res.redirect('/login'); // ajuste essa rota se necessário
  }
  next();
}

// Tela do ADM – suporte
router.get('/', verificarLogin, async (req, res) => {
  try {
    const mensagens = await Mensagem.find({ autorId: req.user._id }).sort({ dataEnvio: -1 });
    res.render('suporte/adm', { mensagens });
  } catch (err) {
    console.error('Erro ao buscar mensagens do suporte:', err);
    req.flash('error_msg', 'Erro ao carregar mensagens.');
    res.redirect('/');
  }
});

// Enviar nova dúvida (ADM)
router.post('/', verificarLogin, async (req, res) => {
  const { mensagem } = req.body;

  if (!mensagem || mensagem.trim() === '') {
    req.flash('error_msg', 'Mensagem não pode estar vazia.');
    return res.redirect('/suporte');
  }

  try {
    const nova = new Mensagem({
      autorId: req.user._id,
      autorTipo: 'ADM',
      mensagem: mensagem.trim()
    });

    console.log('Salvando mensagem suporte:', {
      autorId: req.user._id.toString(),
      autorTipo: 'ADM',
      mensagem: mensagem.trim()
    });

    await nova.save();

    // Enviar notificação para o Super ADM no Telegram
    const texto = `📩 Nova dúvida recebida:
Escola: ${req.user.escola || 'Desconhecida'}
Usuário: ${req.user.email}
Mensagem: ${mensagem.trim()}`;
    await enviarMensagemTelegram(texto);

    req.flash('success_msg', 'Mensagem enviada com sucesso.');
    res.redirect('/suporte');
  } catch (err) {
    console.error('Erro ao enviar mensagem de suporte:', err);
    req.flash('error_msg', 'Erro ao enviar mensagem. Tente novamente.');
    res.redirect('/suporte');
  }
});

// Super ADM – ver todas as mensagens
router.get('/admin', verificarLogin, async (req, res) => {
  try {
    const mensagens = await Mensagem.find().populate('autorId').sort({ dataEnvio: -1 });
    res.render('suporte/superadm', { mensagens });
  } catch (err) {
    console.error('Erro ao carregar mensagens para Super ADM:', err);
    req.flash('error_msg', 'Erro ao carregar mensagens.');
    res.redirect('/');
  }
});

// Super ADM responde (opcional)
router.post('/responder/:id', verificarLogin, async (req, res) => {
  const { resposta } = req.body;

  if (!resposta || resposta.trim() === '') {
    req.flash('error_msg', 'Resposta não pode estar vazia.');
    return res.redirect('/suporte/admin');
  }

  try {
    const respostaMsg = new Mensagem({
      autorId: req.user._id,
      autorTipo: 'SUPERADM',
      mensagem: resposta.trim()
    });

    await respostaMsg.save();

    req.flash('success_msg', 'Resposta enviada com sucesso.');
    res.redirect('/suporte/admin');
  } catch (err) {
    console.error('Erro ao enviar resposta do Super ADM:', err);
    req.flash('error_msg', 'Erro ao enviar resposta. Tente novamente.');
    res.redirect('/suporte/admin');
  }
});

module.exports = router;
