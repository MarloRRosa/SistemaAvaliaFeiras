const mongoose = require('mongoose');

const PreCadastroAvaliadorSchema = new mongoose.Schema({
  feiraId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Feira',
    required: true
  },
  // ❌ Removido o required para nome e email
  nome: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    lowercase: true,
    trim: true
  },
  telefone: {
    type: String
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

// ❗️Chave composta: email + feiraId continua útil para evitar duplicidade
PreCadastroAvaliadorSchema.index({ email: 1, feiraId: 1 }, { unique: true });

const PreCadastroAvaliador = mongoose.model('PreCadastroAvaliador', PreCadastroAvaliadorSchema);

module.exports = PreCadastroAvaliador;
