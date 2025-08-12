import QrScanner from 'qr-scanner';
import { toJSON, toCSVLine, normalizeQRContent, isJSONLike } from './sheets.js';

const videoEl = document.getElementById('video');
const overlay = document.getElementById('overlay');
const ctx = overlay.getContext('2d');
const rawEl = document.getElementById('raw');
const transformedEl = document.getElementById('transformed');
const statusEl = document.getElementById('status');
const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const btnSwitch = document.getElementById('btnSwitch');
const btnSend = document.getElementById('btnSend');
const formatSel = document.getElementById('format');

// ⚙️ Worker de qr-scanner para Vite
// (Vite resuelve la ruta a un asset válido en build y dev)
QrScanner.WORKER_PATH = new URL(
  'qr-scanner/qr-scanner-worker.min.js',
  import.meta.url
).toString();

// Estado
let scanner = null;
let currentCamera = 'environment'; // 'user' para frontal
let lastResult = null;             // objeto { raw, json, csv }

// Dibuja un marco simple sobre el video
function drawOverlay() {
  if (!videoEl.videoWidth) return;
  overlay.width = videoEl.clientWidth;
  overlay.height = videoEl.clientHeight;
  const w = overlay.width, h = overlay.height;
  ctx.clearRect(0, 0, w, h);
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,255,180,.9)';
  const pad = Math.min(w, h) * 0.08;
  ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
}

const onScan = (result) => {
  // Sonido opcional (coloca /src/assets/beep.mp3 si querés)
  // new Audio('/src/assets/beep.mp3').play().catch(() => {});

  const raw = (result?.data ?? result ?? '').trim();
  rawEl.textContent = raw || '(sin datos)';

  // Normalizar → intentar JSON, si no, key=value, si no, texto plano
  const normalized = normalizeQRContent(raw);
  const asJSON = toJSON(normalized);
  const asCSV = toCSVLine(asJSON);

  transformedEl.textContent =
    formatSel.value === 'json'
      ? JSON.stringify(asJSON, null, 2)
      : asCSV;

  lastResult = { raw, json: asJSON, csv: asCSV };
  btnSend.disabled = !raw;

  statusEl.textContent = 'QR leído ✔';
};

async function startScanner() {
  if (scanner) return;

  scanner = new QrScanner(videoEl, onScan, {
    returnDetailedScanResult: true,
    highlightScanRegion: true,
    highlightCodeOutline: true,
    maxScansPerSecond: 8,
    preferredCamera: currentCamera, // 'environment' o 'user'
    onDecodeError: () => {}, // ignorar errores transitorios
  });

  await scanner.start(); // pedirá permiso de cámara
  btnStart.disabled = true;
  btnStop.disabled = false;
  statusEl.textContent = 'Escaneando…';
  requestAnimationFrame(function raf() {
    drawOverlay();
    if (scanner) requestAnimationFrame(raf);
  });
}

function stopScanner() {
  if (!scanner) return;
  scanner.stop();
  scanner.destroy();
  scanner = null;
  btnStart.disabled = false;
  btnStop.disabled = true;
  statusEl.textContent = 'Escáner detenido.';
}

// Cambiar entre cámaras (frontal/trasera)
btnSwitch.addEventListener('click', async () => {
  currentCamera = currentCamera === 'environment' ? 'user' : 'environment';
  if (scanner) {
    await scanner.setCamera(currentCamera);
    statusEl.textContent = `Cámara: ${currentCamera}`;
  }
});

// Iniciar / Detener
btnStart.addEventListener('click', () => startScanner().catch(err => {
  console.error(err);
  statusEl.textContent = `Error cámara: ${err?.message || err}`;
}));
btnStop.addEventListener('click', stopScanner);

// Cambiar formato mostrado
formatSel.addEventListener('change', () => {
  if (!lastResult) return;
  transformedEl.textContent =
    formatSel.value === 'json'
      ? JSON.stringify(lastResult.json, null, 2)
      : lastResult.csv;
});

// Enviar a Google Sheets
btnSend.addEventListener('click', async () => {
  if (!lastResult?.json) return;

  // ⚠️ No envíes claves aquí. En producción, usa Apps Script o tu backend.
  const endpoint = import.meta.env.VITE_SHEETS_ENDPOINT; // Apps Script o API de tu servidor

  if (!endpoint) {
    statusEl.textContent = 'Configura VITE_SHEETS_ENDPOINT en .env';
    return;
  }

  statusEl.textContent = 'Enviando…';

  try {
    const payload = {
      timestamp: new Date().toISOString(),
      raw: lastResult.raw,
      data: lastResult.json,
    };

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    statusEl.textContent = 'Enviado a Sheets ✅';
  } catch (e) {
    console.error(e);
    statusEl.textContent = `Error al enviar: ${e.message}`;
  }
});
