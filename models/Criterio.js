const mongoose = require('mongoose');

const CriterioSchema = new mongoose.Schema({
    nome: {
        type: String,
        required: true
    },
    peso: {
        type: Number,
        required: true,
        min: 1
    },
    observacao: {
        type: String
    },
    categoriaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Categoria',
        default: null
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
    ordemDesempate: {
        type: Number, // 0 = não será usado para desempate, 1 = maior prioridade, etc.
        default: 0
    },
    dataCadastro: {
        type: Date,
        default: Date.now
    }
});

const Criterio = mongoose.model('Criterio', CriterioSchema);

module.exports = Criterio;
