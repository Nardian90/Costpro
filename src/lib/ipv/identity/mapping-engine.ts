/**
 * Extensible Mapping Rules Engine for Identity Extraction
 * Extracts CI and Name from raw observation strings using regex and heuristics.
 */

export interface ExtractedIdentity {
  ci?: string;
  nombre?: string;
  phone?: string;
  card?: string;
}

export interface MappingRule {
  name: string;
  regex: RegExp;
  extractor: (match: RegExpMatchArray) => ExtractedIdentity;
}

/**
 * Normalizes names that might have artifacts from bank formatting.
 * Example: "CL AUDIA" -> "CLAUDIA", "BE NEFICIARIO" -> "BENEFICIARIO"
 */
function normalizeBankName(name: string): string {
  if (!name) return "";

  // The goal is to fix artifacts like "ARN ALDO" -> "ARNALDO"
  // but avoid "DE AVI" -> "DEAVI" or "G. AGUILERA" -> "G.AGUILERA"

  // We'll use a more targeted replacement for known artifact patterns
  // or use the space-insensitive matching later in the registry for deduplication.

  // Fix artifacts like "CL AUDIA" -> "CLAUDIA" by identifying single letters
  // followed by a space and then the rest of the name part.
  // This is a heuristic for BPA Bancamovil which often breaks names.
  let fixed = name.toUpperCase().replace(/\s+/g, " ").trim();

  // Pattern: Letter + Space + Rest (where the split shouldn't happen)
  // e.g., "CL AUDIA" -> "CLAUDIA"
  // We'll only do this for specific known prefixes if they look like artifacts
  fixed = fixed.replace(/\b(CL)\s(AUDIA)\b/g, "CLAUDIA");
  fixed = fixed.replace(/\b(BE)\s(NEFICIARIO)\b/g, "BENEFICIARIO");

  return fixed;
}

const RULES: MappingRule[] = [
  {
    name: 'BPA_BANCAMOVIL',
    // Matches: ORDENADA POR: <NAME> PAN: <CARD> ID_CUBACEL: <PHONES> ...
    regex: /ORDENADA POR:\s*(.*?)\s*PAN:\s*([\d*X]+)\s*ID_CUBACEL:\s*(.*?)(?:\s*[A-Z]{2,}\s*:|$)/i,
    extractor: (match) => {
      const nombreRaw = match[1].trim();
      const card = match[2].trim();
      const cubacelSection = match[3].trim();

      // Find the first number starting with 53
      const phoneMatch = cubacelSection.match(/\b(53\d{8})\b/);
      const phone = phoneMatch ? phoneMatch[1] : undefined;

      return {
        nombre: normalizeBankName(nombreRaw),
        card: card,
        phone: phone
      };
    }
  },
  {
    name: 'CI_11_DIGITS',
    regex: /\b(\d{11})\b/,
    extractor: (match) => ({ ci: match[1] })
  },
  {
    name: 'TRANSFER_FROM',
    // Updated to include dots (.) in the name capture group
    regex: /(?:TRANSFERENCIA DE:|PAGO DE:|DE:|ORDENADA POR:|OR\s?DENANTE NOMBRE:|ORDENANTE NOMBRE:|NOMBRE:)\s*([A-Z\s,.]+?)(?=\s*(?:NIT|PAN:|CUENTA|\||\d{11}|\d{4,16}|\n|$))/i,
    extractor: (match) => ({ nombre: normalizeBankName(match[1].trim()) })
  },
  {
    name: 'CARNET_LABEL',
    regex: /(?:CI|CARNET|ID|DNI)[:\s]+(\d{7,11})/i,
    extractor: (match) => ({ ci: match[1] })
  },
  {
    name: 'TARJETA_RED',
    // Extract numbers after "Tarjeta RED:", allowing spaces.
    regex: /Tarjeta RED:\s*([\d\s]{16,20})/i,
    extractor: (match) => {
      const card = match[1].replace(/\s+/g, '');
      if (card.length === 16) {
        return { card };
      }
      return {};
    }
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
      if (extracted.phone && !result.phone) result.phone = extracted.phone;
      if (extracted.card && !result.card) result.card = extracted.card;
    }
  }

  return result;
}
