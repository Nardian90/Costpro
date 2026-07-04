import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';

async function analyzeImage() {
  const zai = await ZAI.create();
  const imageBuffer = fs.readFileSync('/home/z/my-project/upload/pasted_image_1782959555465.png');
  const base64Image = imageBuffer.toString('base64');

  const response = await zai.chat.completions.createVision({
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe exactamente qué se ve en esta captura de pantalla. Si es Telegram, dime qué chat es, qué mensajes hay, y si hay algún error. Transcribe todo el texto visible.' },
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
