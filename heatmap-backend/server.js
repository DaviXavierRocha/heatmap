
//heatmap-backend/server.js

const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

// Aumentamos o limite para suportar o envio das fotos em base64
app.use(express.json({ limit: '50mb' }));

//const ocorrencias = [];

// --- "Banco de Dados" em Memória para o MVP ---
const usuarios = [];

// Mock de Ocorrências Realistas em Picos-PI
const ocorrencias = [
  {
    id: "mock-1",
    usuarioId: "agente-001",
    latitude: "-7.0827",      // Mesma latitude do alvo
    longitude: "-41.4900",     // Bem a oeste (Bairro Junco/Parque de Exposição)
    direcao: 90,              // Apontando direto para o Leste (90 graus)
    fotoBase64: "",           // Vazio no mock para não pesar
    dataHora: new Date().toISOString()
  },
  {
    id: "mock-2",
    usuarioId: "agente-002",
    latitude: "-7.1100",      // Bem ao sul (Região do Pantanal)
    longitude: "-41.4669",     // Mesma longitude do alvo
    direcao: 0,               // Apontando direto para o Norte (0 ou 360 graus)
    fotoBase64: "",
    dataHora: new Date(Date.now() - 5000).toISOString() // 5 segundos atrás
  },
  {
    id: "mock-3",
    usuarioId: "agente-003",
    latitude: "-7.1000",      // Sudoeste do alvo (BR-316 / Altamira)
    longitude: "-41.4850",
    direcao: 45,              // Apontando para o Nordeste (45 graus)
    fotoBase64: "",
    dataHora: new Date(Date.now() - 15000).toISOString() // 15 segundos atrás
  }
];

// ==========================================
// ROTAS DE USUÁRIO
// ==========================================

// 1. Rota de Cadastro
app.post('/usuarios/cadastro', (req, res) => {
    const { nome, cpf, senha } = req.body;
    
    // Verifica se o CPF já existe
    const usuarioExiste = usuarios.find(u => u.cpf === cpf);
    if (usuarioExiste) {
        return res.status(400).json({ erro: 'Este CPF já está cadastrado.' });
    }

    const novoUsuario = { 
        id: Date.now().toString(), // Gera um ID único
        nome, 
        cpf, 
        senha 
    };
    
    usuarios.push(novoUsuario);
    console.log(`[NOVO USUÁRIO] ${nome} (CPF: ${cpf}) cadastrado.`);
    res.status(201).json({ mensagem: 'Conta criada com sucesso!' });
});

// 2. Rota de Login
app.post('/usuarios/login', (req, res) => {
    const { cpf, senha } = req.body;
    
    const usuario = usuarios.find(u => u.cpf === cpf && u.senha === senha);
    
    if (usuario) {
        console.log(`[LOGIN] Usuário logado: ${usuario.nome}`);
        // Retorna os dados do usuário, mas sem a senha por segurança
        res.status(200).json({ id: usuario.id, nome: usuario.nome, cpf: usuario.cpf });
    } else {
        res.status(401).json({ erro: 'CPF ou senha incorretos.' });
    }
});

// ==========================================
// ROTAS DE OCORRÊNCIA
// ==========================================

// 3. Receber Ocorrência (Vem do HUD da Câmera)
app.post('/ocorrencias', (req, res) => {
    const novaOcorrencia = req.body;
    novaOcorrencia.id = Date.now().toString();
    
    ocorrencias.push(novaOcorrencia);
    console.log(`[ALERTA] Ocorrência #${novaOcorrencia.id} recebida! Lat: ${novaOcorrencia.latitude}, Lon: ${novaOcorrencia.longitude}`);
    
    res.status(201).json({ mensagem: "Ocorrência salva com sucesso!", id: novaOcorrencia.id });
});

// 4. Listar Histórico (Vem do Painel do Usuário)
app.get('/ocorrencias/usuario/:id', (req, res) => {
    const usuarioId = req.params.id;
    
    // Filtra as ocorrências apenas do usuário logado
    const historicoUsuario = ocorrencias.filter(o => o.usuarioId === usuarioId);
    
    // Inverte o array para mostrar as mais recentes primeiro
    res.status(200).json(historicoUsuario.reverse());
});

// 5. Listar TODAS as Ocorrências (Para o Painel Web do Ente Público)
app.get('/ocorrencias/todas', (req, res) => {
    res.status(200).json(ocorrencias);
});


// ==========================================
// INICIALIZAÇÃO DO SERVIDOR
// ==========================================
const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🔥 Servidor Heatmap rodando perfeitamente na porta ${PORT}`);
    console.log(`👉 Aguardando conexões do aplicativo mobile...`);
});