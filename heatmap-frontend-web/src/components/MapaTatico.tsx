
// /heatmap-frontend-web/src/components/MapaTatico.tsx

import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle } from 'react-leaflet';
import * as turf from '@turf/turf';
import 'leaflet/dist/leaflet.css';

// Corrigindo o bug nativo de ícones do Leaflet no React
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

interface Ocorrencia {
  id: string;
  latitude: number;
  longitude: number;
  direcao: number;
  dataHora: string;
}

interface MapaTaticoProps {
  ocorrencias: Ocorrencia[];
}

const MapaTatico: React.FC<MapaTaticoProps> = ({ ocorrencias }) => {
  // Posição inicial (Centro do Piauí/Picos - ajuste conforme necessário)
  const centroPadrao: [number, number] = [-7.0827, -41.4669];

// Algoritmo de Triangulação e Clustering (Memoizado)
  const { linhasDeVisao, epicentros } = useMemo(() => {
    const linhas: [number, number][][] = [];
    const cruzamentosBrutos: turf.Feature<turf.Point>[] = [];
    const distMaxKm = 30; 

    // 1. Gera as linhas de visão para cada agente
    const turfLines = ocorrencias.map(oc => {
      const ptOrigem = turf.point([Number(oc.longitude), Number(oc.latitude)]);
      const ptDestino = turf.destination(ptOrigem, distMaxKm, Number(oc.direcao), { units: 'kilometers' });
      
      const linha = turf.lineString([turf.getCoord(ptOrigem), turf.getCoord(ptDestino)]);
      
      linhas.push([
        [Number(oc.latitude), Number(oc.longitude)],
        [turf.getCoord(ptDestino)[1], turf.getCoord(ptDestino)[0]]
      ]);

      return linha;
    });

    // 2. Encontra TODOS os cruzamentos brutos (Formando o polígono de erro)
    for (let i = 0; i < turfLines.length; i++) {
      for (let j = i + 1; j < turfLines.length; j++) {
        const interseccao = turf.lineIntersect(turfLines[i], turfLines[j]);
        
        if (interseccao.features.length > 0) { 
            const pontoCruzamento = turf.getCoord(interseccao.features[0]);
            
            // Corta as retas a laser nos limites da zona de conflito
            linhas[i][1] = [pontoCruzamento[1], pontoCruzamento[0]];
            linhas[j][1] = [pontoCruzamento[1], pontoCruzamento[0]];

            // Guarda o ponto isolado para agrupar depois
            cruzamentosBrutos.push(interseccao.features[0]);
        }
      }
    }

    // 3. CLUSTERING (Agrupando os erros por proximidade)
    const grupos: turf.Feature<turf.Point>[][] = [];
    const TOLERANCIA_KM = 2.0; // Se os cruzamentos estão num raio de 2km, é o mesmo incêndio

    cruzamentosBrutos.forEach(ponto => {
        let adicionado = false;
        for (let i = 0; i < grupos.length; i++) {
            // Se estiver perto do foco já conhecido, junta no grupo
            if (turf.distance(grupos[i][0], ponto, { units: 'kilometers' }) <= TOLERANCIA_KM) {
                grupos[i].push(ponto);
                adicionado = true;
                break;
            }
        }
        // Se não pertencer a nenhum grupo, significa que há UM NOVO INCÊNDIO em outro canto da cidade
        if (!adicionado) grupos.push([ponto]);
    });

    // 4. Calcula o CENTROIDE (Epicentro Único) e o Raio da Zona de Incerteza
    const epicentrosFinais: { coord: [number, number]; raio: number }[] = [];

    grupos.forEach(grupo => {
        // Encontra o "centro de massa" exato do grupo de cruzamentos
        const centroide = turf.center(turf.featureCollection(grupo));
        const coordCentroide = turf.getCoord(centroide);

        // Qual foi o tamanho do erro (dispersão)? Qual a distância do centroide até o pior cruzamento?
        let erroMaximoMetros = 0;
        grupo.forEach(ponto => {
            const d = turf.distance(centroide, ponto, { units: 'meters' });
            if (d > erroMaximoMetros) erroMaximoMetros = d;
        });

        // O raio será o tamanho do erro + 50m de margem tática (Mínimo travado em 100m)
        const raioCalculado = Math.max(100, erroMaximoMetros + 50);

        epicentrosFinais.push({
            coord: [coordCentroide[1], coordCentroide[0]], // [Lat, Lng] para o Leaflet
            raio: raioCalculado
        });
    });

    return { linhasDeVisao: linhas, epicentros: epicentrosFinais };
  }, [ocorrencias]);

  return (
    <MapContainer center={centroPadrao} zoom={11}>
      {/* TileLayer Militar "Dark Matter" do CartoDB - Perfeito para MVPs sem chave de API */}
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
      />

      {/* 1. Plota os Agentes */}
      {ocorrencias.map((oc) => (
        <Marker key={oc.id} position={[Number(oc.latitude), Number(oc.longitude)]}>
          <Popup>
            Agente reportou às {new Date(oc.dataHora).toLocaleTimeString()}<br />
            Azimute (Direção): {oc.direcao}°
          </Popup>
        </Marker>
      ))}

      {/* 2. Desenha o "Raio de Visão / Linha de Mira" dos agentes (Azul escuro) */}
      {linhasDeVisao.map((linha, idx) => (
        <Polyline key={`linha-${idx}`} positions={linha} color="rgba(0, 150, 255, 0.4)" dashArray="5, 10" />
      ))}

      {/* 3. Desenha os Epicentros (Cruzamentos de retas) (Vermelho Perigo) */}
      {epicentros.map((epicentro, idx) => (
        <Circle 
            key={`epicentro-${idx}`}
            center={epicentro.coord} // <-- Puxa do objeto
            radius={epicentro.raio}  // <-- Usa o raio dinâmico que você calculou!
            pathOptions={{ color: '#ff3333', fillColor: '#ff0000', fillOpacity: 0.5 }}
        >
            <Popup>🔥 POSSÍVEL FOCO (Raio: {Math.round(epicentro.raio)}m) 🔥</Popup>
        </Circle>
        ))}
    </MapContainer>
  );
};

export default MapaTatico;