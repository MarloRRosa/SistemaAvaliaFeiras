// models/Avaliacao.js
const mongoose = require('mongoose');

// Sub-documento para armazenar a nota e comentário para CADA CRITÉRIO
const itemAvaliacaoSchema = new mongoose.Schema({
  criterio: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Criterio',
    required: true
  },
  nota: {
    type: Number,
    min: 5,
    max: 10
  },
  comentario: {
    type: String,
    trim: true,
    default: ''
  }
}, { _id: false });

// Esquema principal da Avaliação
const AvaliacaoSchema = new mongoose.Schema({
  // RESTAURADO: Campo 'avaliador' como estava originalmente
  avaliador: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Avaliador',
    required: true
  },
  // RESTAURADO: Campo 'projeto' como estava originalmente
  projeto: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Projeto',
    required: true
  },
  feira: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Feira',
    required: true
  },
  escolaId: { // NOME DO CAMPO ALTERADO PARA 'escolaId' para padronização
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Escola',
    required: true
  },
  itens: [itemAvaliacaoSchema],
  finalizadaPorAvaliador: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// MANTIDO: O índice com os nomes de campo que o MongoDB está esperando
// (avaliador e projeto, sem 'Id' no final)
AvaliacaoSchema.index({ avaliador: 1, projeto: 1 }, { unique: true });

module.exports = mongoose.model('Avaliacao', AvaliacaoSchema);
