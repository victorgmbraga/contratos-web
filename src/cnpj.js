// Os 12 primeiros caracteres identificam a inscrição. Os dois verificadores são numéricos.
export const isCnpj = value => typeof value === 'string' && /^[A-Z0-9]{12}\d{2}$/.test(value);
