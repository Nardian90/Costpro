/**
 * Extensible Mapping Rules Engine for Identity Extraction
 * Extracts CI and Name from raw observation strings using regex and heuristics.
 */

export interface ExtractedIdentity {
  ci?: string;
  nombre?: string;
}

export interface MappingRule {
  name: string;
  regex: RegExp;
  extractor: (match: RegExpMatchArray) => ExtractedIdentity;
}

const RULES: MappingRule[] = [
  {
    name: 'CI_11_DIGITS',
    regex: /\b(\d{11})\b/,
    extractor: (match) => ({ ci: match[1] })
  },
  {
    name: 'TRANSFER_FROM',
    regex: /(?:TRANSFERENCIA DE:|PAGO DE:|DE:|ORDENADA POR:|ORDENANTE NOMBRE:)\s*([A-Z\s,]+?)(?=\s*(?:NIT|PAN:|CUENTA|\||\d{11}|\d{4,16}|\n|$))/i,
    extractor: (match) => ({ nombre: match[1].trim().toUpperCase() })
  },
  {
    name: 'CARNET_LABEL',
    regex: /(?:CI|CARNET|ID|DNI)[:\s]+(\d{7,11})/i,
    extractor: (match) => ({ ci: match[1] })
  }
];

export function extractIdentity(observations: string): ExtractedIdentity {
  if (!observations) return {};

  const result: ExtractedIdentity = {};

  for (const rule of RULES) {
    const match = observations.match(rule.regex);
    if (match) {
      const extracted = rule.extractor(match);
      if (extracted.ci && !result.ci) result.ci = extracted.ci;
      if (extracted.nombre && !result.nombre) result.nombre = extracted.nombre;
    }
  }

  // Heuristic: If we have a very long name that might contain a CI, try again
  if (result.nombre && result.nombre.length > 50) {
      // Potentially truncated or mis-captured
  }

  return result;
}
