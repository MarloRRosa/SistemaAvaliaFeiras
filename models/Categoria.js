const mongoose = require('mongoose');

const CategoriaSchema = new mongoose.Schema({
    nome: {
        type: String,
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
    dataCadastro: {
        type: Date,
        default: Date.now
    }
});

const Categoria = mongoose.model('Categoria', CategoriaSchema);

module.exports = Categoria;