export class AppError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {number} [status]
   * @param {Record<string, any>} [details]
   * @param {boolean} [retryable]
   */
  constructor(code, message, status = 400, details = {}, retryable = false) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
    this.retryable = retryable;
  }
}
export function fail(code, message, status = 400, details = {}, retryable = false) {
  throw new AppError(code, message, status, details, retryable);
}
export const assert = (condition, code, message, status, details, retryable) => {
  if (!condition) fail(code, message, status, details, retryable);
};
export function checkKeys(object, allowed, context) {
  assert(object !== null && typeof object === 'object' && !Array.isArray(object), 'INVALID_TYPE', `${context} deve ser um objeto.`);
  for (const key of Object.keys(object)) assert(allowed.includes(key), 'UNKNOWN_FIELD', `Campo desconhecido em ${context}: ${key}.`, 400, { field: key });
}
