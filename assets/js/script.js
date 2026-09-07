// Referencias DOM
const translatorForm = document.getElementById('translatorForm');
const videoUrlInput = document.getElementById('videoUrl');
const targetLangSelect = document.getElementById('targetLang');
const translateBtn = document.getElementById('translateBtn');

const videoPreviewContainer = document.getElementById('videoPreviewContainer');
const videoIframe = document.getElementById('videoIframe');

const translationResult = document.getElementById('translationResult');
const translationText = document.getElementById('translationText');
const btnCopy = document.getElementById('btnCopy');

// Botones de exportación
const btnExportTXT = document.getElementById('btnExportTXT');
const btnExportPDF = document.getElementById('btnExportPDF');
const btnExportExcel = document.getElementById('btnExportExcel');
const btnExportPPT = document.getElementById('btnExportPPT');

// Variable para controlar el temporizador de cuota
let countdownTimer = null;

function getYouTubeVideoId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

// Función para reiniciar el estado del contenedor de resultados a su estado oculto original
function resetResultBox() {
  if (translationResult) {
    translationResult.className = 'result-box mt-4 d-none';
  }
}

// Función para manejar la cuenta regresiva de 30 segundos
function startQuotaCountdown(seconds = 30) {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }

  let remaining = seconds;
  translateBtn.disabled = true;

  const updateUI = () => {
    if (remaining > 0) {
      showError(`Has alcanzado el límite de la API. Podrás intentar de nuevo en ${remaining} segundo${remaining > 1 ? 's' : ''}.`);
      translateBtn.innerHTML = `<i class="bi bi-clock-history me-2"></i>Espere ${remaining}s...`;
      remaining--;
    } else {
      clearInterval(countdownTimer);
      countdownTimer = null;
      
      // Habilitar botón para un nuevo intento
      translateBtn.disabled = false;
      translateBtn.innerHTML = `<i class="bi bi-magic me-2"></i>Obtener y traducir transcripción`;
      
      // Mensaje de confirmación en la UI
      if (translationResult) {
        translationResult.className = 'result-box mt-4 alert alert-success d-block';
      }
      if (translationText) {
        translationText.textContent = '¡Tiempo finalizado! Ya puedes volver a presionar el botón para reintentar.';
      }
    }
  };

  updateUI();
  countdownTimer = setInterval(updateUI, 1000);
}

translatorForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  // Si aún transcurre el temporizador, impedimos el envío
  if (countdownTimer) return;

  const url = videoUrlInput.value.trim();
  const targetLang = targetLangSelect.value;

  if (!url) {
    showError('Por favor, ingresa un enlace válido.');
    return;
  }

  const videoId = getYouTubeVideoId(url);
  if (videoId) {
    videoIframe.src = `https://www.youtube.com/embed/${videoId}`;
    videoPreviewContainer.classList.remove('d-none');
  } else {
    videoPreviewContainer.classList.add('d-none');
    videoIframe.src = '';
  }

  // Deshabilitar botón durante la petición
  translateBtn.disabled = true;
  translateBtn.innerHTML = `
    <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
    Procesando transcripción y traduciendo...
  `;
  
  // Limpiar y Ocultar el contenedor de resultados antes de consultar
  resetResultBox();
  if (translationText) translationText.textContent = '';

  try {
    const response = await fetch('/api/translate-video', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ videoUrl: url, targetLang: targetLang })
    });

    const data = await response.json();

    // Detección de sobrepaso de cuotas (HTTP 429)
    if (response.status === 429) {
      startQuotaCountdown(30);
      return;
    }

    if (!response.ok || !data.success) {
      showError(data.error || 'No se pudo obtener la transcripción.');
      return;
    }

    // Mostrar ÚNICAMENTE el resultado cuando la traducción sea exitosa
    if (translationResult && translationText) {
      translationResult.className = 'result-box mt-4 d-block'; // Quita la clase d-none
      translationText.textContent = data.translation;
    }

  } catch (error) {
    console.error('Error de red/servidor:', error);
    showError('No se pudo conectar con el servidor backend. Verifica tu conexión.');
  } finally {
    // Restaurar estado del botón únicamente si no hay temporizador en curso
    if (!countdownTimer) {
      translateBtn.disabled = false;
      translateBtn.innerHTML = `<i class="bi bi-magic me-2"></i>Obtener y traducir transcripción`;
    }
  }
});

