import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSubtitles } from 'youtube-captions-scraper';
import { translate } from '@vitalets/google-translate-api';

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

function extractVideoId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

function formatTimestamp(rawStart) {
  const totalSeconds = Math.floor(rawStart);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `(${minutes}:${seconds < 10 ? '0' : ''}${seconds})`;
}

app.post('/api/translate-video', async (req, res) => {
  const { videoUrl, targetLang } = req.body;

  if (!videoUrl) {
    return res.status(400).json({ success: false, error: 'La URL del video es obligatoria.' });
  }

  const videoId = extractVideoId(videoUrl);
  if (!videoId) {
    return res.status(400).json({ success: false, error: 'URL de YouTube no válida.' });
  }

  try {
    // Obtener subtítulos usando captions-scraper adaptado para la nube
    const transcriptItems = await getSubtitles({
      videoID: videoId,
      lang: 'en' // Intenta traer los subtítulos base o automáticos disponibles
    });

    if (!transcriptItems || transcriptItems.length === 0) {
      return res.status(404).json({ success: false, error: 'El video no contiene subtítulos accesibles.' });
    }

    // Agrupar de 8 en 8 líneas
    const CHUNK_SIZE = 8;
    const groupedParagraphs = [];

    for (let i = 0; i < transcriptItems.length; i += CHUNK_SIZE) {
      const chunk = transcriptItems.slice(i, i + CHUNK_SIZE);
      const textBlock = chunk.map(item => item.text.trim()).join(' ');
      const startOffset = parseFloat(chunk[0].start) || 0;

      groupedParagraphs.push({
        offset: startOffset,
        text: textBlock
      });
    }

    // Traducir bloques
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
    console.error('❌ Error de subtítulos:', error.message);
    return res.status(500).json({
      success: false,
      error: 'No se pudieron extraer los subtítulos de este video en la nube. Prueba con otro enlace.'
    });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(rootPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
});