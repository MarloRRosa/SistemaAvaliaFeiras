const mongoose = require('mongoose');

const ElementoCertificadoSchema = new mongoose.Schema({
    tipo: {
        type: String,
        enum: [
            'texto',
            'campo',
            'imagem',
            'assinatura',
            'qrcode'
        ],
        required: true
    },

    // Para elementos de texto normal
    texto: {
        type: String,
        default: ''
    },

    // Para campos automáticos, ex:
    // nomeParticipante, nomeFeira, tituloProjeto...
    campo: {
        type: String,
        default: ''
    },

    // Para imagens/logos/assinaturas
    url: {
        type: String,
        default: ''
    },

    // Posição e tamanho no certificado
    x: {
        type: Number,
        default: 0
    },

    y: {
        type: Number,
        default: 0
    },

    largura: {
        type: Number,
        default: 200
    },

    altura: {
        type: Number,
        default: 50
    },

    // Configurações visuais
    fonte: {
        type: String,
        default: 'Arial'
    },

    tamanhoFonte: {
        type: Number,
        default: 24
    },

    negrito: {
        type: Boolean,
        default: false
    },

    italico: {
        type: Boolean,
        default: false
    },

    alinhamento: {
        type: String,
        enum: ['left', 'center', 'right'],
        default: 'center'
    },

    cor: {
        type: String,
        default: '#000000'
    },

    ordem: {
        type: Number,
        default: 0
    }
}, {
    _id: true
});


const ModeloCertificadoSchema = new mongoose.Schema({

    nome: {
        type: String,
        required: true,
        trim: true
    },

    tipo: {
        type: String,
        enum: [
            'estudante',
            'orientador',
            'coorientador',
            'avaliador',
            'geral'
        ],
        required: true
    },

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

    orientacao: {
        type: String,
        enum: ['paisagem', 'retrato'],
        default: 'paisagem'
    },

    tamanhoPagina: {
        type: String,
        enum: ['A4'],
        default: 'A4'
    },

    fundoUrl: {
        type: String,
        default: ''
    },

    elementos: [
        ElementoCertificadoSchema
    ],

    ativo: {
        type: Boolean,
        default: true
    },

    dataCadastro: {
        type: Date,
        default: Date.now
    }

}, {
    timestamps: true
});


module.exports = mongoose.model(
    'ModeloCertificado',
    ModeloCertificadoSchema
);