function showError(message) {
  if (translationResult && translationText) {
    translationResult.className = 'result-box mt-4 alert alert-danger d-block';
    translationText.textContent = `Error: ${message}`;
  }
}

// Botón Copiar
btnCopy?.addEventListener('click', () => {
  if (!translationText || !translationText.textContent) return;
  
  navigator.clipboard.writeText(translationText.textContent).then(() => {
    const originalText = btnCopy.innerHTML;
    btnCopy.innerHTML = '<i class="bi bi-check2 me-1"></i>¡Copiado!';
    setTimeout(() => { btnCopy.innerHTML = originalText; }, 2000);
  });
});

// Descargar en Formato .TXT
btnExportTXT?.addEventListener('click', () => {
  const content = translationText ? translationText.textContent : '';
  if (!content || content.startsWith('Error:')) {
    alert('No hay transcripción traducida disponible para exportar.');
    return;
  }
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'transcripcion_traducida.txt';
  a.click();
  URL.revokeObjectURL(url);
});

// Descarga alternativa imprimible / PDF
btnExportPDF?.addEventListener('click', () => {
  const content = translationText ? translationText.textContent : '';
  if (!content || content.startsWith('Error:')) {
    alert('No hay transcripción traducida disponible para exportar.');
    return;
  }
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html>
      <head><title>Transcripción Traducida</title></head>
      <body style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6;">
        <h2>Transcripción Traducida - TraductorTube</h2>
        <hr>
        <p style="white-space: pre-wrap;">${content}</p>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.print();
});

function getTranscriptText() {
  const container = document.getElementById('translationText');
  return container ? container.innerText.trim() : '';
}

// Exportar a Excel (.xlsx)
function exportToExcel() {
  const text = getTranscriptText();
  if (!text || text.startsWith('Error:')) return alert('No hay transcripción para exportar.');

  const lines = text.split('\n');
  const data = lines.filter(line => line.trim() !== '').map(line => {
    const match = line.match(/^(\(\d+:\d+\))\s*(.*)/);
    if (match) {
      return { Tiempo: match[1], Transcripción: match[2] };
    }
    return { Tiempo: '', Transcripción: line };
  });

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Transcripción");

  worksheet['!cols'] = [{ wch: 12 }, { wch: 100 }];

  XLSX.writeFile(workbook, "transcripcion.xlsx");
}

// Exportar a PowerPoint (.pptx)
function exportToPowerPoint() {
  const text = getTranscriptText();
  if (!text || text.startsWith('Error:')) return alert('No hay transcripción para exportar.');

  if (typeof PptxGenJS === 'undefined') {
    return alert('La librería de PowerPoint no se ha cargado correctamente.');
  }

  const pptx = new PptxGenJS();
  const lines = text.split('\n').filter(line => line.trim() !== '');

  let slide = pptx.addSlide();
  slide.addText("Transcripción de Video", { x: 1, y: 2, fontSize: 24, bold: true, color: "363636" });

  for (let i = 0; i < lines.length; i += 5) {
    const contentSlide = pptx.addSlide();
    const slideContent = lines.slice(i, i + 5).join('\n\n');
    
    contentSlide.addText(slideContent, {
      x: 0.8,
      y: 0.8,
      w: 8.4,
      h: 5.5,
      fontSize: 14,
      color: "232323",
      align: "left",
      valign: "top"
    });
  }

  pptx.writeFile({ fileName: "transcripcion.pptx" });
}

// Asignar los eventos a los botones del menú desplegable
btnExportExcel?.addEventListener('click', (e) => {
  e.preventDefault();
  exportToExcel();
});

btnExportPPT?.addEventListener('click', (e) => {
  e.preventDefault();
  exportToPowerPoint();
});