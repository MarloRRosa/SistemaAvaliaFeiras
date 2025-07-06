// models/mensagensSuporte.js
const mongoose = require('mongoose');

const MensagemSchema = new mongoose.Schema({
  autorId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'Usuario'
  },
  autorTipo: {
    type: String,
    enum: ['ADM', 'SUPERADM'],
    required: true
  },
  mensagem: {
    type: String,
    required: true
  },
  dataEnvio: {
    type: Date,
    default: Date.now
  },
  lida: {
    type: Boolean,
    default: false
  }
});

module.exports = mongoose.model('MensagemSuporte', MensagemSchema);
