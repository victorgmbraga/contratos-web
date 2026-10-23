// Contadores monotônicos por tipo de operação. Um token novo invalida as
// respostas pendentes do token anterior sem precisar de campos espalhados.
export function createSession() {
  const counters = new Map();
  return {
    next(kind) {
      const value = (counters.get(kind) || 0) + 1;
      counters.set(kind, value);
      return value;
    },
    last(kind) {
      return counters.get(kind) || 0;
    },
    current(kind, value) {
      return (counters.get(kind) || 0) === value;
    },
  };
}
