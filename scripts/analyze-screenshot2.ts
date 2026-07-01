import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';

async function analyzeImage() {
  const zai = await ZAI.create();
  const imageBuffer = fs.readFileSync('/home/z/my-project/upload/pasted_image_1782948945556.png');
  const base64Image = imageBuffer.toString('base64');

  const response = await zai.chat.completions.createVision({
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Esta es una captura de pantalla de Telegram. Transcribe EXACTAMENTE todo el texto que aparece, especialmente cualquier número, ID, o dato numérico. Si hay un "Chat ID" o "ID" de grupo, dímelo claramente con el número exacto.' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } }
        ]
      }
    ],
    thinking: { type: 'disabled' }
  });

  console.log(response.choices[0]?.message?.content);
}

analyzeImage().catch(console.error);
