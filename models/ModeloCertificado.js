const mongoose = require('mongoose');


// =====================================================
// PARTES DO TEXTO INTELIGENTE
// =====================================================
//
// Um bloco de texto inteligente pode misturar:
// - texto normal
// - campos automáticos
//
// Exemplo:
//
// Certificamos que [Nome do estudante] participou da
// [Nome da feira], apresentando o projeto
// [Título do projeto].
//
// Internamente:
//
// [
//   { tipo: 'texto', texto: 'Certificamos que ' },
//   { tipo: 'campo', campo: 'nomeParticipante' },
//   { tipo: 'texto', texto: ' participou da ' },
//   { tipo: 'campo', campo: 'nomeFeira' }
// ]
//
// =====================================================

const ParteTextoInteligenteSchema =
    new mongoose.Schema({

        // =================================================
        // TIPO DA PARTE
        // =================================================

        tipo: {
            type: String,
            enum: [
                'texto',
                'campo'
            ],
            required: true
        },


        // =================================================
        // TEXTO NORMAL
        // =================================================

        texto: {
            type: String,
            default: ''
        },


        // =================================================
        // CAMPO AUTOMÁTICO
        // =================================================
        //
        // Exemplos:
        //
        // nomeParticipante
        // nomeFeira
        // nomeEscola
        // tituloProjeto
        // categoria
        // turma
        // orientador
        // coorientador
        // numeroEstande
        //
        // =================================================

        campo: {
            type: String,
            default: ''
        },


        // =================================================
        // FORMATAÇÃO INDIVIDUAL DA PARTE
        // =================================================

        negrito: {
            type: Boolean,
            default: false
        },

        italico: {
            type: Boolean,
            default: false
        },

        sublinhado: {
            type: Boolean,
            default: false
        },

        cor: {
            type: String,
            default: ''
        }

    }, {
        _id: true
    });


// =====================================================
// ELEMENTOS DO CERTIFICADO
// =====================================================

const ElementoCertificadoSchema =
    new mongoose.Schema({

        // =================================================
        // TIPO DO ELEMENTO
        // =================================================

        tipo: {
            type: String,
            enum: [
                'texto',
                'campo',
                'textoInteligente',
                'imagem',
                'assinatura',
                'qrcode'
            ],
            required: true
        },


        // =================================================
        // TEXTO LIVRE
        // =================================================
        //
        // Utilizado principalmente nos elementos antigos
        // do tipo "texto".
        //
        // =================================================

        texto: {
            type: String,
            default: ''
        },


        // =================================================
        // CAMPO AUTOMÁTICO
        // =================================================
        //
        // Utilizado principalmente nos elementos antigos
        // do tipo "campo".
        //
        // =================================================

        campo: {
            type: String,
            default: ''
        },


        // =================================================
        // CONTEÚDO DO TEXTO INTELIGENTE
        // =================================================
        //
        // Utilizado quando:
        //
        // tipo === 'textoInteligente'
        //
        // Permite misturar texto normal e campos
        // automáticos dentro de um único bloco.
        //
        // =================================================

        conteudo: [
            ParteTextoInteligenteSchema
        ],


        // =================================================
        // IMAGENS / LOGOS / ASSINATURAS
        // =================================================

        url: {
            type: String,
            default: ''
        },


        // =================================================
        // POSIÇÃO
        // =================================================

        x: {
            type: Number,
            default: 0
        },

        y: {
            type: Number,
            default: 0
        },


        // =================================================
        // TAMANHO
        // =================================================

        largura: {
            type: Number,
            default: 200
        },

        altura: {
            type: Number,
            default: 50
        },


        // =================================================
        // CONFIGURAÇÃO VISUAL DO ELEMENTO
        // =================================================

        fonte: {
            type: String,
            default: 'Arial'
        },

        tamanhoFonte: {
            type: Number,
            default: 24
        },

        negrito: {
            type: Boolean,
            default: false
        },

        italico: {
            type: Boolean,
            default: false
        },

        alinhamento: {
            type: String,
            enum: [
                'left',
                'center',
                'right'
            ],
            default: 'center'
        },

        cor: {
            type: String,
            default: '#000000'
        },


        // =================================================
        // ORDEM DE SOBREPOSIÇÃO
        // =================================================

        ordem: {
            type: Number,
            default: 0
        }

    }, {
        _id: true
    });


// =====================================================
// MODELO DO CERTIFICADO
// =====================================================

const ModeloCertificadoSchema =
    new mongoose.Schema({

        // =================================================
        // IDENTIFICAÇÃO
        // =================================================

        nome: {
            type: String,
            required: true,
            trim: true
        },


        // =================================================
        // TIPO DE CERTIFICADO
        // =================================================

        tipo: {
            type: String,
            enum: [
                'estudante',
                'orientador',
                'coorientador',
                'avaliador',
                'geral'
            ],
            required: true
        },


        // =================================================
        // ESCOLA
        // =================================================

        escolaId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Escola',
            required: true
        },


        // =================================================
        // FEIRA
        // =================================================

        feira: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Feira',
            required: true
        },


        // =================================================
        // CONFIGURAÇÃO DA PÁGINA
        // =================================================

        orientacao: {
            type: String,
            enum: [
                'paisagem',
                'retrato'
            ],
            default: 'paisagem'
        },


        tamanhoPagina: {
            type: String,
            enum: [
                'A4'
            ],
            default: 'A4'
        },


        // =================================================
        // FUNDO DO CERTIFICADO
        // =================================================

        fundoUrl: {
            type: String,
            default: ''
        },


        // =================================================
        // IDENTIFICADOR DO FUNDO NO CLOUDINARY
        // =================================================
        //
        // Utilizado para substituir ou remover
        // o arquivo antigo.
        //
        // =================================================

        fundoPublicId: {
            type: String,
            default: ''
        },


        // =================================================
        // AJUSTE DO FUNDO
        // =================================================

        ajusteFundo: {
            type: String,
            enum: [
                'cobrir',
                'conter',
                'esticar'
            ],
            default: 'cobrir'
        },


        // =================================================
        // ELEMENTOS VISUAIS
        // =================================================

        elementos: [
            ElementoCertificadoSchema
        ],


        // =================================================
        // STATUS
        // =================================================

        ativo: {
            type: Boolean,
            default: true
        },


        // =================================================
        // DATA DE CADASTRO
        // =================================================

        dataCadastro: {
            type: Date,
            default: Date.now
        }

    }, {
        timestamps: true
    });


// =====================================================
// EXPORTAR MODEL
// =====================================================

module.exports =
    mongoose.model(
        'ModeloCertificado',
        ModeloCertificadoSchema
    );
