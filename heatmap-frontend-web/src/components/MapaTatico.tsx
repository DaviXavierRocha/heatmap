// /heatmap-frontend-web/src/components/MapaTatico.tsx

import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle } from 'react-leaflet';
import * as turf from '@turf/turf';
import 'leaflet/dist/leaflet.css';
import type { Feature, Point } from 'geojson';

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
    const distMaxKm = 30; 
    const linhasVisuaisFinais: [number, number][][] = [];
    const cruzamentosUnicos = new Map<string, Feature<Point>>();

    // 1. Gera os objetos de visão iniciais
    const visoes = ocorrencias.map(oc => {
      const ptOrigem = turf.point([Number(oc.longitude), Number(oc.latitude)]);
      const ptDestino = turf.destination(ptOrigem, distMaxKm, Number(oc.direcao), { units: 'kilometers' });
      const linhaTurf = turf.lineString([turf.getCoord(ptOrigem), turf.getCoord(ptDestino)]);
      
      return { origem: ptOrigem, linhaTurf: linhaTurf, destinoOriginal: ptDestino, oc };
    });

    // 2. Encontra APENAS o primeiro cruzamento (o mais próximo) para cada agente
    visoes.forEach((visaoA, indexA) => {
      let cruzamentoMaisProximo: Feature<Point> | null = null;
      let menorDistanciaEncontrada = Infinity;

      visoes.forEach((visaoB, indexB) => {
        if (indexA === indexB) return; // Não cruza a linha com ela mesma

        const interseccao = turf.lineIntersect(visaoA.linhaTurf, visaoB.linhaTurf);
        
        // Se houver cruzamento entre A e B
        if (interseccao.features.length > 0) { 
            const pontoCruzamento = interseccao.features[0] as Feature<Point>;
            const dist = turf.distance(visaoA.origem, pontoCruzamento, { units: 'kilometers' });

            // Se for o cruzamento mais próximo encontrado até agora para o Agente A, salva ele!
            if (dist < menorDistanciaEncontrada) {
                menorDistanciaEncontrada = dist;
                cruzamentoMaisProximo = pontoCruzamento;
            }
        }
      });

      // Define até onde a linha azul do Agente A vai ser desenhada
      if (cruzamentoMaisProximo) {
          const coordCruz = turf.getCoord(cruzamentoMaisProximo);
          
          // Corta a reta visual a laser no exato ponto do PRIMEIRO incêndio
          linhasVisuaisFinais.push([
            [Number(visaoA.oc.latitude), Number(visaoA.oc.longitude)],
            [coordCruz[1], coordCruz[0]] // Leaflet inverte para [Lat, Lng]
          ]);

          // Guarda o ponto no Map para evitar pontos perfeitamente duplicados no array
          const chaveUnica = `${coordCruz[0].toFixed(5)},${coordCruz[1].toFixed(5)}`;
          cruzamentosUnicos.set(chaveUnica, cruzamentoMaisProximo);

      } else {
          // Se não bateu em nenhum cruzamento, a linha vai até os 30km procurando
          const destCoords = turf.getCoord(visaoA.destinoOriginal);
          linhasVisuaisFinais.push([
            [Number(visaoA.oc.latitude), Number(visaoA.oc.longitude)],
            [destCoords[1], destCoords[0]]
          ]);
      }
    });

    // Converte o Map de volta para Array para a fase de Clustering
    const cruzamentosBrutos = Array.from(cruzamentosUnicos.values());

    // 3. CLUSTERING (Agrupando os erros por proximidade)
    const grupos: Feature<Point>[][] = [];
    const TOLERANCIA_KM = 2.0;

    cruzamentosBrutos.forEach(ponto => {
        let adicionado = false;
        for (let i = 0; i < grupos.length; i++) {
            if (turf.distance(grupos[i][0], ponto, { units: 'kilometers' }) <= TOLERANCIA_KM) {
                grupos[i].push(ponto);
                adicionado = true;
                break;
            }
        }
        if (!adicionado) grupos.push([ponto]);
    });

    // 4. Calcula o CENTROIDE e o Raio Dinâmico
    const epicentrosFinais: { coord: [number, number]; raio: number }[] = [];

    grupos.forEach(grupo => {
        const centroide = turf.center(turf.featureCollection(grupo));
        const coordCentroide = turf.getCoord(centroide);

        let erroMaximoMetros = 0;
        grupo.forEach(ponto => {
            const d = turf.distance(centroide, ponto, { units: 'meters' });
            if (d > erroMaximoMetros) erroMaximoMetros = d;
        });

        const raioCalculado = Math.max(100, erroMaximoMetros + 50);

        epicentrosFinais.push({
            coord: [coordCentroide[1], coordCentroide[0]],
            raio: raioCalculado
        });
    });

    return { linhasDeVisao: linhasVisuaisFinais, epicentros: epicentrosFinais };
  }, [ocorrencias]);

  return (
    <MapContainer center={centroPadrao} zoom={11} style={{ height: '100vh', width: '100%' }}>
      {/* TileLayer Militar "Dark Matter" */}
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

      {/* 2. Desenha o "Raio de Visão / Linha de Mira" dos agentes */}
      {linhasDeVisao.map((linha, idx) => (
        <Polyline key={`linha-${idx}`} positions={linha} color="rgba(0, 150, 255, 0.4)" dashArray="5, 10" />
      ))}

      {/* 3. Desenha os Epicentros */}
      {epicentros.map((epicentro, idx) => (
        <Circle 
            key={`epicentro-${idx}`}
            center={epicentro.coord}
            radius={epicentro.raio} 
            pathOptions={{ color: '#ff3333', fillColor: '#ff0000', fillOpacity: 0.5 }}
        >
            <Popup>🔥 POSSÍVEL FOCO (Raio: {Math.round(epicentro.raio)}m) 🔥</Popup>
        </Circle>
      ))}
    </MapContainer>
  );
};

export default MapaTatico;