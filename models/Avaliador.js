// models/Avaliador.js
const mongoose = require('mongoose');

const AvaliadorSchema = new mongoose.Schema({
  nome: { type: String, required: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  pin: { type: String, required: true, minlength: 4, maxlength: 6 },
  ativo: { type: Boolean, default: true },
  projetosAtribuidos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Projeto' }],
  escolaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Escola', required: true },
  feira: { type: mongoose.Schema.Types.ObjectId, ref: 'Feira', required: true },
  dataCadastro: { type: Date, default: Date.now },
  qrcode: { type: String },
  criadoVia: { type: String, enum: ['manual', 'pre-cadastro'], default: 'manual' },
  extras: { type: mongoose.Schema.Types.Mixed }
});

AvaliadorSchema.index(
  { email: 1, escolaId: 1, feira: 1 },
  { unique: true, name: 'uniq_email_escola_feira' }
);

AvaliadorSchema.index(
  { pin: 1 },
  { unique: true, name: 'uniq_pin' }
);

module.exports = mongoose.model('Avaliador', AvaliadorSchema);
