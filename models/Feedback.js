const mongoose = require('mongoose');

const FeedbackSchema = new mongoose.Schema({
  tipo: {
    type: String,
    enum: ['Avaliador', 'ADM', 'SuperADM', 'Outro'],
    required: true,
  },
  categoria: {
    type: String,
    enum: ['Sugestão', 'Crítica', 'Erro', 'Elogio', 'Outro'],
    required: true,
  },
  mensagem: {
    type: String,
    required: true,
  },
  nome: {
    type: String,
    default: ''
  },
  email: {
    type: String,
    default: ''
  },
  criadoEm: {
    type: Date,
    default: Date.now,
  }
});

module.exports = mongoose.model('Feedback', FeedbackSchema);
