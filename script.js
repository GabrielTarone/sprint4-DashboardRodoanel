// =============================
// MAPA
// =============================

const map = L.map("map").setView([-23.55, -46.85], 11);

const mapaClaro = L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    attribution: "&copy; OpenStreetMap",
  },
);

const mapaEscuro = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  {
    attribution: "&copy; OpenStreetMap & CartoDB",
  },
);

mapaClaro.addTo(map);

L.control
  .layers({
    "Modo Claro": mapaClaro,
    "Modo Escuro": mapaEscuro,
  })
  .addTo(map);

// =============================
// FERRAMENTAS DE DESENHO
// =============================

const camadaDesenhos = new L.FeatureGroup();

map.addLayer(camadaDesenhos);

const controleDesenho = new L.Control.Draw({
  edit: {
    featureGroup: camadaDesenhos,
  },

  draw: {
    polygon: true,
    polyline: true,
    rectangle: true,
    circle: true,
    marker: true,
    circlemarker: false,
  },
});

map.addControl(controleDesenho);

map.on(L.Draw.Event.CREATED, function (event) {
  const layer = event.layer;

  camadaDesenhos.addLayer(layer);

  console.log("Desenho criado:", layer.toGeoJSON());
});

// =============================
// VARIÁVEIS GLOBAIS
// =============================

// Guarda os dados do GeoJSON para reutilizar ao atualizar/testar
let dadosGeojson = null;

// Camada separada para os pontos de monitoramento
let camadaPontos = L.layerGroup().addTo(map);

// Controla se o dashboard usa clima real ou clima simulado
let modoTeste = false;

// Controla o modo de cadastro manual de pontos
let modoCadastro = false;

// Guarda os dados de todos os pontos monitorados
let pontosMonitorados = [];

// =============================
// FAIXAS DE CLASSIFICAÇÃO DA VEGETAÇÃO
// =============================

const faixasVegetacao = [
  {
    alturaMin: 0,
    alturaMax: 0.8,
    classificacao: "Normal",
    cor: "#2ecc71",
    acao: "Nenhuma intervenção necessária",
    prioridade: 4,
    prioridadeTexto: "Monitoramento de rotina",
  },

  {
    alturaMin: 0.81,
    alturaMax: 1.5,
    classificacao: "Atenção",
    cor: "#f1c40f",
    acao: "Acompanhar evolução da vegetação",
    prioridade: 3,
    prioridadeTexto: "Acompanhamento",
  },

  {
    alturaMin: 1.51,
    alturaMax: 2.5,
    classificacao: "Risco",
    cor: "#e67e22",
    acao: "Programar intervenção",
    prioridade: 2,
    prioridadeTexto: "Intervenção programada",
  },

  {
    alturaMin: 2.51,
    alturaMax: Infinity,
    classificacao: "Crítico",
    cor: "#e74c3c",
    acao: "Realizar intervenção imediata",
    prioridade: 1,
    prioridadeTexto: "Intervenção imediata",
  },
];

// =============================
// CLASSIFICAR VEGETAÇÃO
// =============================

function classificarVegetacao(altura) {
  if (altura <= 0.8) {
    return faixasVegetacao[0];
  }

  if (altura <= 1.5) {
    return faixasVegetacao[1];
  }

  if (altura <= 2.5) {
    return faixasVegetacao[2];
  }

  return faixasVegetacao[3];
}

// =============================
// CLASSIFICAR RISCO CLIMÁTICO
// =============================

function classificarRiscoClimatico(clima) {
  if (
    clima.temperature_2m >= 30 ||
    clima.wind_speed_10m >= 25 ||
    clima.relative_humidity_2m <= 25
  ) {
    return {
      nivel: "Alto",
      cor: "#e74c3c",
    };
  }

  if (
    clima.temperature_2m >= 25 ||
    clima.wind_speed_10m >= 15 ||
    clima.relative_humidity_2m <= 40
  ) {
    return {
      nivel: "Médio",
      cor: "#f1c40f",
    };
  }

  return {
    nivel: "Baixo",
    cor: "#2ecc71",
  };
}

