/** Parse VS Code JSONC while retaining offsets for one-property edits. */
export function parseSettings(source) {
  let clean = '', inString = false, escaped = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i], n = source[i + 1];
    if (inString) {
      clean += c;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') { inString = true; clean += c; }
    else if (c === '/' && n === '/') {
      clean += '  '; i++;
      while (i + 1 < source.length && !'\r\n'.includes(source[i + 1])) { clean += ' '; i++; }
    } else if (c === '/' && n === '*') {
      clean += '  '; i++;
      let closed = false;
      while (i + 1 < source.length) {
        i++;
        if (source[i] === '*' && source[i + 1] === '/') { clean += '  '; i++; closed = true; break; }
        clean += '\r\n'.includes(source[i]) ? source[i] : ' ';
      }
      if (!closed) throw new Error('VS Code settings contain an unterminated comment.');
    } else clean += c === '\uFEFF' ? ' ' : c;
  }
  // Replace trailing commas without altering offsets or strings.
  inString = escaped = false;
  let normalized = '';
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inString) {
      normalized += c;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') { inString = true; normalized += c; }
    else if (c === ',' && /^\s*[}\]]/.test(clean.slice(i + 1))) normalized += ' ';
    else normalized += c;
  }
  let value;
  try { value = JSON.parse(normalized); } catch { throw new Error('VS Code settings must be valid JSON/JSONC; no settings were changed.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('VS Code settings must be an object.');
  const properties = [];
  let pos = clean.indexOf('{') + 1;
  const skip = () => { while (/\s/.test(clean[pos] ?? '') && pos < clean.length) pos++; };
  const stringEnd = start => {
    let i = start + 1;
    while (i < clean.length) { if (clean[i] === '\\') i += 2; else if (clean[i++] === '"') return i; }
    throw new Error('Invalid settings string.');
  };
  while (pos < clean.length) {
    skip();
    if (clean[pos] === '}') break;
    const start = pos, keyEnd = stringEnd(pos), key = JSON.parse(clean.slice(pos, keyEnd));
    pos = keyEnd; skip(); pos++; skip();
    const valueStart = pos;
    let depth = 0;
    while (pos < clean.length) {
      const c = clean[pos];
      if (c === '"') { pos = stringEnd(pos); continue; }
      if (depth === 0 && (c === ',' || c === '}')) break;
      if (c === '{' || c === '[') depth++;
      if (c === '}' || c === ']') depth--;
      pos++;
    }
    let valueEnd = pos;
    while (/\s/.test(clean[valueEnd - 1] ?? '')) valueEnd--;
    properties.push({ key, start, valueStart, valueEnd, comma: clean[pos] === ',' ? pos : null });
    if (clean[pos] === ',') pos++; else break;
  }
  if (new Set(properties.map(p => p.key)).size !== properties.length) throw new Error('Duplicate VS Code setting keys are not supported; no settings were changed.');
  return { value, properties, close: clean.lastIndexOf('}'), clean };
}

/** Change/remove one top-level property without rewriting unrelated settings/comments. */
export function editSetting(source, key, replacement, remove = false) {
  const parsed = parseSettings(source), property = parsed.properties.find(p => p.key === key);
  let output;
  if (property) {
    if (!remove) output = source.slice(0, property.valueStart) + JSON.stringify(replacement) + source.slice(property.valueEnd);
    else if (property.comma !== null) output = source.slice(0, property.start) + source.slice(property.comma + 1);
    else {
      const previous = parsed.properties[parsed.properties.indexOf(property) - 1];
      output = previous?.comma != null ? source.slice(0, previous.comma) + source.slice(previous.comma + 1, property.start) + source.slice(property.valueEnd) :
        source.slice(0, property.start) + source.slice(property.valueEnd);
    }
  } else if (remove) output = source;
  else {
    const newline = source.includes('\r\n') ? '\r\n' : '\n';
    const previous = parsed.properties.at(-1);
    const comma = previous && previous.comma === null ? ',' : '';
    output = source.slice(0, parsed.close) + comma + newline + `  ${JSON.stringify(key)}: ${JSON.stringify(replacement)}` + newline + source.slice(parsed.close);
  }
  parseSettings(output);
  return output;
}
