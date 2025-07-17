// models/Projeto.js
const mongoose = require('mongoose');

const ProjetoSchema = new mongoose.Schema({
    titulo: {
        type: String,
        required: true
    },
    descricao: {
        type: String
    },
    turma: {
        type: String
    },
    alunos: [{
        type: String
    }],
    orientador: {
        type: String,
        required: true
    },
    coorientador: {
        type: String,
        default: ''
    },
    categoria: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Categoria'
    },
    criterios: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Criterio'
    }],
    feira: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Feira',
        required: true
    },
    escolaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Escola',
        required: true
    },
    avaliadores: [{ 
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Avaliador'
    }],
    dataCadastro: {
        type: Date,
        default: Date.now
    },
    relatorioPdf: {
        type: String,
        required: false
    }
});

const Projeto = mongoose.model('Projeto', ProjetoSchema);

module.exports = Projeto;
