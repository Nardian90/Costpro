import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';

async function analyzeImage() {
  const zai = await ZAI.create();
  const imageBuffer = fs.readFileSync('/home/z/my-project/upload/pasted_image_1782953646173.png');
  const base64Image = imageBuffer.toString('base64');

  const response = await zai.chat.completions.createVision({
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Mira muy cuidadosamente la parte SUPERIOR de la captura. ¿Hay un espacio en blanco donde debería ir el header? ¿El header está recortado, oculto, o superpuesto por algo? Describe milimétricamente qué hay en los primeros 100 píxeles desde arriba. ¿Se ve el sidebar completo con todos los items de menú, o está truncado?' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } }
        ]
      }
    ],
    thinking: { type: 'disabled' }
  });

  console.log('===RESPUESTA===');
  console.log(response.choices[0]?.message?.content);
  console.log('===FIN===');
}

analyzeImage().catch(console.error);
