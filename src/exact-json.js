// JSON numbers remain lexical values until the PNCP adapter explicitly normalizes them.
const numberPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const numbers = new WeakSet();
export class ExactJsonNumber {
  #source;
  constructor(source) {
    if (typeof source !== 'string' || !numberPattern.test(source)) throw new SyntaxError('Número JSON inválido.');
    this.#source = source;
    numbers.add(this);
    Object.freeze(this);
  }
  toString() { return this.#source; }
  [Symbol.toPrimitive](hint) {
    if (hint === 'number') throw new TypeError('Converta o número exato explicitamente pelo seu texto.');
    return this.#source;
  }
}
export const isExactJsonNumber = value => value !== null && typeof value === 'object' && numbers.has(value);

// Used only for duplicate keys. Compare number lexemes, including exponent and scale.
function equalValues(left, right) {
  const pending = [[left, right]];
  while (pending.length) {
    const [a, b] = pending.pop();
    if (a === b) continue;
    if (isExactJsonNumber(a) || isExactJsonNumber(b)) {
      if (!isExactJsonNumber(a) || !isExactJsonNumber(b) || a.toString() !== b.toString()) return false;
    } else if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
      const keys = Object.keys(a);
      if (keys.length !== Object.keys(b).length) return false;
      for (const key of keys) {
        if (!Object.hasOwn(b, key)) return false;
        pending.push([a[key], b[key]]);
      }
    } else return false;
  }
  return true;
}

export function parseExactJson(text) {
  if (typeof text !== 'string') throw new TypeError('JSON deve ser fornecido como texto.');
  let at = 0, result, rootSet = false;
  const stack = [], numeric = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  const invalid = () => { throw new SyntaxError(`JSON inválido na posição ${at}.`); };
  const whitespace = () => { while (at < text.length && /[\x20\t\r\n]/.test(text[at])) at++; };
  function string() {
    if (text[at] !== '"') return invalid();
    const start = at++;
    while (at < text.length) {
      const character = text[at++];
      if (character === '"') return JSON.parse(text.slice(start, at));
      if (character === '\\') at++;
    }
    return invalid();
  }
  function accept(value) {
    const parent = stack.at(-1);
    if (!parent) { result = value; rootSet = true; return; }
    if (parent.array) parent.value.push(value);
    else {
      if (Object.hasOwn(parent.value, parent.key) && !equalValues(parent.value[parent.key], value)) return invalid();
      Object.defineProperty(parent.value, parent.key, { value, enumerable: true, writable: true, configurable: true });
    }
    parent.state = 'separator';
  }
  function value() {
    whitespace();
    const character = text[at];
    if (character === '{' || character === '[') {
      at++;
      stack.push({ value: character === '[' ? [] : {}, array: character === '[', state: character === '[' ? 'firstValue' : 'firstKey' });
    } else if (character === '"') accept(string());
    else if (character === '-' || character >= '0' && character <= '9') {
      numeric.lastIndex = at;
      const match = numeric.exec(text);
      if (!match) return invalid();
      at = numeric.lastIndex; accept(new ExactJsonNumber(match[0]));
    } else {
      const literal = ['true', 'false', 'null'].find(word => text.startsWith(word, at));
      if (!literal) return invalid();
      at += literal.length; accept(literal === 'true' ? true : literal === 'false' ? false : null);
    }
  }
  // Containers are accepted into their parent only once complete, so duplicate
  // nested values can be compared without recursive parser calls or partial trees.
  while (true) {
    whitespace();
    const current = stack.at(-1);
    if (!current) {
      if (rootSet) { if (at !== text.length) return invalid(); return result; }
      value(); continue;
    }
    const close = current.array ? ']' : '}';
    if (current.state === 'separator') {
      if (text[at] === ',') { at++; current.state = current.array ? 'value' : 'key'; continue; }
      if (text[at] !== close) return invalid();
    } else if ((current.state === 'firstKey' || current.state === 'firstValue') && text[at] === close) {
      // Empty container.
    } else if (!current.array) {
      current.key = string(); whitespace();
      if (text[at++] !== ':') return invalid();
      current.state = 'value'; value(); continue;
    } else { value(); continue; }
    at++; stack.pop(); accept(current.value);
  }
}
