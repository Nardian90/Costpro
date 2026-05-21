'use client';

import { ViewLoadingSplash } from './ViewLoadingSplash';

interface PdfExportOverlayProps {
  isVisible: boolean;
  message?: string;
}

/**
 * PdfExportOverlay — Thin wrapper for PDF export loading overlay.
 * Delegates to ViewLoadingSplash in overlay mode with PDF-specific labels.
 */
export const PdfExportOverlay: React.FC<PdfExportOverlayProps> = ({ isVisible, message }) => {
  if (!isVisible) return null;
  return <ViewLoadingSplash overlay label={message || 'Generando PDF...'} showTips />;
};
