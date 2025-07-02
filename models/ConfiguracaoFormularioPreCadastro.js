// models/ConfiguracaoFormularioPreCadastro.js
const mongoose = require('mongoose');

const campoExtraSchema = new mongoose.Schema({
  label: { type: String, required: true },
  tipo: { type: String, enum: ['texto', 'número', 'seleção'], required: true },
  obrigatorio: { type: Boolean, default: false },
  opcoes: { type: String } // Usado apenas se tipo === 'seleção'
});

const configuracaoSchema = new mongoose.Schema({
  escolaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Escola', required: true },
  camposExtras: [campoExtraSchema] // Campos adicionais ao nome e email
});

module.exports = mongoose.model('ConfiguracaoFormularioPreCadastro', configuracaoSchema);
