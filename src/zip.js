// Arquivo ZIP sem dependências: entradas armazenadas (método 0) ou comprimidas com
// deflate-raw (método 8) quando o navegador oferece CompressionStream. Sem ZIP64:
// o chamador limita o volume total bem abaixo de 4 GiB e a quantidade de entradas.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** @param {Uint8Array} bytes @param {number} [crc] */
export function crc32(bytes, crc = 0) {
  let c = ~crc >>> 0;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

export const ZIP_MAX_BYTES = 0xfffffffe;
export const ZIP_MAX_ENTRIES = 0xfffe;

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

async function deflateRaw(bytes) {
  if (typeof CompressionStream !== 'function') return null;
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

/** Monta o ZIP em memória como lista de partes (Uint8Array), prontas para um Blob. */
export function zipWriter({ now = new Date() } = {}) {
  const encoder = new TextEncoder(),
    stamp = dosDateTime(now),
    parts = [],
    central = [],
    names = new Set();
  let offset = 0;
  return {
    get bytes() {
      return offset;
    },
    get entries() {
      return central.length;
    },
    /**
     * @param {string} name Caminho dentro do ZIP, com "/" entre pastas.
     * @param {Uint8Array} data
     * @param {{compress?: boolean}} [options]
     */
    async add(name, data, { compress = false } = {}) {
      if (!name || name.startsWith('/') || name.split('/').some(part => !part || part === '.' || part === '..'))
        throw new Error('Nome de entrada ZIP inválido.');
      if (names.has(name)) throw new Error('Entrada ZIP duplicada.');
      if (central.length >= ZIP_MAX_ENTRIES) throw new Error('Entradas demais no ZIP.');
      const nameBytes = encoder.encode(name),
        crc = crc32(data),
        packed = compress ? await deflateRaw(data) : null,
        useDeflate = !!packed && packed.length < data.length,
        body = useDeflate ? packed : data,
        method = useDeflate ? 8 : 0;
      if (offset + 30 + nameBytes.length + body.length > ZIP_MAX_BYTES) throw new Error('ZIP grande demais.');
      const header = new Uint8Array(30 + nameBytes.length),
        view = new DataView(header.buffer);
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 0x0800, true); // nomes em UTF-8
      view.setUint16(8, method, true);
      view.setUint16(10, stamp.time, true);
      view.setUint16(12, stamp.date, true);
      view.setUint32(14, crc, true);
      view.setUint32(18, body.length, true);
      view.setUint32(22, data.length, true);
      view.setUint16(26, nameBytes.length, true);
      header.set(nameBytes, 30);
      names.add(name);
      central.push({ nameBytes, crc, method, compressed: body.length, size: data.length, offset });
      parts.push(header, body);
      offset += header.length + body.length;
    },
    /** @returns {Uint8Array[]} */
    finish() {
      const start = offset;
      let size = 0;
      for (const entry of central) {
        const record = new Uint8Array(46 + entry.nameBytes.length),
          view = new DataView(record.buffer);
        view.setUint32(0, 0x02014b50, true);
        view.setUint16(4, 20, true);
        view.setUint16(6, 20, true);
        view.setUint16(8, 0x0800, true);
        view.setUint16(10, entry.method, true);
        view.setUint16(12, stamp.time, true);
        view.setUint16(14, stamp.date, true);
        view.setUint32(16, entry.crc, true);
        view.setUint32(20, entry.compressed, true);
        view.setUint32(24, entry.size, true);
        view.setUint16(28, entry.nameBytes.length, true);
        view.setUint32(42, entry.offset, true);
        record.set(entry.nameBytes, 46);
        parts.push(record);
        size += record.length;
      }
      const end = new Uint8Array(22),
        view = new DataView(end.buffer);
      view.setUint32(0, 0x06054b50, true);
      view.setUint16(8, central.length, true);
      view.setUint16(10, central.length, true);
      view.setUint32(12, size, true);
      view.setUint32(16, start, true);
      parts.push(end);
      offset += size + end.length;
      return parts;
    }
  };
}
