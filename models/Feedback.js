const mongoose = require('mongoose');

const FeedbackSchema = new mongoose.Schema({
  tipo: {
    type: String,
    enum: ['Avaliador', 'ADM', 'SuperADM', 'Outro'],
    required: true,
  },
  mensagem: {
    type: String,
    required: true,
  },
  criadoEm: {
    type: Date,
    default: Date.now,
  }
});

module.exports = mongoose.model('Feedback', FeedbackSchema);
