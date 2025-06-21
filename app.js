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
const isProduction = process.env.NODE_ENV === 'production';

// ========================================================================
// IMPORTANTE: Adicione as importações do Passport.js e dos modelos de usuário
// ========================================================================
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const SuperAdmin = require('./models/SuperAdmin'); // Importe seu modelo SuperAdmin
const Admin = require('./models/Admin');           // Importe seu modelo Admin
const Avaliador = require('./models/Avaliador');   // Importe seu modelo Avaliador
const bcrypt = require('bcryptjs'); // Para comparar senhas

// Importa a função auxiliar
const { formatarDatasParaInput } = require('./utils/helpers');

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
// Configuração da View Engine (EJS + Layouts)
// =====================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layouts/public');
app.set('trust proxy', 1);

// =====================
// Middlewares Essenciais
// =====================
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// =====================
// Configuração da Sessão
// (Mantenha esta seção antes do Passport.js)
// =====================
app.use(session({
    secret: process.env.SESSION_SECRET || 'sua-chave-secreta-de-desenvolvimento',
    resave: false,
    saveUninitialized: false,
    store: store,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000,  // 1 dia
        httpOnly: true,
        secure: isProduction,         // true em produção
        sameSite: isProduction ? 'none' : 'lax' // none com secure para evitar bloqueio do cookie
    }
}));

// ========================================================================
// NOVO: Configuração e Inicialização do Passport.js
// ========================================================================
app.use(passport.initialize());
app.use(passport.session());

// Estratégia de Autenticação Local para Super Admin
passport.use('superadmin-local', new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password'
},
async (email, password, done) => {
    try {
        const superadmin = await SuperAdmin.findOne({ email: email });
        if (!superadmin) {
            return done(null, false, { message: 'Este e-mail não está registrado como Super Admin.' });
        }

        const isMatch = await bcrypt.compare(password, superadmin.password);
        if (!isMatch) {
            return done(null, false, { message: 'Senha incorreta.' });
        }
        
        // Adiciona a propriedade 'role' ao objeto do usuário
        superadmin.role = 'superadmin'; 
        return done(null, superadmin); // Autenticação bem-sucedida
    } catch (err) {
        return done(err);
    }
}));

// Serialização do usuário (como o usuário é armazenado na sessão)
// Aqui precisamos armazenar o ID do usuário e o tipo (role) para desserializar corretamente
passport.serializeUser((user, done) => {
    // console.log('Serializando usuário:', user); // Para depuração
    done(null, { id: user.id, role: user.role });
});

// Desserialização do usuário (como o usuário é recuperado da sessão)
passport.deserializeUser(async (obj, done) => {
    // console.log('Desserializando usuário:', obj); // Para depuração
    try {
        let user = null;
        if (obj.role === 'superadmin') {
            user = await SuperAdmin.findById(obj.id);
        } else if (obj.role === 'admin') {
            user = await Admin.findById(obj.id);
        } else if (obj.role === 'avaliador') {
            user = await Avaliador.findById(obj.id);
        }

        if (user) {
            // Adicione a propriedade 'role' ao objeto user recuperado
            user.role = obj.role; 
            done(null, user);
        } else {
            done(null, false); // Usuário não encontrado
        }
    } catch (err) {
        done(err, null);
    }
});


// =====================
// Flash messages e variáveis globais
// =====================
app.use(flash());
app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.error = req.flash('error'); // Para erros do Passport.js
    
    // Agora req.user é populado pelo Passport.js
    res.locals.user = req.user || null; 
    res.locals.adminEscola = req.session.adminEscola || null; // Manter se ainda for usado para admins não-Passport
    
    // Atualiza a lógica de superadmin baseado no req.user do Passport
    res.locals.isSuperAdmin = (req.user && req.user.role === 'superadmin');
    
    next();
});

// =====================
// Outros Middlewares
// =====================
app.use(methodOverride('_method'));
app.use(expressLayouts);

// Funções auxiliares globais para templates
app.locals.formatarDatasParaInput = formatarDatasParaInput;

// =====================
// Rotas
// (Assegure que estas vêm DEPOIS da configuração do Passport.js)
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