// routes/public.js

const express = require('express');
const router = express.Router();
const SolicitacaoAcesso = require('../models/SolicitacaoAcesso');
require('dotenv').config();
const Feedback = require('../models/Feedback');
const { Resend } = require('resend');

/**
 * Resend (envio de e-mails)
 * Requisitos de ENV:
 * - RESEND_API_KEY
 * - EMAIL_FROM (ex: no-reply@rosatech.com.br ou "AvaliaFeiras <no-reply@rosatech.com.br>")
 */
const resend = new Resend(process.env.RESEND_API_KEY);

async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY não configurada no ambiente.');
  }
  if (!process.env.EMAIL_FROM) {
    throw new Error('EMAIL_FROM não configurada no ambiente.');
  }

  return resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: Array.isArray(to) ? to : [to],
    subject,
    html
  });
}

// Página inicial
router.get('/', (req, res) => {
  res.render('index', {
    titulo: 'Bem-vindo ao AvaliaFeiras',
    layout: false
  });
});

// GET - formulário de solicitação de acesso
router.get('/solicitar-acesso', (req, res) => {
  res.render('public/solicitar-acesso', {
    titulo: 'Solicitar Acesso',
    layout: 'layouts/public',
    nomeEscola: '',
    cnpj: '',
    endereco: '',
    telefoneEscola: '',
    nomeResponsavel: '',
    emailContato: '',
    cargoResponsavel: '',
    telefoneContato: '',
    tipoEvento: '',
    previsaoUso: '',
    mensagem: ''
  });
});

// POST - envio do formulário
router.post('/solicitar-acesso', async (req, res) => {
  const {
    nomeEscola,
    cnpj,
    endereco,
    telefoneEscola,
    nomeResponsavel,
    emailContato,
    cargoResponsavel,
    telefoneContato,
    tipoEvento,
    previsaoUso,
    mensagem,
    aceiteTermo
  } = req.body;

  const errors = [];

  // Validações
  if (!nomeEscola || nomeEscola.trim().length < 3) errors.push('Nome da escola deve ter pelo menos 3 caracteres.');
  if (!endereco || endereco.trim().length < 5) errors.push('Endereço da escola é obrigatório.');
  if (!telefoneEscola || !/^\d{10,11}$/.test(telefoneEscola.replace(/\D/g, ''))) errors.push('Telefone da escola deve ter 10 ou 11 dígitos.');

  if (!nomeResponsavel || nomeResponsavel.trim().length < 3) errors.push('Nome do responsável é obrigatório.');
  if (!emailContato || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailContato)) errors.push('E-mail de contato inválido.');
  if (!cargoResponsavel || cargoResponsavel.trim().length < 3) errors.push('Cargo do responsável é obrigatório.');
  if (!telefoneContato || !/^\d{10,11}$/.test(telefoneContato.replace(/\D/g, ''))) errors.push('Telefone de contato deve ter 10 ou 11 dígitos.');

  if (!tipoEvento || tipoEvento.trim().length === 0) errors.push('Tipo de evento é obrigatório.');
  if (cnpj && !/^\d{14}$/.test(cnpj.replace(/\D/g, ''))) errors.push('CNPJ inválido. Deve conter 14 dígitos.');
  if (!aceiteTermo) errors.push('Você deve aceitar os termos de uso.');

  if (errors.length > 0) {
    req.flash('error_msg', errors.join('<br>'));
    return res.render('public/solicitar-acesso', {
      titulo: 'Solicitar Acesso',
      layout: 'layouts/public',
      nomeEscola,
      cnpj,
      endereco,
      telefoneEscola,
      nomeResponsavel,
      emailContato,
      cargoResponsavel,
      telefoneContato,
      tipoEvento,
      previsaoUso,
      mensagem
    });
  }

  try {
    const existente = await SolicitacaoAcesso.findOne({
      $or: [
        { emailContato: emailContato.trim(), status: 'Pendente' },
        { nomeEscola: nomeEscola.trim(), status: 'Pendente' }
      ]
    });

    if (existente) {
      req.flash('error_msg', 'Já existe uma solicitação pendente com este e-mail ou nome de escola.');
      return res.render('public/solicitar-acesso', {
        titulo: 'Solicitar Acesso',
        layout: 'layouts/public',
        nomeEscola,
        cnpj,
        endereco,
        telefoneEscola,
        nomeResponsavel,
        emailContato,
        cargoResponsavel,
        telefoneContato,
        tipoEvento,
        previsaoUso,
        mensagem
      });
    }

    // Captura IP real mesmo atrás de proxy
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    const nova = new SolicitacaoAcesso({
      nomeEscola: nomeEscola.trim(),
      cnpj: cnpj ? cnpj.replace(/\D/g, '') : undefined,
      endereco: endereco.trim(),
      telefoneEscola: telefoneEscola.replace(/\D/g, ''),
      nomeResponsavel: nomeResponsavel.trim(),
      emailContato: emailContato.trim(),
      cargoResponsavel: cargoResponsavel.trim(),
      telefoneContato: telefoneContato.replace(/\D/g, ''),
      tipoEvento: tipoEvento.trim(),
      previsaoUso: previsaoUso?.trim() || '',
      mensagem: mensagem?.trim() || '',
      status: 'Pendente',
      dataSolicitacao: new Date(),
      registroAceite: {
        aceite: true,
        ip,
        dataHora: new Date()
      }
    });

    await nova.save();

    // E-mail para o superadmin (opcional)
    if (process.env.SUPER_ADMIN_EMAIL) {
      try {
        const envio = await sendEmail({
          to: process.env.SUPER_ADMIN_EMAIL,
          subject: 'Nova Solicitação de Acesso ao AvaliaFeiras',
          html: `
            <p>Uma nova escola solicitou acesso:</p>
            <ul>
              <li><strong>Escola:</strong> ${nomeEscola}</li>
              <li><strong>Responsável:</strong> ${nomeResponsavel}</li>
              <li><strong>Email:</strong> ${emailContato}</li>
              <li><strong>Telefone:</strong> ${telefoneContato}</li>
              <li><strong>IP:</strong> ${ip}</li>
            </ul>
            <p><a href="${process.env.APP_URL}/superadmin">Acessar o painel para aprovar/rejeitar</a></p>
          `
        });

        console.log('✔️ Solicitação enviada com sucesso para o superadmin:', envio?.id || envio);
      } catch (erroEnvio) {
        console.error('❌ Erro ao enviar e-mail de solicitação:', erroEnvio);
      }
    } else {
      console.warn('⚠️ SUPER_ADMIN_EMAIL não está definido no ambiente!');
    }

    req.flash('success_msg', 'Sua solicitação foi enviada com sucesso! Aguarde nosso contato.');
    res.redirect('/');
  } catch (err) {
    console.error('Erro ao salvar solicitação:', err);
    req.flash('error_msg', 'Erro ao processar sua solicitação. Tente novamente.');
    res.redirect('/solicitar-acesso');
  }
});