// =============================
// OBTER DADOS CLIMÁTICOS
// =============================

// Centraliza a obtenção dos dados meteorológicos.
// Assim o ponto automático e o ponto manual usam a mesma lógica.
async function obterClima(lat, lon) {
  if (modoTeste) {
    return gerarClimaTeste();
  }

  try {
    return await buscarClima(lat, lon);
  } catch (error) {
    console.error("Erro ao buscar clima. Usando dados de teste:", error);

    return gerarClimaTeste();
  }
}

// =============================
// GERAR ALTURA FICTÍCIA DA VEGETAÇÃO
// =============================

function gerarAlturaVegetacao() {
  return Number((Math.random() * (3.5 - 0.3) + 0.3).toFixed(1));
}

// =============================
// CRIAR PONTO DE MONITORAMENTO
// =============================

// Esta função concentra a criação do marcador,
// popup, card, botão de minimizar e interação
// entre o mapa e o painel.
function adicionarPontoMonitoramento({
  nome,
  tipo,
  lat,
  lon,
  alturaVegetacao,
  classificacaoVegetacao,
  clima,
  risco,
}) {
  // =============================
  // CARD
  // =============================

  const listaPontos = document.getElementById("lista-pontos");

  const card = document.createElement("div");

  card.classList.add("card-ponto");

  // A linha lateral representa o risco climático
  card.style.borderLeftColor = classificacaoVegetacao.cor;

  card.innerHTML = `
    <div class="card-header">
  <div>
    <h3>${nome}</h3>

    <div class="status-vegetacao">
      Vegetação:
      <span style="color:${classificacaoVegetacao.cor}">
        ${classificacaoVegetacao.classificacao}
      </span>
    </div>

    <div class="status-clima">
      Clima:
      <span style="color:${risco.cor}">
        ${risco.nivel}
      </span>
    </div>
  </div>

  <button
    class="btn-minimizar"
    title="Minimizar card"
  >
    <span>−</span>
  </button>
</div>

    <div class="card-conteudo">

      <p>
        <strong>Tipo:</strong>
        ${tipo}
      </p>

      <p>
        <strong>Altura da vegetação:</strong>
        ${alturaVegetacao} m
      </p>

      <p>
        <strong>Classificação:</strong>

        <span style="color:${classificacaoVegetacao.cor}">
          ${classificacaoVegetacao.classificacao}
        </span>
      </p>

      <p>
        <strong>Prioridade de atendimento:</strong>

        <span style="color:${classificacaoVegetacao.cor}; font-weight:bold;">
          P${classificacaoVegetacao.prioridade} —
          ${classificacaoVegetacao.prioridadeTexto}
        </span>
      </p>

      <p>
      <strong>---------------------------</strong>
      </p>
      <p>
        <strong>Ação recomendada:</strong>
        ${classificacaoVegetacao.acao}
      </p>

      <p>
        <strong>Temperatura:</strong>
        ${clima.temperature_2m}°C
      </p>

      <p>
        <strong>Umidade:</strong>
        ${clima.relative_humidity_2m}%
      </p>

      <p>
        <strong>Vento:</strong>
        ${clima.wind_speed_10m} km/h
      </p>

      <p>
        <strong>Chuva:</strong>
        ${clima.precipitation} mm
      </p>

      <p>
        <strong>Latitude:</strong>
        ${lat.toFixed(6)}
      </p>

      <p>
        <strong>Longitude:</strong>
        ${lon.toFixed(6)}
      </p>

    </div>
  `;

  listaPontos.appendChild(card);

  // =============================
  // BOTÃO DE MINIMIZAR
  // =============================

  const botaoMinimizar = card.querySelector(".btn-minimizar");

  botaoMinimizar.addEventListener("click", () => {
    card.classList.toggle("minimizado");

    if (card.classList.contains("minimizado")) {
      botaoMinimizar.querySelector("span").textContent = "+";
    } else {
      botaoMinimizar.querySelector("span").textContent = "−";
    }
  });

  // =============================
  // MARCADOR
  // =============================

  const marcador = L.circleMarker([lat, lon], {
    radius: 8,
    color: "#ffffff",
    weight: 2,

    // A cor representa a classificação da vegetação
    fillColor: classificacaoVegetacao.cor,
    fillOpacity: 1,

    // A animação representa risco climático alto
    className: risco.nivel === "Alto" ? "ponto-alerta" : "",
  }).addTo(camadaPontos).bindPopup(`
      <b>${nome}</b><br>
      ${tipo}<br><br>

      <b>Vegetação</b><br>

      Altura:
      ${alturaVegetacao} m<br>

      Classificação:
      <span style="color:${classificacaoVegetacao.cor}">
        <b>${classificacaoVegetacao.classificacao}</b>
      </span><br>

      Ação recomendada:
      ${classificacaoVegetacao.acao}<br><br>

      <b>Condições climáticas</b><br>

      Temperatura:
      ${clima.temperature_2m}°C<br>

      Umidade:
      ${clima.relative_humidity_2m}%<br>

      Vento:
      ${clima.wind_speed_10m} km/h<br>

      Chuva:
      ${clima.precipitation} mm<br><br>

      Risco climático:
      <b>${risco.nivel}</b><br><br>

      <b>Localização</b><br>

      Lat:
      ${lat.toFixed(6)}<br>

      Lon:
      ${lon.toFixed(6)}
    `);

  // =============================
  // CLICAR NO MARCADOR
  // =============================

  marcador.on("click", () => {
    // Garante que o card esteja aberto
    card.classList.remove("minimizado");

    botaoMinimizar.querySelector("span").textContent = "−";

    // Leva o painel até o card
    card.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });

    // Destaca o card temporariamente
    card.classList.add("card-destaque");

    setTimeout(() => {
      card.classList.remove("card-destaque");
    }, 1800);
  });

  // Organiza os dados do ponto em um objeto
  const pontoMonitorado = {
    nome,
    tipo,
    lat,
    lon,
    alturaVegetacao,
    prioridade: classificacaoVegetacao.prioridade,
    prioridadeTexto: classificacaoVegetacao.prioridadeTexto,
    classificacaoVegetacao: classificacaoVegetacao.classificacao,
    corClassificacao: classificacaoVegetacao.cor,
    acaoRecomendada: classificacaoVegetacao.acao,
    clima,
    riscoClimatico: risco.nivel,
    marcador,
    card,
  };

  // Adiciona o objeto ao array de pontos monitorados
  pontosMonitorados.push(pontoMonitorado);

  // Atualiza a ordem dos cards após cada cadastro
  ordenarPontosPorPrioridade();

  // Atualiza os contadores do painel
  atualizarResumoPrioridades();

  return {
    marcador,
    card,
  };
}

