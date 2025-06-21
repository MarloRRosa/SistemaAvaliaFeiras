// app.js
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const mongoose = require('mongoose');
const flash = require('connect-flash');
const path = require('path');
const MongoDBStore = require('connect-mongodb-session')(session);
const methodOverride = require('method-override');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const rateLimit = require('express-rate-limit');

const isProduction = process.env.NODE_ENV === 'production';

const app = express();

// =====================
// Conexão com MongoDB
// =====================
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/avaliafeiras')
    .then(() => console.log('🟢 MongoDB conectado com sucesso!'))
    .catch(err => console.error('🔴 Erro ao conectar ao MongoDB:', err));

// =====================
// Configuração do MongoDB Session Store
// =====================
const store = new MongoDBStore({
    uri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/avaliafeiras',
    collection: 'sessions',
    expires: 1000 * 60 * 60 * 24
});

store.on('error', function(error) {
    console.error('Erro no MongoDB Session Store:', error);
});

// =====================
// Segurança e Middlewares Globais
// =====================
app.use(helmet());                // Segurança de headers HTTP
app.use(mongoSanitize());        // Previne NoSQL injection
app.use(xss());                  // Previne XSS
app.set('trust proxy', 1);       // Necessário para Render (HTTPS)

// Redireciona HTTP para HTTPS em produção
if (isProduction) {
    app.use((req, res, next) => {
        if (req.headers['x-forwarded-proto'] !== 'https') {
            return res.redirect(`https://${req.headers.host}${req.url}`);
        }
        next();
    });
}

// Limita número de requisições no formulário de acesso
const accessLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10,
    message: 'Muitas tentativas. Tente novamente mais tarde.'
});
app.use('/solicitar-acesso', accessLimiter);

// =====================
// Configuração da View Engine (EJS + Layouts)
// =====================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layouts/public');

// =====================
// Middlewares Essenciais
// =====================
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(expressLayouts);

// =====================
// Sessão
// =====================
app.use(session({
    secret: process.env.SESSION_SECRET || 'sua-chave-secreta-de-desenvolvimento',
    resave: false,
    saveUninitialized: false,
    store: store,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000,  // 1 dia
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'none' : 'lax'
    }
}));

// =====================
// Flash messages e variáveis globais
// =====================
app.use(flash());
app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.error = req.flash('error');
    res.locals.adminEscola = req.session.adminEscola || null;
    res.locals.isSuperAdmin = !!req.session.superAdminId;
    next();
});

// =====================
// Funções auxiliares globais
// =====================
const { formatarDatasParaInput } = require('./utils/helpers');
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
});
