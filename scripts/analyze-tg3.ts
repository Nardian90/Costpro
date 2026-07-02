import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';

async function analyzeImage() {
  const zai = await ZAI.create();
  const imageBuffer = fs.readFileSync('/home/z/my-project/upload/pasted_image_1782960304206.png');
  const base64Image = imageBuffer.toString('base64');

  const response = await zai.chat.completions.createVision({
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Esta es una captura de la app CostPro o de Telegram. Describe EXACTAMENTE qué se ve: qué vista es, qué conversaciones aparecen, qué mensajes hay, si hay errores visibles. Si es la vista de Conversaciones de Telegram en CostPro, dime qué contactos aparecen y qué mensajes se ven.' },
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
