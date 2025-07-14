//models/SolicitacaoAcesso
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const solicitacaoAcessoSchema = new Schema({
  nomeEscola: { type: String, required: true },
  cnpj: { type: String },
  endereco: { type: String },
  telefoneEscola: { type: String },

  nomeResponsavel: { type: String, required: true },
  cargoResponsavel: { type: String },
  emailContato: { type: String, required: true, lowercase: true, trim: true },
  telefoneContato: { type: String },

  tipoEvento: { type: String },
  previsaoUso: { type: String },
  mensagem: { type: String },

  dataSolicitacao: { type: Date, default: Date.now },

  status: {
    type: String,
    enum: ['Pendente', 'Aprovada', 'Rejeitada'],
    default: 'Pendente'
  },
  dataProcessamento: { type: Date },
  processadoPor: { type: Schema.Types.ObjectId, ref: 'SuperAdmin' },

  // ✅ Subdocumento completo de aceite
  registroAceite: {
    aceite: { type: Boolean, required: true, default: false },
    ip: { type: String },
    dataHora: { type: Date }
  }
});

module.exports = mongoose.model('SolicitacaoAcesso', solicitacaoAcessoSchema);
