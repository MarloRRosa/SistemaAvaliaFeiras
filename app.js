const express = require('express');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const mongoose = require('mongoose');
const flash = require('connect-flash');
const path = require('path');
const MongoDBStore = require('connect-mongodb-session')(session); // <--- NOVO: Importa e inicializa o MongoDBStore
require('dotenv').config();

// Importa a função auxiliar (se for usada)
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
    uri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/avaliafeiras', // Use a mesma URI do seu app
    collection: 'sessions', // Nome da coleção onde as sessões serão armazenadas no MongoDB
    expires: 1000 * 60 * 60 * 24 // Sessões expiram em 24 horas (opcional, mas boa prática)
});

// Captura erros do session store
store.on('error', function(error) {
    console.error('Erro no MongoDB Session Store:', error);
});

// =====================
// Configuração de View Engine (EJS + Layouts)
// =====================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layouts/public');

// =====================
// Middlewares Essenciais e de Sessão (Ordem Importa!)
// =====================

// Serve arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Body Parser para lidar com dados de formulário
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Configuração da Sessão (AGORA USANDO O MongoDBStore)
app.use(session({
    secret: process.env.SESSION_SECRET || 'sua-chave-secreta-de-desenvolvimento',
    resave: false,
    saveUninitialized: false,
    store: store, // <--- NOVO: Usa o MongoDBStore configurado
    cookie: { 
        maxAge: 24 * 60 * 60 * 1000, // 24 horas
        httpOnly: true, // Garante que o cookie não pode ser acessado via JavaScript do cliente
        secure: process.env.NODE_ENV === 'production' // Apenas envia cookie sobre HTTPS em produção
    }
}));

// Configuração do Connect-Flash
app.use(flash());

// Middleware para passar mensagens flash e dados do usuário para as views
app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.error = req.flash('error');
    
    // Passa o objeto do admin da escola, se logado
    res.locals.adminEscola = req.session.adminEscola || null;
    
    // Ajuste aqui: Passa um booleano indicando se o Super Admin está logado
    res.locals.isSuperAdmin = !!req.session.superAdminId;
    
    next();
});

const methodOverride = require('method-override');
app.use(methodOverride('_method'));

// Usa express-ejs-layouts
app.use(expressLayouts);

// Adiciona funções auxiliares para serem usadas em templates (app.locals)
app.locals.formatarDatasParaInput = formatarDatasParaInput;

// =====================
// Rotas
// =====================
const publicRoutes = require('./routes/public');
const superadminRoutes = require('./routes/superadmin');
const adminRoutes = require('./routes/admin');
const avaliadorRoutes = require('./routes/avaliador'); 

// Rotas principais
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
