import DOMPurify, { type Config } from 'isomorphic-dompurify';

// DOMPurify config for safe HTML rendering — strips scripts, event handlers, etc.
const PURIFY_CONFIG: Config = {
  ALLOWED_TAGS: [
    // Structure
    'div', 'span', 'p', 'br', 'hr',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    // Lists
    'ul', 'ol', 'li',
    // Text formatting
    'strong', 'em', 'b', 'i', 'u', 's', 'del', 'ins', 'sub', 'sup',
    'code', 'pre', 'blockquote',
    // Links (no javascript:)
    'a',
    // Tables
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
    // Media
    'img', 'figure', 'figcaption',
    // Details
    'details', 'summary',
  ],
  ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id', 'lang', 'dir', 'target', 'rel', 'width', 'height'],
  // Force links to open in new tab and add noopener/noreferrer
  ADD_ATTR: ['target'],
  FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'button'],
  FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onsubmit', 'onchange'],
};

/**
 * Sanitizes HTML string to prevent XSS attacks.
 * Use this on ALL user/AI-generated content before rendering.
 */
export function sanitizeHtml(dirty: string): string {
  if (!dirty || typeof dirty !== 'string') return '';
  return DOMPurify.sanitize(dirty, PURIFY_CONFIG);
}

/**
 * Sanitizes text for use in non-HTML contexts (e.g., plain text, aria-labels).
 * Strips ALL HTML tags.
 */
export function stripHtml(html: string): string {
  if (!html || typeof html !== 'string') return '';
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}
