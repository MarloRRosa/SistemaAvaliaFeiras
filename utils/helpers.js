// Arquivo: utils/helpers.js
// Crie este arquivo dentro de uma nova pasta chamada 'utils' na raiz do seu projeto.

function formatarDatasParaInput(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

module.exports = {
    formatarDatasParaInput
};