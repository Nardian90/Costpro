/**
 * EM-R4: OCR de factura paper impresa con VLM.
 *
 * Recibe una imagen base64 de una factura y usa z-ai-web-dev-sdk
 * para extraer los items (nombre, SKU si visible, cantidad, costo unitario).
 *
 * Retorna un JSON con los items detectados para que el frontend los agregue
 * a la recepción.
 */
import { NextResponse, type NextRequest } from "next/server";
import { withTracing } from "@/lib/observability";

interface ExtractedItem {
  name: string;
  sku: string | null;
  quantity: number;
  unit_cost: number;
  unit_of_measure: string;
  sale_price: number | null;
}

async function postHandler(request: NextRequest) {
  let body: { image?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Bad Request", message: "JSON inválido" },
      { status: 400 }
    );
  }

  if (!body.image || !body.image.startsWith("data:image/")) {
    return NextResponse.json(
      { error: "Bad Request", message: "Se requiere una imagen base64 (data:image/...)" },
      { status: 400 }
    );
  }

  try {
    // Import dinámico para evitar cargar el SDK en cold start innecesariamente
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();

    const prompt = `Analiza esta factura de compra impresa y extrae TODOS los productos/items listados.

Para cada item, identifica:
1. Nombre del producto (obligatorio)
2. SKU o código (si es visible, si no null)
3. Cantidad (número, si no se ve asume 1)
4. Costo unitario (número, sin símbolos de moneda)
5. Unidad de medida (unidad, kg, L, caja, etc. — si no se ve asume "unidad")
6. Precio de venta (si está visible, si no null)

Retorna EXCLUSIVAMENTE un JSON válido con este formato (sin markdown, sin texto adicional):
{
  "items": [
    {
      "name": "Arroz Integral 5kg",
      "sku": "ARZ-001",
      "quantity": 50,
      "unit_cost": 12.50,
      "unit_of_measure": "unidad",
      "sale_price": null
    }
  ],
  "supplier": "Nombre del proveedor si está visible",
  "invoice_number": "Número de factura si está visible",
  "total_detected": 625.00,
  "confidence": "high|medium|low"
}

Si no puedes leer la factura o está borrosa, retorna:
{"items": [], "supplier": null, "invoice_number": null, "total_detected": 0, "confidence": "low"}
`;

    const response = await zai.chat.completions.createVision({
      model: "glm-4.6v",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: body.image } },
          ],
        },
      ],
      thinking: { type: "disabled" },
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: "VLM Error", message: "Respuesta vacía del modelo" },
        { status: 500 }
      );
    }

    // Intentar parsear el JSON (el modelo puede envolver en markdown)
    let parsed: {
      items: ExtractedItem[];
      supplier?: string | null;
      invoice_number?: string | null;
      total_detected?: number;
      confidence?: string;
    };

    try {
      // Limpiar markdown si existe
      const cleanContent = content
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      parsed = JSON.parse(cleanContent);
    } catch {
      // Si no se puede parsear, retornar el contenido crudo
      return NextResponse.json(
        {
          error: "Parse Error",
          message: "El modelo no retornó JSON válido",
          raw_content: content,
        },
        { status: 422 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        items: parsed.items || [],
        supplier: parsed.supplier || null,
        invoice_number: parsed.invoice_number || null,
        total_detected: parsed.total_detected || 0,
        confidence: parsed.confidence || "medium",
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("[ocr-receipt] Error:", error);
    return NextResponse.json(
      {
        error: "Internal Error",
        message: error?.message || "Error al procesar la imagen",
      },
      { status: 500 }
    );
  }
}

export const POST = withTracing(postHandler as any, "POST /api/inventory/ocr-receipt");
