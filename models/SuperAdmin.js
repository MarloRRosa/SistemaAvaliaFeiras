// models/SuperAdmin.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const SuperAdminSchema = new Schema({
    nome: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        //unique: true, // Garante que cada e-mail de Super Admin seja único
        lowercase: true, // Armazena o e-mail em minúsculas
        trim: true // Remove espaços em branco antes e depois
    },
    senha: {
        type: String,
        required: true
    },
    dataCriacao: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('SuperAdmin', SuperAdminSchema);
