//preCadastro
const express = require('express');
const router = express.Router();
const PreCadastroAvaliador = require('../models/PreCadastroAvaliador');
const Feira = require('../models/Feira');
const ConfiguracaoFormularioPreCadastro = require('../models/ConfiguracaoFormularioPreCadastro');
const { formatarData } = require('../utils/helpers');

// GET: Exibir formulário de pré-cadastro
router.get('/pre-cadastro/:feiraId', async (req, res) => {
  try {
    const feira = await Feira.findById(req.params.feiraId);

    if (!feira || feira.status !== 'ativa') {
      return res.send('Feira inválida ou inativa.');
    }

    const configuracao = await ConfiguracaoFormularioPreCadastro.findOne({ escolaId: feira.escolaId });
    const camposExtras = (configuracao?.camposExtras || []).filter(campo => {
      const label = campo.label.trim().toLowerCase();
      return label !== 'nome' && label !== 'email';
    });

    res.render('public/pre-cadastro', {
  layout: false,
  titulo: `Pré-Cadastro - ${feira.nome}`,
  feira,
  feiraId: feira._id,
  mensagem: req.flash('success'),
  camposExtras,
  formatarData
});
  } catch (err) {
    console.error(err);
    res.send('Erro ao carregar o formulário.');
  }
});

// POST: Enviar dados de pré-cadastro
router.post('/pre-cadastro/:feiraId', async (req, res) => {
  try {
    const { feiraId } = req.params;
    const extras = req.body.extras || {};

    const nome = req.body.nome?.trim();
    const email = req.body.email?.trim();
    const telefone = req.body.telefone?.trim() || '';

    if (!nome || !email) {
      return res.send('Nome e Email são obrigatórios.');
    }

    const feira = await Feira.findById(feiraId);
    if (!feira) {
      return res.send('Feira não encontrada.');
    }

    // Verifica duplicidade pelo email
    const existente = await PreCadastroAvaliador.findOne({ feiraId, email });
    if (existente) {
      return res.send('Você já enviou um pré-cadastro para esta feira.');
    }

    const configuracao = await ConfiguracaoFormularioPreCadastro.findOne({ escolaId: feira.escolaId });
    const camposObrigatorios = (configuracao?.camposExtras || []).filter(c => c.obrigatorio);

    for (const campo of camposObrigatorios) {
      const label = campo.label.trim().toLowerCase();
      if (label === 'nome' || label === 'email') continue; // já são tratados
      const valor = extras[campo.label]?.trim?.() || '';
      if (!valor) {
        return res.send(`O campo "${campo.label}" é obrigatório.`);
      }
    }

    const novoPreCadastro = new PreCadastroAvaliador({
      feiraId,
      nome,
      email,
      telefone,
      extras
    });

    await novoPreCadastro.save();

    req.flash('success', 'Pré-cadastro enviado com sucesso!');
    res.redirect(`/pre-cadastro/${feiraId}`);
  } catch (err) {
    console.error('Erro ao enviar pré-cadastro:', err);
    res.send('Erro ao enviar o pré-cadastro.');
  }
});

module.exports = router;
