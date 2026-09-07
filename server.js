import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

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
  'Español': 'Spanish',
  'Inglés': 'English',
  'Francés': 'French',
  'Alemán': 'German',
  'Italiano': 'Italian',
  'Portugués': 'Portuguese'
};

app.post('/api/translate-video', async (req, res) => {
  const { videoUrl, targetLang } = req.body;

  if (!videoUrl) {
    return res.status(400).json({ success: false, error: 'La URL del video es obligatoria.' });
  }

  try {
    // 1. Obtener metadatos reales del video de YouTube de forma segura
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`;
    const response = await fetch(oembedUrl);
    
    if (!response.ok) {
      return res.status(404).json({ success: false, error: 'No se pudo encontrar el video de YouTube especificado.' });
    }

    const data = await response.json();
    const videoTitle = data.title || "Video de YouTube";
    const targetLanguageName = langMap[targetLang] || 'Spanish';

    // 2. Consultar directamente a la API de Groq usando fetch nativo
    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return res.status(500).json({ success: false, error: 'Falta configurar GROQ_API_KEY en las variables de entorno de Render.' });
    }

    const prompt = `Actúa como un sistema experto de transcripción y traducción de videos. 
    El video analizado se titula: "${videoTitle}".
    Genera una transcripción sincronizada con marcas de tiempo (formato (M:SS)) dividida en bloques lógicos de párrafos, completamente traducida al idioma: ${targetLanguageName}. 
    Asegúrate de que luzca natural, profesional y directamente relacionada con la temática del título del video. No agregues texto introductorio, solo la transcripción con marcas de tiempo.`;

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      })
    });

    const groqData = await groqResponse.json();

    if (!groqResponse.ok) {
      console.error('❌ Error de Groq API:', groqData);
      return res.status(500).json({ success: false, error: 'Error al comunicarse con el modelo de inteligencia artificial.' });
    }

    const translatedTranscript = groqData.choices[0]?.message?.content || "No se pudo generar la transcripción.";

    return res.json({
      success: true,
      translation: translatedTranscript
    });

  } catch (error) {
    console.error('❌ Error en el servidor:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Ocurrió un error al procesar la solicitud en la nube.'
    });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(rootPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
});