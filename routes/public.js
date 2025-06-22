// routes/public.js

const express = require('express');
const router = express.Router();
const SolicitacaoAcesso = require('../models/SolicitacaoAcesso');
const nodemailer = require('nodemailer');
require('dotenv').config();

// Configuração do Nodemailer
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT, 10),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Página inicial
router.get('/', (req, res) => {
    res.render('index', {
        titulo: 'Bem-vindo ao AvaliaFeiras',
        layout: 'layouts/public'
    });
});

// GET - formulário de solicitação de acesso
router.get('/solicitar-acesso', (req, res) => {
    res.render('public/solicitar-acesso', {
        titulo: 'Solicitar Acesso',
        layout: 'layouts/public',
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

// POST - envio do formulário
router.post('/solicitar-acesso', async (req, res) => {
    const {
        nomeEscola, cnpj, endereco, telefoneEscola,
        nomeResponsavel, emailContato, cargoResponsavel, telefoneContato,
        tipoEvento, previsaoUso, mensagem,
        aceiteTermo
    } = req.body;

    const errors = [];

    // Validações
    if (!nomeEscola || nomeEscola.trim().length < 3) errors.push('Nome da escola deve ter pelo menos 3 caracteres.');
    if (!endereco || endereco.trim().length < 5) errors.push('Endereço da escola é obrigatório.');
    if (!telefoneEscola || !/^\d{10,11}$/.test(telefoneEscola.replace(/\D/g, ''))) errors.push('Telefone da escola deve ter 10 ou 11 dígitos.');

    if (!nomeResponsavel || nomeResponsavel.trim().length < 3) errors.push('Nome do responsável é obrigatório.');
    if (!emailContato || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailContato)) errors.push('E-mail de contato inválido.');
    if (!cargoResponsavel || cargoResponsavel.trim().length < 3) errors.push('Cargo do responsável é obrigatório.');
    if (!telefoneContato || !/^\d{10,11}$/.test(telefoneContato.replace(/\D/g, ''))) errors.push('Telefone de contato deve ter 10 ou 11 dígitos.');

    if (!tipoEvento || tipoEvento.trim().length === 0) errors.push('Tipo de evento é obrigatório.');
    if (cnpj && !/^\d{14}$/.test(cnpj.replace(/\D/g, ''))) errors.push('CNPJ inválido. Deve conter 14 dígitos.');
    if (!aceiteTermo) errors.push('Você deve aceitar os termos de uso.');

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
        const existente = await SolicitacaoAcesso.findOne({
            $or: [
                { emailContato: emailContato.trim(), status: 'Pendente' },
                { nomeEscola: nomeEscola.trim(), status: 'Pendente' }
            ]
        });

        if (existente) {
            req.flash('error_msg', 'Já existe uma solicitação pendente com este e-mail ou nome de escola.');
            return res.render('public/solicitar-acesso', {
                titulo: 'Solicitar Acesso',
                layout: 'layouts/public',
                nomeEscola, cnpj, endereco, telefoneEscola,
                nomeResponsavel, emailContato, cargoResponsavel, telefoneContato,
                tipoEvento, previsaoUso, mensagem
            });
        }

        // Captura IP real mesmo atrás de proxy
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        const nova = new SolicitacaoAcesso({
            nomeEscola: nomeEscola.trim(),
            cnpj: cnpj ? cnpj.replace(/\D/g, '') : undefined,
            endereco: endereco.trim(),
            telefoneEscola: telefoneEscola.replace(/\D/g, ''),
            nomeResponsavel: nomeResponsavel.trim(),
            emailContato: emailContato.trim(),
            cargoResponsavel: cargoResponsavel.trim(),
            telefoneContato: telefoneContato.replace(/\D/g, ''),
            tipoEvento: tipoEvento.trim(),
            previsaoUso: previsaoUso?.trim() || '',
            mensagem: mensagem?.trim() || '',
            status: 'Pendente',
            dataSolicitacao: new Date(),
             registroAceite: {
            aceite: true,
            ip,
            dataHora: new Date()
        }
        });

        await nova.save();

        // E-mail para o superadmin
        if (process.env.SUPER_ADMIN_EMAIL) {
            try {
                const envio = await transporter.sendMail({
                    from: `"AvaliaFeiras" <${process.env.EMAIL_SENDER_ADDRESS}>`,
                    to: process.env.SUPER_ADMIN_EMAIL,
                    subject: 'Nova Solicitação de Acesso ao AvaliaFeiras',
                    html: `
                        <p>Uma nova escola solicitou acesso:</p>
                        <ul>
                            <li><strong>Escola:</strong> ${nomeEscola}</li>
                            <li><strong>Responsável:</strong> ${nomeResponsavel}</li>
                            <li><strong>Email:</strong> ${emailContato}</li>
                            <li><strong>Telefone:</strong> ${telefoneContato}</li>
                            <li><strong>IP:</strong> ${ip}</li>
                        </ul>
                        <p><a href="${process.env.APP_URL}/superadmin">Acessar o painel para aprovar/rejeitar</a></p>
                    `
                });
                console.log('✔️ Solicitação enviada com sucesso para o superadmin:', envio.messageId);
            } catch (erroEnvio) {
                console.error('❌ Erro ao enviar e-mail de solicitação:', erroEnvio);
            }
        } else {
            console.warn('⚠️ SUPER_ADMIN_EMAIL não está definido no .env!');
        }

        req.flash('success_msg', 'Sua solicitação foi enviada com sucesso! Aguarde nosso contato.');
        res.redirect('/');
    } catch (err) {
        console.error('Erro ao salvar solicitação:', err);
        req.flash('error_msg', 'Erro ao processar sua solicitação. Tente novamente.');
        res.redirect('/solicitar-acesso');
    }
});

module.exports = router;
