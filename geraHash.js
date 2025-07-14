const bcrypt = require('bcrypt');

bcrypt.hash('demo123', 10).then(hash => {
  console.log('Hash gerado:', hash);
  process.exit(0);
}).catch(err => {
  console.error('Erro:', err);
  process.exit(1);
});
