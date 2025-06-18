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
