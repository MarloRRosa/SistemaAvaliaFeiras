// utils/telegram.js
const axios = require('axios');
require('dotenv').config();

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

async function enviarMensagemTelegram(mensagem) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(mensagem)}`;

  try {
    await axios.get(url);
    console.log('Mensagem enviada para o Telegram!');
  } catch (err) {
    console.error('Erro ao enviar mensagem para o Telegram:', err.message);
  }
}

module.exports = enviarMensagemTelegram;
