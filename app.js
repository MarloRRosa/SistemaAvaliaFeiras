const express = require('express');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const mongoose = require('mongoose');
const flash = require('connect-flash');
const path = require('path');
require('dotenv').config(); // <-- ADICIONADO: Carrega variáveis de ambiente do .env no início

// Importa a função auxiliar
const { formatarDatasParaInput } = require('./utils/helpers');

const app = express();

// =====================
// Conexão com MongoDB
// =====================
// Usar variável de ambiente para a URI do MongoDB (MUITO IMPORTANTE para produção!)
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/avaliafeiras')
    .then(() => console.log('🟢 MongoDB conectado com sucesso!')) // Mensagem mais descritiva
    .catch(err => console.error('🔴 Erro ao conectar ao MongoDB:', err));

// =====================
// Configuração de View Engine (EJS + Layouts)
// =====================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
// Define o layout padrão. O 'layouts/public' deve existir na sua pasta 'views'.
app.set('layout', 'layouts/public');

// =====================
// Middlewares Essenciais e de Sessão (Ordem Importa!)
// =====================

// Serve arquivos estáticos (CSS, JS, imagens) - COLOCADO MAIS PARA CIMA
// É uma boa prática servir arquivos estáticos o mais cedo possível para não passar por outros middlewares.
app.use(express.static(path.join(__dirname, 'public')));

// Body Parser para lidar com dados de formulário (DEVE VIR ANTES DAS ROTAS)
app.use(express.urlencoded({ extended: true })); // Para dados de formulário HTML
app.use(express.json()); // Para dados JSON (se for usar APIs REST, por exemplo)

// Configuração da Sessão (DEVE VIR ANTES DO FLASH E DAS ROTAS QUE USAM SESSÃO)
app.use(session({
    secret: process.env.SESSION_SECRET || 'sua-chave-secreta-de-desenvolvimento', // <-- USANDO VARIÁVEL DE AMBIENTE
    resave: false, // Geralmente 'false' para evitar salvar a sessão se ela não foi modificada
    saveUninitialized: false, // Geralmente 'false' para evitar criar sessões vazias para cada visitante
    cookie: { 
        maxAge: 24 * 60 * 60 * 1000, // 24 horas
        httpOnly: true, // Garante que o cookie não pode ser acessado via JavaScript do cliente
        secure: process.env.NODE_ENV === 'production' // Apenas envia cookie sobre HTTPS em produção
    }
}));

// Configuração do Connect-Flash (DEVE VIR DEPOIS DA SESSÃO)
app.use(flash());

// Middleware para passar mensagens flash e dados do usuário para as views (DEVE VIR DEPOIS DO FLASH)
app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.error = req.flash('error');
    
    // Passa o objeto do admin da escola, se logado
    res.locals.adminEscola = req.session.adminEscola || null;
    
    // Ajuste aqui: Passa um booleano indicando se o Super Admin está logado
    // Verifica se req.session.superAdminId existe, que é o que o superadmin.js agora define
    res.locals.isSuperAdmin = !!req.session.superAdminId; // true se superAdminId existe, false caso contrário
    
    next();
});

const methodOverride = require('method-override');
app.use(methodOverride('_method'));


// Usa express-ejs-layouts (geralmente antes das rotas, após a configuração do view engine e static files)
app.use(expressLayouts);

// =====================
// Adiciona funções auxiliares para serem usadas em templates (app.locals)
// =====================
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
// Rota para a raiz (melhor ter uma página inicial real aqui)
// =====================
// Se sua rota '/' em public.js já renderiza o index, você pode remover esta.
// Se não, é bom ter um fallback ou um redirecionamento claro.
// Exemplo: se public.js cuida de '/', remova esta.
// Se public.js NÃO cuida de '/', então:
// app.get('/', (req, res) => {
//     res.render('index', { titulo: 'Bem-vindo ao AvaliaFeiras' }); // Renderiza sua página inicial pública
// });


// =====================
// Inicialização do Servidor
// =====================
const PORT = process.env.PORT || 3000; // Usa a porta do ambiente ou 3000
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT} (${process.env.NODE_ENV || 'development'} mode)`);
});