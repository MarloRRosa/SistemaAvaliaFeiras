const mongoose = require('mongoose');

const CertificadoEmitidoSchema = new mongoose.Schema({

    escolaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Escola',
        required: true
    },

    feira: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Feira',
        required: true
    },

    modelo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ModeloCertificado',
        required: true
    },

    tipo: {
        type: String,
        enum: [
            'estudante',
            'orientador',
            'coorientador',
            'avaliador'
        ],
        required: true
    },

    nomeParticipante: {
        type: String,
        required: true,
        trim: true
    },

    projeto: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Projeto',
        default: null
    },

    avaliador: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Avaliador',
        default: null
    },

    categoria: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Categoria',
        default: null
    },

    turma: {
        type: String,
        default: ''
    },

    numeroEstande: {
        type: Number,
        default: null
    },

    codigoValidacao: {
        type: String,
        default: ''
    },

    arquivoUrl: {
        type: String,
        default: ''
    },

    emitidoEm: {
        type: Date,
        default: Date.now
    }

}, {
    timestamps: true
});


module.exports = mongoose.model(
    'CertificadoEmitido',
    CertificadoEmitidoSchema
);
