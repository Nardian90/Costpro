import { smartTranslate } from './src/lib/cost-engine/formula-utils';
const knownIds = new Set(['13.1', '14.1']);
const knownClasses = new Set(['1.1', '1.2']);
const formula = 'ref("13.1") * 1.2';
const translated = smartTranslate(formula, knownIds, knownClasses);
console.log('Original:', formula);
console.log('Translated:', translated);
