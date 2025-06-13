// createSuperAdmin.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const SuperAdmin = require('./models/SuperAdmin'); // Ajuste o caminho se seu modelo SuperAdmin estiver em outro local
require('dotenv').config(); // Para carregar a variável de ambiente MONGO_URI, se estiver usando

// Conecte ao seu banco de dados
// Use a mesma MONGO_URI do seu app.js, preferencialmente via process.env
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/avaliafeiras', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('🟢 MongoDB Conectado para script!'))
.catch(err => console.error('🔴 Erro ao conectar ao MongoDB para script:', err));

async function createInitialSuperAdmin() {
    try {
        const emailSuperAdmin = 'docsrosas@gmail.com';
        const senhaSuperAdmin = 'Senh@302630';

        const existingSuperAdmin = await SuperAdmin.findOne({ email: emailSuperAdmin });
        if (existingSuperAdmin) {
            console.log(`⚠️ Super Admin com o e-mail "${emailSuperAdmin}" já existe. Nenhum novo Super Admin foi criado.`);
            mongoose.connection.close();
            return;
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(senhaSuperAdmin, salt);

        const newSuperAdmin = new SuperAdmin({
            nome: 'Super Administrador Principal', // Você pode dar um nome para o Super Admin
            email: emailSuperAdmin,
            senha: hashedPassword
        });

        await newSuperAdmin.save();
        console.log(`✅ Super Admin inicial com o e-mail "${emailSuperAdmin}" criado com sucesso!`);
    } catch (error) {
        console.error('❌ Erro ao criar Super Admin inicial:', error);
    } finally {
        // Certifique-se de fechar a conexão após a operação
        mongoose.connection.close();
    }
}

createInitialSuperAdmin();