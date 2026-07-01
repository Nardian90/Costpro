import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface MVTPreviewProps {
  content: string;
}

export const MVTPreview: React.FC<MVTPreviewProps> = ({ content }) => {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-sm font-medium">Vista Previa (TXT UTF-8)</CardTitle>
      </CardHeader>
      <CardContent>
        <pre className="bg-muted p-4 rounded-md overflow-auto max-h-[500px] text-xs font-mono whitespace-pre">
          {content || "No hay contenido generado."}
        </pre>
      </CardContent>
    </Card>
  );
};
