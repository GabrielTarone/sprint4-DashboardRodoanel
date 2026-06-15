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

mapaEscuro.addTo(map);

L.control
  .layers({
    "Modo Claro": mapaClaro,
    "Modo Escuro": mapaEscuro,
  })
  .addTo(map);

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

// Guarda os dados do GeoJSON para reutilizar ao atualizar/testar
let dadosGeojson = null;

// Camada separada só para os pontos, facilitando limpar e redesenhar
let camadaPontos = L.layerGroup().addTo(map);

// Controla se o dashboard usa clima real ou clima simulado de alerta
let modoTeste = false;

let modoCadastro = false;

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
// GERAR PONTOS DE MONITORAMENTO
// =============================

async function gerarPontosMonitoramento(geojson) {
  // Limpa pontos antigos do mapa
  camadaPontos.clearLayers();

  // Limpa cards antigos do painel lateral
  document.getElementById("lista-pontos").innerHTML = "";

  const total = geojson.features.length;
  const quantidade = 10;
  const intervalo = Math.floor(total / quantidade);

  for (let i = 0; i < quantidade; i++) {
    const feature = geojson.features[i * intervalo];

    const primeiroVertice = feature.geometry.coordinates[0][0];

    const lon = primeiroVertice[0];
    const lat = primeiroVertice[1];

    // Busca clima real ou usa clima simulado no modo teste
    let clima;

    if (modoTeste) {
      clima = gerarClimaTeste();
    } else {
      try {
        clima = await buscarClima(lat, lon);
      } catch (error) {
        console.error("Erro ao buscar clima. Usando dados de teste:", error);
        clima = gerarClimaTeste();
      }
    }

    // Calcula o nível de risco com base no clima
    let risco;

    if (
      clima.temperature_2m >= 30 ||
      clima.wind_speed_10m >= 25 ||
      clima.relative_humidity_2m <= 25
    ) {
      risco = { nivel: "Alto", cor: "#e74c3c" };
    } else if (
      clima.temperature_2m >= 25 ||
      clima.wind_speed_10m >= 15 ||
      clima.relative_humidity_2m <= 40
    ) {
      risco = { nivel: "Médio", cor: "#f1c40f" };
    } else {
      risco = { nivel: "Baixo", cor: "#2ecc71" };
    }

    // =============================
    // CRIA CARD NO PAINEL LATERAL
    // =============================

    const listaPontos = document.getElementById("lista-pontos");

    const card = document.createElement("div");
    card.classList.add("card-ponto");
    card.style.borderLeftColor = risco.cor;

    card.innerHTML = `
      <div class="card-header">
        <div>
          <h3>Monitoramento ${i + 1}</h3>
          <span style="color:${risco.cor}">${risco.nivel}</span>
        </div>

        <button class="btn-minimizar" title="Minimizar card">
          <span>−</span>
        </button>
      </div>

      <div class="card-conteudo">
        <p><strong>Tipo:</strong> ${feature.properties.Name}</p>
        <p><strong>Temperatura:</strong> ${clima.temperature_2m}°C</p>
        <p><strong>Umidade:</strong> ${clima.relative_humidity_2m}%</p>
        <p><strong>Vento:</strong> ${clima.wind_speed_10m} km/h</p>
        <p><strong>Chuva:</strong> ${clima.precipitation} mm</p>
        <p><strong>Latitude:</strong> ${lat.toFixed(6)}</p>
        <p><strong>Longitude:</strong> ${lon.toFixed(6)}</p>
      </div>
    `;

    listaPontos.appendChild(card);

    // Botão de minimizar
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
    // CRIA MARCADOR NO MAPA
    // =============================

    const marcador = L.circleMarker([lat, lon], {
      radius: 8,
      color: "#ffffff",
      weight: 2,
      fillColor: risco.cor,
      fillOpacity: 1,
      className: risco.nivel === "Alto" ? "ponto-alerta" : "",
    }).addTo(camadaPontos).bindPopup(`
        <b>Monitoramento ${i + 1}</b><br>
        Tipo: ${feature.properties.Name}<br><br>

        Temperatura: ${clima.temperature_2m}°C<br>
        Umidade: ${clima.relative_humidity_2m}%<br>
        Vento: ${clima.wind_speed_10m} km/h<br>
        Chuva: ${clima.precipitation} mm<br><br>

        Risco: <b>${risco.nivel}</b><br>
        Lat: ${lat.toFixed(6)}<br>
        Lon: ${lon.toFixed(6)}
      `);

    // Ao clicar no ponto do mapa, destaca o card correspondente
    marcador.on("click", () => {
      // Garante que o card esteja aberto
      card.classList.remove("minimizado");
      botaoMinimizar.querySelector("span").textContent = "−";

      // Rola o painel até o card
      card.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });

      // Aplica destaque visual temporário
      card.classList.add("card-destaque");

      setTimeout(() => {
        card.classList.remove("card-destaque");
      }, 1800);
    });
  }
}
// =============================
// INTEGRAÇÃO COM OPEN-METEO
// =============================

