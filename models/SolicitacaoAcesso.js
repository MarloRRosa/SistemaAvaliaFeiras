// models/SolicitacaoAcesso.js

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const solicitacaoAcessoSchema = new Schema({
    nomeEscola: { type: String, required: true },
    cnpj: { type: String, required: false },
    endereco: { type: String, required: false },
    telefoneEscola: { type: String, required: false }, // Telefone da escola

    nomeResponsavel: { type: String, required: true },
    cargoResponsavel: { type: String, required: false },
    emailContato: { type: String, required: true, unique: true, lowercase: true, trim: true },
    telefoneContato: { type: String, required: false }, // Telefone de contato do responsável

    dataSolicitacao: { type: Date, default: Date.now },
    status: {
        type: String,
        enum: ['Pendente', 'Aprovada', 'Rejeitada'], // Corrigido para 'Aprovada' e 'Rejeitada' com maiúsculas
        default: 'Pendente'
    },
    dataProcessamento: { type: Date },
    processadoPor: { type: Schema.Types.ObjectId, ref: 'SuperAdmin' } // Opcional: quem processou
});

module.exports = mongoose.model('SolicitacaoAcesso', solicitacaoAcessoSchema);