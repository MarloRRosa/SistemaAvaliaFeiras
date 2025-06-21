const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const solicitacaoAcessoSchema = new Schema({
    nomeEscola: { type: String, required: true },
    cnpj: { type: String, required: false },
    endereco: { type: String, required: false },
    telefoneEscola: { type: String, required: false },

    nomeResponsavel: { type: String, required: true },
    cargoResponsavel: { type: String, required: false },
    emailContato: { type: String, required: true, unique: true, lowercase: true, trim: true },
    telefoneContato: { type: String, required: false },

    dataSolicitacao: { type: Date, default: Date.now },

    status: {
        type: String,
        enum: ['Pendente', 'Aprovada', 'Rejeitada'],
        default: 'Pendente'
    },
    dataProcessamento: { type: Date },
    processadoPor: { type: Schema.Types.ObjectId, ref: 'SuperAdmin' },

    // ✅ Novos campos adicionados:
    aceiteTermo: { type: Boolean, required: true, default: false },
    ipSolicitante: { type: String }
});

module.exports = mongoose.model('SolicitacaoAcesso', solicitacaoAcessoSchema);
