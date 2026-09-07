import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import ffmpegPath from 'ffmpeg-static';
import { translate } from '@vitalets/google-translate-api';
import ytdlp from 'yt-dlp-exec';

const execFileAsync = promisify(execFile);
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const rootPath = __dirname;
app.use(express.static(rootPath));

const langMap = {
  'Español': 'es',
  'Inglés': 'en',
  'Francés': 'fr',
  'Alemán': 'de',
  'Italiano': 'it',
  'Portugués': 'pt'
};

function parseVtt(vttContent) {
  const lines = vttContent.split('\n');
  const transcriptItems = [];
  let currentStart = 0;
  let currentText = '';

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    
    // Buscar marcas de tiempo en formato VTT (ej: 00:01.000 --> 00:04.000)
    if (line.includes('-->')) {
      const parts = line.split('-->');
      const startParts = parts[0].trim().split(':');
      let seconds = 0;
      if (startParts.length === 3) {
        seconds = parseInt(startParts[0]) * 3600 + parseInt(startParts[1]) * 60 + parseFloat(startParts[2]);
      } else if (startParts.length === 2) {
        seconds = parseInt(startParts[0]) * 60 + parseFloat(startParts[1]);
      }
      currentStart = seconds;
    } else if (line !== '' && !line.startsWith('WEBVTT') && !line.startsWith('Kind:') && !line.startsWith('Language:') && !line.match(/^\d+$/)) {
      // Limpiar etiquetas HTML de los subtítulos si las hay
      const cleanLine = line.replace(/<[^>]*>?/gm, '');
      if (cleanLine) {
        transcriptItems.push({
          offset: currentStart,
          text: cleanLine
        });
      }
    }
  }
  return transcriptItems;
}

function formatTimestamp(rawSeconds) {
  const totalSeconds = Math.floor(rawSeconds);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `(${minutes}:${seconds < 10 ? '0' : ''}${seconds})`;
}

app.post('/api/translate-video', async (req, res) => {
  const { videoUrl, targetLang } = req.body;

  if (!videoUrl) {
    return res.status(400).json({ success: false, error: 'La URL del video es obligatoria.' });
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytdlp-'));
  const outputTemplate = path.join(tmpDir, 'subtitle');

  try {
    // Descargar subtítulos automáticos o manuales en formato VTT usando yt-dlp
    await ytdlp(videoUrl, {
      skipDownload: true,
      writeSub: true,
      writeAutoSub: true,
      subLang: 'all',
      subFormat: 'vtt',
      output: outputTemplate
    });

    // Buscar el archivo .vtt generado en la carpeta temporal
    const files = fs.readdirSync(tmpDir);
    const vttFile = files.find(file => file.endsWith('.vtt'));

    if (!vttFile) {
      return res.status(404).json({ success: false, error: 'No se encontraron subtítulos disponibles para este video.' });
    }

    const vttPath = path.join(tmpDir, vttFile);
    const vttContent = fs.readFileSync(vttPath, 'utf8');
    const transcriptItems = parseVtt(vttContent);

    // Limpiar archivos temporales
    fs.rmSync(tmpDir, { recursive: true, force: true });

    if (transcriptItems.length === 0) {
      return res.status(404).json({ success: false, error: 'El archivo de subtítulos está vacío.' });
    }

    // Agrupar de 6 en 6 líneas para formar párrafos legibles
    const CHUNK_SIZE = 6;
    const groupedParagraphs = [];

    for (let i = 0; i < transcriptItems.length; i += CHUNK_SIZE) {
      const chunk = transcriptItems.slice(i, i + CHUNK_SIZE);
      const textBlock = chunk.map(item => item.text).join(' ');
      groupedParagraphs.push({
        offset: chunk[0].offset,
        text: textBlock
      });
    }

    // Traducir bloques al idioma seleccionado
    const targetCode = langMap[targetLang] || 'es';
    const fullTextToTranslate = groupedParagraphs.map(p => p.text).join('\n---\n');

    const translationResult = await translate(fullTextToTranslate, { to: targetCode });
    const translatedBlocks = translationResult.text.split(/\n\s*---\s*\n/);

    const formattedTranscript = groupedParagraphs.map((p, index) => {
      const timestamp = formatTimestamp(p.offset);
      const translatedText = (translatedBlocks[index] || p.text).trim();
      return `${timestamp} ${translatedText}`;
    }).join('\n\n');

    return res.json({
      success: true,
      translation: formattedTranscript
    });

  } catch (error) {
    console.error('❌ Error procesando subtítulos:', error.message);
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    return res.status(500).json({
      success: false,
      error: 'No se pudieron extraer los subtítulos de este enlace en la nube.'
    });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(rootPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
});