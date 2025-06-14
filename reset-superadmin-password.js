// reset-superadmin-password.js
// Este script deve ser executado *fora* do seu aplicativo Express principal.
// Exemplo de uso: node reset-superadmin-password.js

require('dotenv').config(); // Carrega variáveis de ambiente do .env

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Importe o modelo SuperAdmin (ajuste o caminho se necessário)
const SuperAdmin = require('./models/SuperAdmin'); 

// --- CONFIGURAÇÃO ---
// E-mail do Super Admin cuja senha você quer alterar
const superAdminEmail = 'docsrosas@gmail.com.br'; 
// A NOVA senha que você deseja definir
const novaSenha = 'Senh@302630'; 
// URL de conexão com o MongoDB. Use a variável de ambiente (recomendado)
// ou substitua por sua string de conexão direta.
const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/avaliafeiras'; 
// --------------------

async function resetSuperAdminPassword() {
    try {
        // Conectar ao banco de dados
        await mongoose.connect(mongoURI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            // useCreateIndex: true, // mongoose 6+ não precisa mais
            // useFindAndModify: false // mongoose 6+ não precisa mais
        });
        console.log('Conectado ao MongoDB.');

        // Encontrar o Super Admin pelo e-mail (garante que está em minúsculas para a busca)
        const superAdmin = await SuperAdmin.findOne({ email: superAdminEmail.toLowerCase() });

        if (!superAdmin) {
            console.error(`Super Admin com o e-mail "${superAdminEmail}" não encontrado.`);
            return;
        }

        // Gerar o hash da nova senha
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(novaSenha, salt);

        // Atualizar a senha do Super Admin no banco de dados
        superAdmin.senha = hashedPassword;
        await superAdmin.save();

        console.log(`Senha do Super Admin "${superAdmin.email}" alterada com sucesso para: "${novaSenha}"`);
        console.log('Por favor, anote esta senha e mantenha-a segura.');

    } catch (err) {
        console.error('Erro ao redefinir a senha do Super Admin:', err);
    } finally {
        // Desconectar do banco de dados
        await mongoose.disconnect();
        console.log('Desconectado do MongoDB.');
    }
}

// Executar a função
resetSuperAdminPassword();
