import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { YoutubeTranscript } from 'youtube-transcript';
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

function formatTimestamp(rawOffset) {
  const totalSeconds = rawOffset > 1000 ? Math.floor(rawOffset / 1000) : Math.floor(rawOffset);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `(${minutes}:${seconds < 10 ? '0' : ''}${seconds})`;
}

app.post('/api/translate-video', async (req, res) => {
  const { videoUrl, targetLang } = req.body;

  if (!videoUrl) {
    return res.status(400).json({ success: false, error: 'La URL del video es obligatoria.' });
  }

  try {
    // Petición con cabeceras de navegador para evitar bloqueos en la nube
    const transcriptItems = await YoutubeTranscript.fetchTranscript(videoUrl, {
      lang: 'es',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!transcriptItems || transcriptItems.length === 0) {
      return res.status(404).json({ success: false, error: 'El video no contiene subtítulos disponibles.' });
    }

    // Agrupar de 8 en 8 líneas
    const CHUNK_SIZE = 8;
    const groupedParagraphs = [];

    for (let i = 0; i < transcriptItems.length; i += CHUNK_SIZE) {
      const chunk = transcriptItems.slice(i, i + CHUNK_SIZE);
      const textBlock = chunk.map(item => item.text.trim()).join(' ');
      const startOffset = chunk[0].offset || chunk[0].start || 0;

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
    console.error('❌ Error de transcripción:', error.message);
    return res.status(500).json({
      success: false,
      error: 'No se pudo obtener la transcripción de este video. Asegúrate de que tenga subtítulos habilitados.'
    });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(rootPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
});