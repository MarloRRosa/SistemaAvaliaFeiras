// models/PreCadastroAvaliador.js
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
    trim: true,
    lowercase: true
  },
  telefone: {
    type: String,
    trim: true
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
