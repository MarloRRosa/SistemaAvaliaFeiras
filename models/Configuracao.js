// models/Configuracao.js
const mongoose = require('mongoose');

// Define o esquema para o modelo Configuracao
const ConfiguracaoSchema = new mongoose.Schema({
  nomeFeira: {
    type: String, // Nome da feira atual (ex: Feira de Ciências 2025)
    required: true
  },
  dataInicio: {
    type: Date, // Data de início da feira
    required: true
  },
  dataFim: {
    type: Date, // Data de término da feira
    required: true
  },
  status: {
    type: String, // Status da feira (ex: 'ativa', 'finalizada', 'em preparação')
    enum: ['ativa', 'finalizada', 'em preparação'], // Valores permitidos
    default: 'em preparação' // Status padrão
  },
  escolaId: {
    type: mongoose.Schema.Types.ObjectId, // ID da escola à qual esta configuração pertence
    ref: 'Escola', // Referencia o modelo 'Escola'
    required: true,
    unique: true // Garante que cada escola tenha apenas uma configuração de feira
  },
  dataAtualizacao: {
    type: Date, // Data da última atualização da configuração
    default: Date.now // Define a data atual como padrão
  }
});

// Cria e exporta o modelo Configuracao
module.exports = mongoose.model('Configuracao', ConfiguracaoSchema);

