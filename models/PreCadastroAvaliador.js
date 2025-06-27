const mongoose = require('mongoose');

const PreCadastroAvaliadorSchema = new mongoose.Schema({
  feiraId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Feira',
    required: true
  },
  nome: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  telefone: {
    type: String
  },
  extras: {
    type: mongoose.Schema.Types.Mixed, // Campos adicionais dinâmicos
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

// Permite que o mesmo avaliador pré-cadastre-se em diferentes feiras
PreCadastroAvaliadorSchema.index({ email: 1, feiraId: 1 }, { unique: true });

const PreCadastroAvaliador = mongoose.model('PreCadastroAvaliador', PreCadastroAvaliadorSchema);

module.exports = PreCadastroAvaliador;
