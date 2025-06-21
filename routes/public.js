// routes/public.js

const express = require('express');
const router = express.Router();
const SolicitacaoAcesso = require('../models/SolicitacaoAcesso');
const nodemailer = require('nodemailer');
require('dotenv').config();

// Configuração do Nodemailer (mantenha como está)
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT, 10),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// GET para a página inicial (mantenha como está)
router.get('/', (req, res) => {
    res.render('index', { titulo: 'Bem-vindo ao AvaliaFeiras', layout: 'layouts/public' });
});

// ====================================================================================
// AJUSTE AQUI: Rota GET para exibir o formulário de solicitação de acesso
// Não tentar ler req.body em GET.
// ====================================================================================
router.get('/solicitar-acesso', (req, res) => {
    res.render('public/solicitar-acesso', { // Garanta que o caminho para sua EJS está correto (ex: 'public/solicitar-acesso')
        titulo: 'Solicitar Acesso',
        layout: 'layouts/public',
        // Para a primeira exibição do formulário (via GET), os campos devem começar vazios.
        // O 'req.body' só viria preenchido em caso de um POST com erro, que renderizasse a página novamente.
        nomeEscola: '',
        cnpj: '',
        endereco: '',
        telefoneEscola: '',
        nomeResponsavel: '',
        emailContato: '',
        cargoResponsavel: '',
        telefoneContato: '',
        tipoEvento: '',
        previsaoUso: '',
        mensagem: ''
    });
});

// POST para lidar com o envio do formulário de solicitação de acesso (mantenha como está)
router.post('/solicitar-acesso', async (req, res) => {
    const {
        nomeEscola, cnpj, endereco, telefoneEscola,
        nomeResponsavel, emailContato, cargoResponsavel, telefoneContato,
        tipoEvento, previsaoUso, mensagem,
        aceiteTermo
    } = req.body;

    let errors = [];

    // Validações
    if (!nomeEscola || nomeEscola.trim().length < 3) errors.push('Nome da escola é obrigatório e deve ter pelo menos 3 caracteres.');
    if (!endereco || endereco.trim().length < 5) errors.push('Endereço é obrigatório.');
    if (!telefoneEscola || !/^\d{10,11}$/.test(telefoneEscola.replace(/\D/g, ''))) errors.push('Telefone da escola é obrigatório e deve ter 10 ou 11 dígitos.');

    if (!nomeResponsavel || nomeResponsavel.trim().length < 3) errors.push('Nome do responsável é obrigatório.');
    if (!emailContato || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailContato)) errors.push('E-mail de contato inválido.');
    if (!cargoResponsavel || cargoResponsavel.trim().length < 3) errors.push('Cargo do responsável é obrigatório.');
    if (!telefoneContato || !/^\d{10,11}$/.test(telefoneContato.replace(/\D/g, ''))) errors.push('Telefone de contato é obrigatório e deve ter 10 ou 11 dígitos.');

    if (!tipoEvento || tipoEvento.trim() === '') errors.push('Tipo de evento é obrigatório.');

    if (cnpj && !/^\d{14}$/.test(cnpj.replace(/\D/g, ''))) {
        errors.push('CNPJ inválido. Deve conter 14 dígitos.');
    }

    // ✅ Verificação do aceite dos termos
    if (!aceiteTermo) {
        errors.push('Você deve aceitar os termos de uso para enviar a solicitação.');
    }

    if (errors.length > 0) {
        req.flash('error_msg', errors.join('<br>'));
        return res.render('public/solicitar-acesso', {
            titulo: 'Solicitar Acesso',
            layout: 'layouts/public',
            nomeEscola, cnpj, endereco, telefoneEscola,
            nomeResponsavel, emailContato, cargoResponsavel, telefoneContato,
            tipoEvento, previsaoUso, mensagem
        });
    }

    try {
        const solicitacaoExistente = await SolicitacaoAcesso.findOne({
            $or: [
                { emailContato: emailContato.trim(), status: 'Pendente' },
                { nomeEscola: nomeEscola.trim(), status: 'Pendente' }
            ]
        });

        if (solicitacaoExistente) {
            req.flash('error_msg', 'Já existe uma solicitação de acesso pendente para esta escola ou e-mail.');
            return res.render('public/solicitar-acesso', {
                titulo: 'Solicitar Acesso',
                layout: 'layouts/public',
                nomeEscola, cnpj, endereco, telefoneEscola,
                nomeResponsavel, emailContato, cargoResponsavel, telefoneContato,
                tipoEvento, previsaoUso, mensagem
            });
        }

        const novaSolicitacao = new SolicitacaoAcesso({
            nomeEscola: nomeEscola.trim(),
            cnpj: cnpj ? cnpj.replace(/\D/g, '') : undefined,
            endereco: endereco.trim(),
            telefoneEscola: telefoneEscola.replace(/\D/g, ''),
            nomeResponsavel: nomeResponsavel.trim(),
            emailContato: emailContato.trim(),
            cargoResponsavel: cargoResponsavel.trim(),
            telefoneContato: telefoneContato.replace(/\D/g, ''),
            tipoEvento: tipoEvento.trim(),
            previsaoUso: previsaoUso ? previsaoUso.trim() : undefined,
            mensagem: mensagem ? mensagem.trim() : undefined,
            status: 'Pendente',
            dataSolicitacao: new Date(),
            ipSolicitante: req.ip // ✅ Armazena IP do solicitante
        });

        await novaSolicitacao.save();

        const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
        const appUrl = process.env.APP_URL || 'http://localhost:3000';

        if (!superAdminEmail) {
            console.warn('Variável SUPER_ADMIN_EMAIL não configurada.');
        } else {
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: superAdminEmail,
                subject: `Nova Solicitação de Acesso - ${nomeEscola}`,
                html: `
                    <p>Uma nova escola solicitou acesso ao AvaliaFeiras.</p>
                    <ul>
                        <li><strong>Data:</strong> ${novaSolicitacao.dataSolicitacao.toLocaleString('pt-BR')}</li>
                        <li><strong>Nome da Escola:</strong> ${nomeEscola}</li>
                        <li><strong>Responsável:</strong> ${nomeResponsavel} (${emailContato})</li>
                        <li><strong>IP:</strong> ${req.ip}</li>
                    </ul>
                    <p><a href="${appUrl}/superadmin/solicitacoes">Ver no painel</a></p>
                `
            };
            await transporter.sendMail(mailOptions);
        }

        req.flash('success_msg', 'Sua solicitação foi enviada com sucesso! Aguarde nosso contato.');
        res.redirect('/');
    } catch (err) {
        console.error('Erro ao processar solicitação de acesso:', err);
        if (err.code === 11000) {
            req.flash('error_msg', 'Já existe uma solicitação ou registro com este e-mail de contato ou nome de escola.');
        } else {
            req.flash('error_msg', 'Ocorreu um erro ao enviar sua solicitação. Por favor, tente novamente.');
        }
        res.redirect('/solicitar-acesso');
    }
});

module.exports = router;