const mongoose = require('mongoose');

const CategoriaSchema = new mongoose.Schema({
    nome: {
        type: String,
        required: true
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

const Categoria = mongoose.model('Categoria', CategoriaSchema);

module.exports = Categoria;