import { createInterface } from 'node:readline/promises';
import { normalizeEndpoint, validateModel } from './config.js';

/** Resolve a 1-based index or unique model ID. Numeric IDs use index precedence. */
export function resolveSelection(models, selector) {
  if (/^\d+$/.test(selector)) {
    const index = Number(selector) - 1;
    if (Number.isSafeInteger(index) && index >= 0 && index < models.length) return models[index];
    throw new Error(`Model index must be between 1 and ${models.length}.`);
  }
  const matches = models.filter((entry) => entry.model.trim() === selector);
  if (matches.length === 1) return matches[0];
  throw new Error(matches.length > 1 ? 'Duplicate model ID; select a numeric index.' : 'Unknown model selection; use a listed index or model ID.');
}

/** Validate all entries before choosing one; never silently choose in a pipeline. */
export async function selectModel(config, selector, input = process.stdin, output = process.stderr) {
  const wrapped = config && Object.hasOwn(config, 'models');
  if (wrapped && Object.keys(config).some((key) => key !== 'models')) throw new Error('The models wrapper may contain only models.');
  const models = wrapped ? config.models : [config];
  if (!Array.isArray(models) || models.length === 0) throw new Error('models must be a non-empty array.');
  models.forEach(validateModel);
  if (selector !== undefined) return resolveSelection(models, selector);
  if (models.length === 1) return models[0];
  if (!input.isTTY || !output.isTTY) throw new Error('Multiple models configured. Use --select-model <index|model-id> before the folder for non-interactive runs.');
  output.write('Configured models\n');
  models.forEach((entry, index) => output.write(`  ${index + 1}. ${entry.model.trim()} @ ${normalizeEndpoint(entry.baseUrl)}\n`));
  const picker = createInterface({ input, output });
  const controller = new AbortController();
  const cancel = () => controller.abort();
  picker.once('close', cancel);
  picker.once('SIGINT', cancel);
  try {
    return resolveSelection(models, (await picker.question('Select model [1]: ', { signal: controller.signal })).trim() || '1');
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Model selection cancelled.');
    throw error;
  } finally {
    picker.removeListener('close', cancel);
    picker.removeListener('SIGINT', cancel);
    picker.close();
  }
}
