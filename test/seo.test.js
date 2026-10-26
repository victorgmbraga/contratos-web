import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../public/', import.meta.url);
const [index, diagnostic, image] = await Promise.all([
  readFile(new URL('index.html', root), 'utf8'),
  readFile(new URL('pncp-diagnostic.html', root), 'utf8'),
  readFile(new URL('og-image.png', root)),
]);

function attributes(tag) {
  return new Map([...tag.matchAll(/([a-z:-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value]));
}

function metaContent(html, attribute, expected) {
  for (const tag of html.match(/<meta\b[^>]*>/g) || []) {
    const attrs = attributes(tag);
    if (attrs.get(attribute) === expected) return attrs.get('content');
  }
  return undefined;
}

function linkHref(html, rel) {
  for (const tag of html.match(/<link\b[^>]*>/g) || []) {
    const attrs = attributes(tag);
    if (attrs.get('rel') === rel) return attrs.get('href');
  }
  return undefined;
}

test('SEO-01: a página inicial declara canônica e metadados sociais', () => {
  assert.equal(linkHref(index, 'canonical'), 'https://contratos-web.net.br/');
  assert.equal(metaContent(index, 'name', 'robots'), 'index, follow');
  const description = metaContent(index, 'name', 'description');
  assert.match(description, /PNCP/);
  for (const [property, expected] of [
    ['og:type', 'website'],
    ['og:site_name', 'Contratos Web'],
    ['og:locale', 'pt_BR'],
    ['og:title', 'Contratos Web · Pesquisa PNCP'],
    ['og:description', description],
    ['og:url', 'https://contratos-web.net.br/'],
    ['og:image', 'https://contratos-web.net.br/og-image.png'],
    ['og:image:type', 'image/png'],
    ['og:image:width', '1200'],
    ['og:image:height', '630'],
  ]) assert.equal(metaContent(index, 'property', property), expected, property);
  for (const [name, expected] of [
    ['twitter:card', 'summary_large_image'],
    ['twitter:title', 'Contratos Web · Pesquisa PNCP'],
    ['twitter:description', description],
    ['twitter:image', 'https://contratos-web.net.br/og-image.png'],
  ]) assert.equal(metaContent(index, 'name', name), expected, name);
  assert.match(metaContent(index, 'property', 'og:image:alt'), /PNCP/);
  assert.match(metaContent(index, 'name', 'twitter:image:alt'), /PNCP/);
});

test('SEO-02: URLs parametrizadas consolidam para a canônica sem parâmetros', () => {
  const canonical = new URL(linkHref(index, 'canonical'));
  assert.equal(canonical.search, '');
  assert.equal(canonical.hash, '');
  assert.equal(canonical.href, 'https://contratos-web.net.br/');
});

test('SEO-03: a imagem social existe e tem o formato declarado', () => {
  assert.equal(image.subarray(1, 4).toString('ascii'), 'PNG');
  assert.equal(image.readUInt32BE(16), 1200);
  assert.equal(image.readUInt32BE(20), 630);
});

test('SEO-04: a página de diagnóstico não deve ser indexada', () => {
  assert.equal(metaContent(diagnostic, 'name', 'robots'), 'noindex, follow');
});
