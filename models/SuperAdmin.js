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
        unique: true,
        lowercase: true,
        trim: true
    },
    senha: {
        type: String,
        required: true
    },
    // Adicione outros campos se necessário, como created_at
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('SuperAdmin', SuperAdminSchema);