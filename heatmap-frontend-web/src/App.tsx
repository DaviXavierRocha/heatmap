
// /heatmap-frontend-web/src/App.tsx

import { useState, useEffect } from 'react'
import MapaTatico from './components/MapaTatico'

function App() {
  const [ocorrencias, setOcorrencias] = useState([]);
  
  // Lembre-se: Coloque o mesmo IP/Porta onde seu server.js está rodando!
  const API_URL = 'http://10.130.85.174:3000/ocorrencias/todas'; 

  useEffect(() => {
    // Polling básico: busca novos dados a cada 10 segundos
    const buscarDados = async () => {
      try {
        const response = await fetch(API_URL);
        const data = await response.json();
        setOcorrencias(data);
      } catch (error) {
        console.error("Erro ao buscar dados da central:", error);
      }
    };

    buscarDados();
    const intervalo = setInterval(buscarDados, 10000);
    return () => clearInterval(intervalo);
  }, []);

  return (
    <div className="dashboard-container">
      <header className="header">
        <h1>HEATMAP</h1>
        <p>PAINEL DE COMANDO TÁTICO | {ocorrencias.length} OCORRÊNCIAS ATIVAS</p>
      </header>
      
      {/* O container flex garantirá que o mapa tome a tela toda */}
      <div style={{ flex: 1, position: 'relative' }}>
         <MapaTatico ocorrencias={ocorrencias} />
      </div>
    </div>
  )
}

export default App