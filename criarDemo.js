// criarDemo.js
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Usuario = require('./models/Usuario'); 

async function criarUsuarioDemo() {
  try {
    // Conecte ao seu MongoDB (ajuste a URI conforme seu ambiente)
    await mongoose.connect('mongodb://127.0.0.1:27017/avaliafeiras', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    const emailDemo = 'demo@seudominio.com';

    // Verifica se já existe o usuário demo
    const existente = await Usuario.findOne({ email: emailDemo });
    if (existente) {
      console.log('Usuário demo já existe no banco.');
      process.exit(0);
    }

    const senha = 'demo123';
    const senhaCriptografada = await bcrypt.hash(senha, 10);

    const demoUser = new Usuario({
      nome: 'Usuário Demonstração',
      email: emailDemo,
      senha: senhaCriptografada,
      tipo: 'demo',
      ativo: true,
    });

    await demoUser.save();
    console.log('Usuário demo criado com sucesso!');
    process.exit(0);
  } catch (err) {
    console.error('Erro ao criar usuário demo:', err);
    process.exit(1);
  }
}

criarUsuarioDemo();
