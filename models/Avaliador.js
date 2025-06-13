const mongoose = require('mongoose');

const AvaliadorSchema = new mongoose.Schema({
    nome: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    pin: {
        type: String,
        required: true,
        unique: true,
        minlength: 4,
        maxlength: 6
    },
    ativo: {
        type: Boolean,
        default: true
    },
    escolaId: { // AGORA OBRIGATÓRIO e PADRONIZADO para 'escolaId'
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Escola',
        required: true // TORNADO OBRIGATÓRIO
    },
    feira: { // AGORA OBRIGATÓRIO para a feira ativa
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Feira',
        required: true // TORNADO OBRIGATÓRIO
    },
    projetosAtribuidos: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Projeto'
    }],
    dataCadastro: {
        type: Date,
        default: Date.now
    }
});

const Avaliador = mongoose.model('Avaliador', AvaliadorSchema);

module.exports = Avaliador;
