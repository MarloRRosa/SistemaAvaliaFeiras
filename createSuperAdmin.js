// createSuperAdmin.js
//
// Script manual para criar o primeiro Super Admin.
// Não contém e-mail, senha ou URI de banco fixos.
// Configure as variáveis de ambiente antes de executar.

require('dotenv').config();

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const SuperAdmin = require('./models/SuperAdmin');

async function createInitialSuperAdmin() {
    const {
        MONGO_URI,
        CREATE_SUPER_ADMIN,
        SUPER_ADMIN_EMAIL,
        SUPER_ADMIN_NAME,
        SUPER_ADMIN_PASSWORD
    } = process.env;

    // Exige confirmação explícita para evitar execução acidental.
    if (CREATE_SUPER_ADMIN !== 'true') {
        throw new Error(
            'Execução bloqueada. Defina CREATE_SUPER_ADMIN=true somente quando desejar criar um Super Admin.'
        );
    }

    if (!MONGO_URI) {
        throw new Error('MONGO_URI não está configurada.');
    }

    if (!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD) {
        throw new Error('Configure SUPER_ADMIN_EMAIL e SUPER_ADMIN_PASSWORD no ambiente.');
    }

    if (SUPER_ADMIN_PASSWORD.length < 12) {
        throw new Error('A senha deve ter pelo menos 12 caracteres.');
    }

    await mongoose.connect(MONGO_URI);

    const email = SUPER_ADMIN_EMAIL.trim().toLowerCase();
    const existingSuperAdmin = await SuperAdmin.findOne({ email });

    if (existingSuperAdmin) {
        console.log(`Já existe um Super Admin com o e-mail ${email}. Nenhuma alteração foi feita.`);
        return;
    }

    const hashedPassword = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 12);

    const newSuperAdmin = new SuperAdmin({
        nome: SUPER_ADMIN_NAME || 'Super Administrador',
        email,
        senha: hashedPassword
    });

    await newSuperAdmin.save();
    console.log(`Super Admin ${email} criado com sucesso.`);
}

createInitialSuperAdmin()
    .catch((error) => {
        console.error('Não foi possível criar o Super Admin:', error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
    });
