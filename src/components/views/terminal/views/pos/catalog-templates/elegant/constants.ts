/**
 * Layout constants for the Elegant Catalog template.
 *
 * All measurements in mm (A4: 210 × 297).
 */

// ── Page ────────────────────────────────────────────────────
export const PAGE_W = 210;
export const PAGE_H = 297;
export const MARGIN_L = 10;
export const MARGIN_R = 10;
export const MARGIN_T = 10;
export const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R; // 190 mm

// ── Grid (4 columns) ───────────────────────────────────────
export const COLS = 4;
export const COL_GAP = 3.5;
export const CARD_W = (CONTENT_W - COL_GAP * (COLS - 1)) / COLS; // ~44.4 mm
export const CARD_PAD = 1.5;
export const CARD_IMG_H = 30;       // image area height
export const CARD_BODY_H = 14;      // text area height (slightly bigger)
export const CARD_H = CARD_IMG_H + CARD_BODY_H; // ~44 mm
export const ROW_GAP = 3.5;

// ── Category band ────────────────────────────────────────────
export const CAT_BAND_H = 7;

// ── Footer ──────────────────────────────────────────────────
export const FOOTER_H = 14;
export const MAX_Y = PAGE_H - FOOTER_H - 6; // 277 mm

// ── Body page top margin (after header) ─────────────────────
export const BODY_START = 11;

// ── Cover ──────────────────────────────────────────────────
export const COVER_ACCENT_H = 1.5;
export const COVER_BAND_H = 48;
export const COVER_BOTTOM_H = 22;
// Derived: available content height between band and bottom bar
export const COVER_CONTENT_TOP = COVER_ACCENT_H + COVER_BAND_H + 2; // ~51.5 mm
export const COVER_CONTENT_H = PAGE_H - COVER_CONTENT_TOP - COVER_BOTTOM_H - 2; // ~223 mm

// ── Dense list (no-image products) ──────────────────────────
export const LIST_COLS = 2;
export const LIST_LINE_H = 5.5;
export const LIST_COL_GAP = COL_GAP;
export const LIST_COL_W = (CONTENT_W - LIST_COL_GAP) / LIST_COLS;
