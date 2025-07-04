//models/Escola.js
const mongoose = require('mongoose');

const escolaSchema = new mongoose.Schema({
    nome: { 
        type: String, 
        required: true, 
        unique: true // Nome da escola deve ser único
    },
    // Removidos: 'usuario' e 'senha' - serão gerenciados pelo modelo Admin.

    cnpj: { 
        type: String, 
        unique: true, 
        sparse: true // `sparse: true` permite que haja múltiplos documentos sem CNPJ ou com CNPJ null, mas enforce uniqueness para valores não-null.
    },
    endereco: { 
        type: String 
    },
    telefone: { 
        type: String 
    },

    ativa: { 
        type: Boolean, 
        default: true 
    },
    criadaEm: { 
        type: Date, 
        default: Date.now 
    },

    // 🔽 Campos para a feira atual (mantidos)
    nomeFeira: { 
        type: String, 
        default: 'Feira de Ciências' 
    },
    inicioFeira: { 
        type: Date 
    },
    fimFeira: { 
        type: Date 
    },
    status: { 
        type: String, 
        enum: ['ativa', 'arquivada'], 
        default: 'ativa' 
    },
    arquivadaEm: { 
        type: Date 
    },
    logo: {
  type: String
}
});

module.exports = mongoose.model('Escola', escolaSchema);