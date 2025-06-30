const mongoose = require('mongoose');

const ConfiguracaoFormularioPreCadastroSchema = new mongoose.Schema({
  escolaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Escola',
    required: true
  },
  camposExtras: [
    {
      label: { type: String, required: true },
      tipo: { type: String, default: 'texto' }, // texto, número, select, etc.
      obrigatorio: { type: Boolean, default: false }
    }
  ]
});

module.exports = mongoose.model('ConfiguracaoFormularioPreCadastro', ConfiguracaoFormularioPreCadastroSchema);