// =============================
// ORDENAR PONTOS POR PRIORIDADE
// =============================

function ordenarPontosPorPrioridade() {
  const listaPontos = document.getElementById("lista-pontos");

  // Ordena do número menor para o maior
  pontosMonitorados.sort((a, b) => {
    return a.prioridade - b.prioridade;
  });

  // Reorganiza os cards no painel
  pontosMonitorados.forEach((ponto) => {
    listaPontos.appendChild(ponto.card);
  });
}

// =============================
// ATUALIZAR RESUMO DE PRIORIDADES
// =============================

function atualizarResumoPrioridades() {
  const contagem = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
  };

  // Conta quantos pontos existem em cada prioridade
  pontosMonitorados.forEach((ponto) => {
    contagem[ponto.prioridade]++;
  });

  // Atualiza os números exibidos no HTML
  document.getElementById("contagem-p1").textContent = contagem[1];
  document.getElementById("contagem-p2").textContent = contagem[2];
  document.getElementById("contagem-p3").textContent = contagem[3];
  document.getElementById("contagem-p4").textContent = contagem[4];
}

// =============================
// CARREGAR GEOJSON
// =============================

fetch("dados/rodoanel-rocada.geojson")
  .then((response) => response.json())

  .then((data) => {
    dadosGeojson = data;

    const camadaGeojson = L.geoJSON(data, {
      style: {
        color: "#00ff88",
        weight: 1,
        fillColor: "#00ff88",
        fillOpacity: 0.08,
      },
    }).addTo(map);

    map.fitBounds(camadaGeojson.getBounds());

    gerarPontosMonitoramento(data);
  })

  .catch((error) => {
    console.error("Erro ao carregar o GeoJSON:", error);
  });

