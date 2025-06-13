// models/SuperAdmin.js

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // Importa o bcryptjs para criptografar senhas

// Define o esquema do SuperAdmin
const SuperAdminSchema = new mongoose.Schema({
    nome: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true, // O email deve ser único para cada Super Admin
        trim: true,
        lowercase: true // Armazena o email em minúsculas
    },
    senha: { // O nome do campo é 'senha', conforme seu script
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now // Data de criação do Super Admin
    }
});

// --- NOVO: Middleware para criptografar a senha antes de salvar ---
// Este hook 'pre' será executado ANTES que um documento seja salvo no banco
SuperAdminSchema.pre('save', async function(next) {
    // Verifica se a senha foi modificada (ou se é um novo documento)
    // Se não foi modificada, não há necessidade de criptografar novamente
    if (!this.isModified('senha')) {
        return next();
    }
    try {
        // Gera um salt (valor aleatório) para a criptografia.
        // O custo de trabalho (10) define o quão intensivo o processo de hash será.
        const salt = await bcrypt.genSalt(10);
        // Criptografa a senha usando o salt gerado.
        this.senha = await bcrypt.hash(this.senha, salt);
        next(); // Chama 'next()' para prosseguir com a operação de salvamento.
    } catch (err) {
        // Em caso de erro durante a criptografia, passa o erro para o próximo middleware.
        next(err);
    }
});

// --- NOVO: Método de instância para comparar a senha fornecida com a senha criptografada ---
// Este método será acessível em qualquer instância de SuperAdmin
// (ex: superAdmin.comparePassword('minhasenha'))
SuperAdminSchema.methods.comparePassword = async function(candidatePassword) {
    // Compara a senha fornecida (candidatePassword) com a senha hash armazenada no banco (this.senha).
    // Retorna true se as senhas coincidirem, false caso contrário.
    return bcrypt.compare(candidatePassword, this.senha);
};

// Exporta o modelo SuperAdmin
module.exports = mongoose.model('SuperAdmin', SuperAdminSchema);