async function buscarClima(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m`;

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
    <h4>Risco</h4>
    <p><span class="bolinha verde"></span> Baixo</p>
    <p><span class="bolinha amarelo"></span> Médio</p>
    <p><span class="bolinha vermelho"></span> Alto</p>
  `;

  return div;
};

legenda.addTo(map);

// =============================
// GERANDO VALORES PARA TESTE DE CLIMA COM ALERTAS
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

function gerarNumeroAleatorio(min, max) {
  return Number((Math.random() * (max - min) + min).toFixed(1));
}

document.getElementById("btn-cadastrar").addEventListener("click", () => {
  modoCadastro = true;
  alert("Clique no mapa para cadastrar um novo ponto de monitoramento.");
});

map.on("click", async function (event) {
  if (!modoCadastro) return;

  modoCadastro = false;

  const lat = event.latlng.lat;
  const lon = event.latlng.lng;

  const nome = prompt("Digite o nome do novo ponto:");

  if (!nome) return;

  let clima;

  if (modoTeste) {
    clima = gerarClimaTeste();
  } else {
    clima = await buscarClima(lat, lon);
  }

  let risco;

  if (
    clima.temperature_2m >= 30 ||
    clima.wind_speed_10m >= 25 ||
    clima.relative_humidity_2m <= 25
  ) {
    risco = { nivel: "Alto", cor: "#e74c3c" };
  } else if (
    clima.temperature_2m >= 25 ||
    clima.wind_speed_10m >= 15 ||
    clima.relative_humidity_2m <= 40
  ) {
    risco = { nivel: "Médio", cor: "#f1c40f" };
  } else {
    risco = { nivel: "Baixo", cor: "#2ecc71" };
  }

  L.circleMarker([lat, lon], {
    radius: 8,
    color: "#ffffff",
    weight: 2,
    fillColor: risco.cor,
    fillOpacity: 1,
    className: risco.nivel === "Alto" ? "ponto-alerta" : "",
  }).addTo(camadaPontos).bindPopup(`
      <b>${nome}</b><br>
      Ponto cadastrado manualmente<br><br>

      Temperatura: ${clima.temperature_2m}°C<br>
      Umidade: ${clima.relative_humidity_2m}%<br>
      Vento: ${clima.wind_speed_10m} km/h<br>
      Chuva: ${clima.precipitation} mm<br><br>

      Risco: <b>${risco.nivel}</b><br>
      Lat: ${lat.toFixed(6)}<br>
      Lon: ${lon.toFixed(6)}
    `);

  const listaPontos = document.getElementById("lista-pontos");

  const card = document.createElement("div");
  card.classList.add("card-ponto");
  card.style.borderLeftColor = risco.cor;

  card.innerHTML = `
    <div class="card-header">
      <div>
        <h3>${nome}</h3>
        <span style="color:${risco.cor}">${risco.nivel}</span>
      </div>
    </div>

    <div class="card-conteudo">
      <p><strong>Tipo:</strong> Ponto cadastrado manualmente</p>
      <p><strong>Temperatura:</strong> ${clima.temperature_2m}°C</p>
      <p><strong>Umidade:</strong> ${clima.relative_humidity_2m}%</p>
      <p><strong>Vento:</strong> ${clima.wind_speed_10m} km/h</p>
      <p><strong>Chuva:</strong> ${clima.precipitation} mm</p>
      <p><strong>Latitude:</strong> ${lat.toFixed(6)}</p>
      <p><strong>Longitude:</strong> ${lon.toFixed(6)}</p>
    </div>
  `;

  listaPontos.appendChild(card);
});
