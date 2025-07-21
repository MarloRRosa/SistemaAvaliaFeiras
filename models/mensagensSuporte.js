// models/mensagensSuporte.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const MensagemSchema = new Schema({
  autorId: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'Usuario'
  },
  autorNome: {
    type: String,
    required: true
  },
  autorEmail: {
    type: String,
    required: true
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
  },
  respostaDe: {
    type: Schema.Types.ObjectId,
    ref: 'MensagemSuporte',
    default: null
  }
});

module.exports = mongoose.model('MensagemSuporte', MensagemSchema);
