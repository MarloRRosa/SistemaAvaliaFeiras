const express = require('express');
const router = express.Router();
const PreCadastroAvaliador = require('../models/PreCadastroAvaliador');
const Feira = require('../models/Feira');

// GET: Exibir formulário de pré-cadastro
router.get('/pre-cadastro/:feiraId', async (req, res) => {
  try {
    const feira = await Feira.findById(req.params.feiraId);

    if (!feira || feira.status !== 'ativa') {
      return res.send('Feira inválida ou inativa.');
    }

    // Campos extras configuráveis futuramente pela feira (placeholder por enquanto)
    const ConfiguracaoFormularioPreCadastro = require('../models/ConfiguracaoFormularioPreCadastro');

const configuracao = await ConfiguracaoFormularioPreCadastro.findOne({ escolaId: feira.escolaId });
const camposExtras = configuracao ? configuracao.camposExtras : [];


    res.render('public/pre-cadastro', {
      layout: 'layouts/public',                // ✅ Garante que usa o layout certo
      titulo: `Pré-Cadastro - ${feira.nome}`,  // ✅ Passa titulo para o <title>
      feiraId: feira._id,
      mensagem: req.flash('success'),
      camposExtras
    });
  } catch (err) {
    console.error(err);
    res.send('Erro ao carregar o formulário.');
  }
});

// POST: Enviar dados de pré-cadastro
router.post('/pre-cadastro/:feiraId', async (req, res) => {
  try {
    const { nome, email, telefone } = req.body;
    const extras = req.body.extras || {};

    const feira = await Feira.findById(req.params.feiraId);
    if (!feira) {
      return res.send('Feira não encontrada.');
    }

    // Verifica duplicidade de email já enviado para essa feira
    const existe = await PreCadastroAvaliador.findOne({ email, feiraId: feira._id });
    if (existe) {
      return res.send('Você já enviou um pré-cadastro para esta feira.');
    }

    const novoPreCadastro = new PreCadastroAvaliador({
      feiraId: feira._id,
      nome,
      email,
      telefone,
      extras
    });

    await novoPreCadastro.save();

    req.flash('success', 'Pré-cadastro enviado com sucesso!');
    res.redirect(`/pre-cadastro/${feira._id}`);
  } catch (err) {
    console.error(err);
    res.send('Erro ao enviar o pré-cadastro.');
  }
});

module.exports = router;
