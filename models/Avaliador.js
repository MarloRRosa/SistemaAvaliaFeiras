// models/Avaliador.js
const mongoose = require('mongoose');

const AvaliadorSchema = new mongoose.Schema({
  nome: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  pin: {
    type: String,
    required: true,
    minlength: 4,
    maxlength: 6
  },
  ativo: {
    type: Boolean,
    default: true
  },
  projetosAtribuidos: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Projeto'
  }],
  escolaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Escola',
    required: true
  },
  feira: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Feira',
    required: true
  },
  dataCadastro: {
    type: Date,
    default: Date.now
  },
  qrcode: {
    type: String // <- adicionado
  }
});

// Permite o mesmo email em diferentes escolas/feiras
AvaliadorSchema.index({ email: 1, escolaId: 1, feira: 1 }, { unique: true });

const Avaliador = mongoose.model('Avaliador', AvaliadorSchema);

module.exports = Avaliador;
