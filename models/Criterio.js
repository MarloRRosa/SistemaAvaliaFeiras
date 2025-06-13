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
    categoriaId: { // Opcional: Critério pode pertencer a uma categoria específica
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Categoria',
        default: null
    },
    escolaId: { // Mantenha se ainda for útil para alguma query global
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Escola',
        required: true
    },
    feira: { // NOVO CAMPO: Referência à Feira
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Feira',
        required: true
    },
    dataCadastro: {
        type: Date,
        default: Date.now
    }
});

const Criterio = mongoose.model('Criterio', CriterioSchema);

module.exports = Criterio;