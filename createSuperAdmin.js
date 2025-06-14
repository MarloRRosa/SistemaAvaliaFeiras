// createSuperAdmin.js

// 1. Importa os módulos necessários NO INÍCIO DO ARQUIVO
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
// 2. Importa o modelo SuperAdmin (verifique o caminho, './models/SuperAdmin' é comum)
const SuperAdmin = require('./models/SuperAdmin');
// Para carregar variáveis de ambiente do .env, caso você precise, mas não será usado para MONGO_URI agora.
require('dotenv').config();

// *** AQUI VAI A SUA URI COMPLETA E CORRETA DO MONGODB ATLAS, AGORA COM '/avaliacoes'! ***
// IMPORTANTE: REMOVA ESTA LINHA COM A URI DIRETA APÓS A EXECUÇÃO BEM-SUCEDIDA POR SEGURANÇA!
const mongoAtlasURI = 'mongodb+srv://marlorosa:Smgd2BOswZg1w1e0@cluster0.2t2gywk.mongodb.net/avaliacoes?retryWrites=true&w=majority&appName=Cluster0';

// 3. Conecta ao banco de dados ANTES da função principal
// O `.then()` e `.catch()` são para a conexão inicial do script
mongoose.connect(mongoAtlasURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => {
    // Mensagem de console atualizada para indicar a base de dados
    console.log('🟢 MongoDB Atlas Conectado para script na base de dados "avaliacoes"!');
    // Se a conexão for bem-sucedida, então chamamos a função para criar o Super Admin
    createInitialSuperAdmin();
})
.catch(err => {
    console.error('🔴 Erro ao conectar ao MongoDB Atlas para script:', err);
    process.exit(1); // Sai do script se houver erro de conexão
});

// A função principal para criar o Super Admin
async function createInitialSuperAdmin() {
    try {
        // E-mail do seu Super Admin (use o que você quer no Atlas)
        const emailSuperAdmin = 'docsrosas@gmail.com'; 
        // Você pode mudar o e-mail para algo como 'superadmin.teste.novo@gmail.com'
        // se quiser garantir que uma nova entrada seja criada, mesmo que 'docsrosas@gmail.com'
        // já esteja em outra base de dados (ex: 'test')

        // *** MUITO IMPORTANTE: Mude esta senha para uma SENHA FORTE e ANOTE-A! ***
        const senhaSuperAdmin = 'Senh@302630'; 
        
        // Verifica se o Super Admin já existe na base de dados 'avaliacoes'
        const existingSuperAdmin = await SuperAdmin.findOne({ email: emailSuperAdmin });

        if (existingSuperAdmin) {
            console.log(`⚠️ Super Admin com o e-mail "${emailSuperAdmin}" já existe na base de dados "avaliacoes". Nenhuma criação necessária.`);
        } else {
            // Criptografa a senha antes de salvar
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(senhaSuperAdmin, salt);

            // Cria uma nova instância do modelo SuperAdmin
            const newSuperAdmin = new SuperAdmin({
                nome: 'Super Administrador Principal',
                email: emailSuperAdmin,
                senha: hashedPassword // Salva a senha criptografada
            });

            // Salva o novo Super Admin no banco de dados
            await newSuperAdmin.save();
            console.log(`✅ Super Admin inicial com o e-mail "${emailSuperAdmin}" criado com sucesso na base de dados "avaliacoes"!`);
        }
    } catch (error) {
        console.error('❌ Erro ao criar Super Admin inicial no Atlas:', error);
    } finally {
        // 4. Garante que a conexão seja fechada APÓS TODAS AS OPERAÇÕES
        if (mongoose.connection.readyState === 1) { // Verifica se a conexão está aberta
            await mongoose.connection.close();
            console.log('Desconectado do MongoDB Atlas.');
        }
    }
}
