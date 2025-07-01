const mongoose = require('mongoose');

const PreCadastroAvaliadorSchema = new mongoose.Schema({
  feiraId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Feira',
    required: true
  },
  extras: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  status: {
    type: String,
    enum: ['pendente', 'aprovado', 'recusado'],
    default: 'pendente'
  },
  criadoEm: {
    type: Date,
    default: Date.now
  }
});

const PreCadastroAvaliador = mongoose.model('PreCadastroAvaliador', PreCadastroAvaliadorSchema);

module.exports = PreCadastroAvaliador;
