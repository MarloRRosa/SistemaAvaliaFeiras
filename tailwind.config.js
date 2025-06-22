/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./views/**/*.{ejs,js,html}", // <-- Adicione esta linha
    // Se você tiver outras pastas com HTML ou JS onde usa classes Tailwind, adicione-as aqui também.
    // Exemplo: "./public/**/*.js",
    // "./public/**/*.html",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}