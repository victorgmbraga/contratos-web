import assert from 'node:assert/strict';

export async function assertHeaderControls(page) {
  const labels = {
    'search-button': 'Pesquisar',
    'cancel-button': 'Cancelar pesquisa',
    'filters-button': 'Filtros',
    'clear-button': 'Limpar filtros',
    'refresh-button': 'Atualizar resultados',
    'columns-button': 'Selecionar colunas',
    'export-button': 'Exportar',
    'cancel-export-button': 'Cancelar CSV'
  };
  const controls = await page.evaluate(
    ids =>
      ids.map(id => {
        const button = document.getElementById(id),
          tooltip = document.getElementById(`${id}-tooltip`);
        const text = button.innerText.trim();
        return {
          id,
          count: document.querySelectorAll('#' + id).length,
          inHeader: document.getElementById('app-header').contains(button),
          label: button.getAttribute('aria-label'),
          textInLabel: !text || button.getAttribute('aria-label').startsWith(text),
          icon: !!button.querySelector('svg[aria-hidden="true"]'),
          title: button.getAttribute('title'),
          describedBy: button.getAttribute('aria-describedby'),
          tooltipRole: tooltip?.getAttribute('role')
        };
      }),
    Object.keys(labels)
  );
  // O tooltip repete o nome acessível; por isso não é vinculado por aria-describedby.
  for (const control of controls)
    assert.deepEqual(control, {
      id: control.id,
      count: 1,
      inHeader: true,
      label: labels[control.id],
      textInLabel: true,
      icon: true,
      title: null,
      describedBy: null,
      tooltipRole: 'tooltip'
    });
  await page.getByRole('button', { name: 'Exportar', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'Exportar resultados' });
  await menu.waitFor({ state: 'visible' });
  assert.equal(await menu.getByRole('menuitem').count(), 2);
  assert.equal(await menu.getByRole('menuitem', { name: /^Toda a consulta/ }).count(), 1);
  assert.equal(await menu.getByRole('menuitem', { name: /^Página atual/ }).count(), 1);
  assert.equal(await page.locator('#export-button').getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#export-button').getAttribute('aria-expanded'), 'false');
}
