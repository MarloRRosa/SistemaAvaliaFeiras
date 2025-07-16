const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: 'dm2ksqim7',
  api_key: '619366191197768',
  api_secret: 'Pwctw1Q4QEHvB4U5egaNWAjs2J4',
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'relatorios_projetos',
    resource_type: 'raw',
    format: async () => 'pdf',
  },
});

module.exports = {
  cloudinary,
  storage
};
