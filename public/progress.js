// Estimativa de conclusão a partir das amostras de progresso da exportação.
// A primeira amostra não gera estimativa: a taxa ainda é desconhecida.
export function createProgressEstimator({ smoothing = 0.3, now = Date.now } = {}) {
  let lastRows = 0;
  let lastAt = null;
  let rate = 0;
  return {
    /** @param {{rows: number, total: number, at?: number}} sample */
    update({ rows, total, at = now() }) {
      if (lastAt !== null) {
        const seconds = (at - lastAt) / 1000;
        const delta = rows - lastRows;
        if (seconds > 0 && delta > 0) {
          const instant = delta / seconds;
          rate = rate ? rate * (1 - smoothing) + instant * smoothing : instant;
        }
      }
      lastRows = rows;
      lastAt = at;
      if (!rate || rows >= total) return 0;
      return Math.max(1, Math.ceil((total - rows) / rate));
    },
  };
}
