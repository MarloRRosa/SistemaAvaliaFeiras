const mongoose = require('mongoose');


// =====================================================
// ELEMENTOS DO CERTIFICADO
// =====================================================

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


    // Texto livre
    texto: {
        type: String,
        default: ''
    },


    // Campo automático:
    // nomeParticipante, nomeFeira, tituloProjeto etc.
    campo: {
        type: String,
        default: ''
    },


    // Imagens, logos e assinaturas
    url: {
        type: String,
        default: ''
    },


    // =================================================
    // POSIÇÃO
    // =================================================

    x: {
        type: Number,
        default: 0
    },

    y: {
        type: Number,
        default: 0
    },


    // =================================================
    // TAMANHO
    // =================================================

    largura: {
        type: Number,
        default: 200
    },

    altura: {
        type: Number,
        default: 50
    },


    // =================================================
    // CONFIGURAÇÃO VISUAL
    // =================================================

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
        enum: [
            'left',
            'center',
            'right'
        ],
        default: 'center'
    },

    cor: {
        type: String,
        default: '#000000'
    },


    // Ordem de sobreposição dos elementos
    ordem: {
        type: Number,
        default: 0
    }

}, {
    _id: true
});


// =====================================================
// MODELO DO CERTIFICADO
// =====================================================

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


    // =================================================
    // CONFIGURAÇÃO DA PÁGINA
    // =================================================

    orientacao: {
        type: String,
        enum: [
            'paisagem',
            'retrato'
        ],
        default: 'paisagem'
    },


    tamanhoPagina: {
        type: String,
        enum: ['A4'],
        default: 'A4'
    },


    // =================================================
    // FUNDO DO CERTIFICADO
    // =================================================

    fundoUrl: {
        type: String,
        default: ''
    },


    // Identificador da imagem no Cloudinary.
    // Será utilizado para substituir/remover o fundo.
    fundoPublicId: {
        type: String,
        default: ''
    },


    // Como a imagem deve ocupar a folha
    ajusteFundo: {
        type: String,
        enum: [
            'cobrir',
            'conter',
            'esticar'
        ],
        default: 'cobrir'
    },


    // =================================================
    // ELEMENTOS VISUAIS
    // =================================================

    elementos: [
        ElementoCertificadoSchema
    ],


    // =================================================
    // STATUS
    // =================================================

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