// Página de Política de Privacidade
router.get('/politica-privacidade', (req, res) => {
  res.render('public/politica-privacidade', {
    titulo: 'Política de Privacidade',
    layout: 'layouts/public'
  });
});

// Página de Termos de Uso
router.get('/termos-de-uso', (req, res) => {
  res.render('public/termos-de-uso', {
    titulo: 'Termos de Uso',
    layout: 'layouts/public'
  });
});

router.post('/feedback', async (req, res) => {
  const { tipo, mensagem, categoria, nome, email } = req.body;

  try {
    const novoFeedback = new Feedback({
      tipo: tipo || 'Index',
      mensagem,
      categoria,
      nome: nome?.trim() || '',
      email: email?.trim() || '',
      dataEnvio: new Date()
    });

    await novoFeedback.save();

    // (Opcional) Enviar e-mail para o super admin
    if (process.env.SUPER_ADMIN_EMAIL) {
      try {
        await sendEmail({
          to: process.env.SUPER_ADMIN_EMAIL,
          subject: 'Novo Feedback recebido pelo site',
          html: `
            <p><strong>Categoria:</strong> ${categoria || 'Não informada'}</p>
            <p><strong>Mensagem:</strong> ${mensagem}</p>
            <p><strong>Nome:</strong> ${nome || 'Anônimo'}</p>
            <p><strong>Email:</strong> ${email || 'Não informado'}</p>
          `
        });
      } catch (err) {
        console.error('Erro ao enviar e-mail de feedback:', err);
      }
    }

    req.flash('success_msg', 'Feedback enviado com sucesso!');
    res.redirect('/');
  } catch (error) {
    console.error('Erro ao enviar feedback:', error);
    req.flash('error_msg', 'Erro ao enviar feedback. Tente novamente.');
    res.redirect('/');
  }
});

module.exports = router;
