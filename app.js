const express = require('express');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const mongoose = require('mongoose');
const flash = require('connect-flash');
const path = require('path');
require('dotenv').config();

const bcrypt = require('bcryptjs');
const SuperAdmin = require('./models/SuperAdmin');
const { formatarDatasParaInput } = require('./utils/helpers');

const app = express();

// =====================
// Conexão com MongoDB
// =====================
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/avaliafeiras')
    .then(() => console.log('🟢 MongoDB conectado com sucesso!'))
    .catch(err => console.error('🔴 Erro ao conectar ao MongoDB:', err));

// =====================
// Configuração de View Engine
// =====================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layouts/public');

// =====================
// Middlewares
// =====================
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret: process.env.SESSION_SECRET || 'sua-chave-secreta-de-desenvolvimento',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production'
    }
}));

app.use(flash());

app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.error = req.flash('error');
    res.locals.adminEscola = req.session.adminEscola || null;
    res.locals.isSuperAdmin = !!req.session.superAdminId;
    next();
});

const methodOverride = require('method-override');
app.use(methodOverride('_method'));

app.use(expressLayouts);

app.locals.formatarDatasParaInput = formatarDatasParaInput;

// =====================
// Rotas
// =====================
const publicRoutes = require('./routes/public');
const superadminRoutes = require('./routes/superadmin');
const adminRoutes = require('./routes/admin');
const avaliadorRoutes = require('./routes/avaliador');

app.use('/', publicRoutes);
app.use('/superadmin', superadminRoutes);
app.use('/admin', adminRoutes);
app.use('/avaliador', avaliadorRoutes);

// =====================
// Inicialização do Servidor
// =====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT} (${process.env.NODE_ENV || 'development'} mode)`);
    criarSuperAdminInicial(); // ← Cria superadmin se não existir
});

// =====================
// Criador de SuperAdmin inicial
// =====================
async function criarSuperAdminInicial() {
    try {
        const existente = await SuperAdmin.findOne({ email: 'docsrosas@gmail.com' });
        if (!existente) {
            const senhaCriptografada = await bcrypt.hash('Senh@302630', 10);
            await SuperAdmin.create({
                nome: 'Super Administrador',
                email: 'docsrosas@gmail.com',
                senha: senhaCriptografada
            });
            console.log('✅ SuperAdmin criado: docsrosas@gmail.com / Senh@302630');
        } else {
            console.log('ℹ️ SuperAdmin já existe.');
        }
    } catch (err) {
        console.error('❌ Erro ao criar SuperAdmin inicial:', err);
    }
}