// =============================
// GERAR 10 PONTOS DE MONITORAMENTO
// =============================

async function gerarPontosMonitoramento(geojson) {
  // Limpa os marcadores antigos
  camadaPontos.clearLayers();

  // Limpa os cards antigos
  document.getElementById("lista-pontos").innerHTML = "";

  // Limpa os dados anteriores
  pontosMonitorados = [];

  atualizarResumoPrioridades();

  const total = geojson.features.length;
  const quantidade = 10;
  const intervalo = Math.floor(total / quantidade);

  // Seleciona 10 áreas distribuídas pelo GeoJSON
  const pontosSelecionados = [];

  for (let i = 0; i < quantidade; i++) {
    pontosSelecionados.push(geojson.features[i * intervalo]);
  }

  // Processa um ponto por vez
  for (let i = 0; i < pontosSelecionados.length; i++) {
    const feature = pontosSelecionados[i];

    const primeiroVertice = feature.geometry.coordinates[0][0];

    const lon = primeiroVertice[0];
    const lat = primeiroVertice[1];

    // Gera altura fictícia da vegetação
    const alturaVegetacao = gerarAlturaVegetacao();

    // Classifica a vegetação
    const classificacaoVegetacao = classificarVegetacao(alturaVegetacao);

    // Obtém os dados climáticos
    const clima = await obterClima(lat, lon);

    // Classifica o risco climático
    const risco = classificarRiscoClimatico(clima);

    // Cria o ponto e o adiciona ao dashboard
    adicionarPontoMonitoramento({
      nome: `Monitoramento ${i + 1}`,
      tipo: feature.properties.Name,
      lat,
      lon,
      alturaVegetacao,
      classificacaoVegetacao,
      clima,
      risco,
    });

    // Aguarda 1 segundo antes da próxima consulta real
    if (!modoTeste && i < pontosSelecionados.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

// =============================
// INTEGRAÇÃO COM OPEN-METEO
// =============================

async function buscarClima(lat, lon) {
  const url =
    `https://api.open-meteo.com/v1/forecast?` +
    `latitude=${lat}` +
    `&longitude=${lon}` +
    `&current=` +
    `temperature_2m,` +
    `relative_humidity_2m,` +
    `precipitation,` +
    `wind_speed_10m`;

  const resposta = await fetch(url);

  if (!resposta.ok) {
    throw new Error("Erro ao buscar dados da Open-Meteo");
  }

  const dados = await resposta.json();

  return dados.current;
}

// =============================
// BOTÕES DO PAINEL
// =============================

document.getElementById("btn-atualizar").addEventListener("click", () => {
  modoTeste = false;

  if (dadosGeojson) {
    gerarPontosMonitoramento(dadosGeojson);
  }
});

document.getElementById("btn-teste").addEventListener("click", () => {
  modoTeste = true;

  if (dadosGeojson) {
    gerarPontosMonitoramento(dadosGeojson);
  }
});

// =============================
// LEGENDA DO MAPA
// =============================

const legenda = L.control({ position: "bottomright" });

legenda.onAdd = function () {
  const div = L.DomUtil.create("div", "legenda");

  div.innerHTML = `
    <h4>Classificação da vegetação</h4>

    <p>
      <span class="bolinha verde"></span>
      Normal — 0 a 0,8 m
    </p>

    <p>
      <span class="bolinha amarelo"></span>
      Atenção — 0,81 a 1,5 m
    </p>

    <p>
      <span class="bolinha laranja"></span>
      Risco — 1,51 a 2,5 m
    </p>

    <p>
      <span class="bolinha vermelho"></span>
      Crítico — acima de 2,5 m
    </p>

    <div class="separador-legenda"></div>

    <h4>Risco climático</h4>

    <p>
      <span class="bolinha verde"></span>
      Baixo
    </p>

    <p>
      <span class="bolinha amarelo"></span>
      Médio
    </p>

    <p>
      <span class="bolinha vermelho alerta-pulsante"></span>
      Alto
    </p>
  `;

  return div;
};

legenda.addTo(map);

// =============================
// GERAR VALORES PARA TESTE DE CLIMA
// =============================

function gerarClimaTeste() {
  const niveis = ["Baixo", "Médio", "Alto"];

  const nivelSorteado = niveis[Math.floor(Math.random() * niveis.length)];

  if (nivelSorteado === "Baixo") {
    return {
      temperature_2m: gerarNumeroAleatorio(18, 24),

      relative_humidity_2m: gerarNumeroAleatorio(50, 80),

      wind_speed_10m: gerarNumeroAleatorio(2, 14),

      precipitation: gerarNumeroAleatorio(0, 4),
    };
  }

  if (nivelSorteado === "Médio") {
    return {
      temperature_2m: gerarNumeroAleatorio(25, 29),

      relative_humidity_2m: gerarNumeroAleatorio(30, 45),

      wind_speed_10m: gerarNumeroAleatorio(15, 24),

      precipitation: gerarNumeroAleatorio(0, 6),
    };
  }

  return {
    temperature_2m: gerarNumeroAleatorio(30, 42),

    relative_humidity_2m: gerarNumeroAleatorio(10, 25),

    wind_speed_10m: gerarNumeroAleatorio(25, 40),

    precipitation: gerarNumeroAleatorio(0, 10),
  };
}

// =============================
// GERAR NÚMERO ALEATÓRIO
// =============================

function gerarNumeroAleatorio(min, max) {
  return Number((Math.random() * (max - min) + min).toFixed(1));
}

// =============================
// CADASTRAR NOVO PONTO
// =============================

document.getElementById("btn-cadastrar").addEventListener("click", () => {
  modoCadastro = true;

  alert("Clique no mapa para cadastrar um novo ponto de monitoramento.");
});

// =============================
// CLIQUE NO MAPA PARA CADASTRO
// =============================

map.on("click", async function (event) {
  if (!modoCadastro) return;

  modoCadastro = false;

  const lat = event.latlng.lat;
  const lon = event.latlng.lng;

  const nome = prompt("Digite o nome do novo ponto:");

  if (!nome) return;

  // Altura fictícia
  const alturaVegetacao = gerarAlturaVegetacao();

  // Classificação da vegetação
  const classificacaoVegetacao = classificarVegetacao(alturaVegetacao);

  // Obtém clima usando a mesma função
  // dos pontos do GeoJSON
  const clima = await obterClima(lat, lon);

  // Classifica o risco climático
  const risco = classificarRiscoClimatico(clima);

  // Reutiliza toda a lógica de criação
  // do card e do marcador
  adicionarPontoMonitoramento({
    nome,
    tipo: "Ponto cadastrado manualmente",
    lat,
    lon,
    alturaVegetacao,
    classificacaoVegetacao,
    clima,
    risco,
  });
});
