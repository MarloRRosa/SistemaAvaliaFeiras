const mongoose = require('mongoose');

const FeiraSchema = new mongoose.Schema({
    nome: {
        type: String,
        required: true
    },
    escolaId: { // NOME DO CAMPO ALTERADO PARA 'escolaId' para padronização
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Escola',
        required: true
    },
    status: { // 'ativa' ou 'arquivada'
        type: String,
        enum: ['ativa', 'arquivada'],
        default: 'ativa'
    },
    criadaEm: {
        type: Date,
        default: Date.now
    },
    inicioFeira: { // Data de início da feira
        type: Date,
        default: null
    },
    fimFeira: { // Data de término da feira
        type: Date,
        default: null
    },
    // Você pode adicionar mais campos aqui, se necessário (ex: tema, local)
});

const Feira = mongoose.model('Feira', FeiraSchema);

module.exports = Feira;
