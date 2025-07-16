const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    return {
      folder: 'relatorios_projetos',
      resource_type: 'raw', // garante que PDFs e outros arquivos não-imagem sejam aceitos
      public_id: file.originalname.replace(/\.[^/.]+$/, '') // nome sem extensão
    };
  },
});

module.exports = {
  cloudinary,
  storage
};
