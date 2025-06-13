const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const AdminSchema = new Schema({
    nome: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true, // E-mail deve ser único para recuperação de senha e para cada admin
        lowercase: true, // Garante que o email seja salvo em minúsculas
        trim: true // Remove espaços em branco antes/depois
    },
    senha: {
        type: String,
        required: true
    },
    // Campo que associa este administrador a uma escola específica (AGORA 'escolaId')
    escolaId: { // NOME DO CAMPO ALTERADO PARA 'escolaId' para padronização
        type: Schema.Types.ObjectId, // O tipo é ObjectId
        ref: 'Escola',              // Faz referência ao modelo 'Escola'
        required: true              // Um admin deve sempre estar associado a uma escola
    },
    // 🔽 NOVOS CAMPOS: Cargo e Telefone do Responsável
    cargo: {
        type: String // Cargo do responsável pela escola
    },
    telefone: {
        type: String // Telefone de contato do responsável pela escola
    },
    // Campos para recuperação de senha
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    dataCadastro: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Admin', AdminSchema);
