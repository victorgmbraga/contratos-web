import assert from 'node:assert/strict';

// Responsive geometry belongs to the mobile suite; business flows stay in ui-smoke.
export async function assertFilterLayout(page) {
  const filter=name=>page.locator(`#filter-${name}`);
  const check=message=>console.log('PASS '+message);
  for(const width of [320,390,768,1057,1440]) {
    await page.setViewportSize({width,height:844});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.locator('#header-content').evaluate(node=>{node.scrollLeft=0;});
    const fit=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,centers:[...document.querySelectorAll('#app-header .brand,#app-header input,#app-header button,#app-header select,#repository-link')].filter(node=>node.getClientRects().length).map(node=>{const rect=node.getBoundingClientRect();return rect.top+rect.height/2;})}));
    assert(fit.scroll<=fit.width,`Overflow da página em ${width}px`);
    if(width<=700){
      assert.equal(await page.locator('#header-content').evaluate(node=>node.scrollWidth<=node.clientWidth),true);
      for(const id of ['search','search-button','filters-button','document-type','order']){
        const bounds=await page.locator(`#${id}`).boundingBox();assert(bounds.x>=0 && bounds.x+bounds.width<=width,`${id} fora da tela em ${width}px`);
      }
      await page.locator('#more-actions-button').click();
      assert.equal(await page.locator('#more-actions #repository-link').count(),1);
      await page.locator('#repository-link').focus();
      const bounds=await page.locator('#repository-link').boundingBox();assert(bounds.x>=0 && bounds.x+bounds.width<=width,`GitHub inacessível em ${width}px`);
      await page.keyboard.press('Escape');
    }else{
      assert(Math.max(...fit.centers)-Math.min(...fit.centers)<=1,`Cabeçalho quebrou linha em ${width}px`);
      const repository=await page.locator('#repository-link').boundingBox();
      assert(repository.x>=0 && repository.y>=0 && repository.y<=20,`GitHub fora do canto superior em ${width}px`);
      assert.equal(await page.locator('#header-content #repository-link').count(),1);
      await page.mouse.move(width-8,400);await page.locator('#export-button').evaluate(node=>node.blur());await page.locator('#export-button').focus();
      const focused=await page.locator('#export-button').boundingBox();assert(focused.x>=-.5 && focused.x+focused.width<=repository.x,`Exportar não ficou visível sem sobrepor o GitHub em ${width}px`);
      assert(focused.x+focused.width<=width,`Exportar ficou fora da tela em ${width}px`);
      const shifted=await page.locator('#repository-link').boundingBox(),scroll=await page.locator('#header-content').evaluate(node=>node.scrollLeft);
      assert(Math.abs(shifted.x-(repository.x-scroll))<1,`GitHub não acompanhou a rolagem em ${width}px`);
      assert(shifted.x>=focused.x+focused.width+4,`GitHub sobrepôs Exportar em ${width}px`);
      const tooltip=page.locator('#export-button-tooltip');await tooltip.waitFor({state:'visible'});
      const box=await tooltip.boundingBox();assert(box.x>=8 && box.x+box.width<=width-8,`Tooltip cortado em ${width}px`);
      await page.locator('#repository-link').focus();await page.locator('#repository-link-tooltip').waitFor({state:'visible'});
      const visibleRepository=await page.locator('#repository-link').boundingBox();
      assert(visibleRepository.x>=0 && visibleRepository.x+visibleRepository.width<=width,`GitHub não ficou acessível pelo teclado em ${width}px`);
    }
    await page.locator('#filters-button').click();
    const bodyHeight=await page.locator('.filters-body').evaluate(body=>body.scrollHeight);
    await filter('modalidades').click();
    const checkDropdown=async()=>{
      const geometry=await page.evaluate(()=>{
        const input=document.querySelector('#filter-modalidades').getBoundingClientRect(),popup=document.querySelector('#filter-suggestions-modalidades'),bounds=popup.getBoundingClientRect();
        return {left:input.left,bottom:input.bottom,width:input.width,popupLeft:bounds.left,popupTop:bounds.top,popupWidth:bounds.width,popupBottom:bounds.bottom,visible:popup.contains(document.elementFromPoint(bounds.left+bounds.width/2,bounds.bottom-3))};
      });
      assert.equal(geometry.popupLeft,geometry.left);assert.equal(geometry.popupTop,geometry.bottom+4);assert.equal(geometry.popupWidth,geometry.width);assert(geometry.popupBottom<=844 && geometry.visible);
    };
    await checkDropdown();assert.equal(await page.locator('.filters-body').evaluate(body=>body.scrollHeight),bodyHeight);
    await page.locator('.filters-body').evaluate(body=>body.scrollTop+=24);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await checkDropdown();
    if(process.env.COMPRAS_QA_SCREENSHOT_DIR)await page.screenshot({path:`${process.env.COMPRAS_QA_SCREENSHOT_DIR}/filter-dropdown-${width}.png`});
    const modalFit=await page.locator('#filters-dialog').evaluate(dialog=>{
      const body=dialog.querySelector('.filters-body'),footer=dialog.querySelector('.dialog-footer'),rect=dialog.getBoundingClientRect(),top=footer.getBoundingClientRect().top,fields=dialog.querySelectorAll('.filter-field'),buttonsFit=[...footer.querySelectorAll('button')].every(button=>{const bounds=button.getBoundingClientRect();return bounds.left>=rect.left && bounds.right<=rect.right;});
      body.scrollTop=body.scrollHeight;
      return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,scrolls:body.scrollHeight>body.clientHeight,overflow:body.scrollWidth>body.clientWidth,footerFixed:top===footer.getBoundingClientRect().top,buttonsFit,lastBottom:fields[fields.length-1].getBoundingClientRect().bottom,footerTop:top};
    });
    assert(modalFit.left>=0 && modalFit.right<=width && modalFit.top>=0 && modalFit.bottom<=844);
    assert(modalFit.scrolls && !modalFit.overflow && modalFit.footerFixed && modalFit.buttonsFit && modalFit.lastBottom<=modalFit.footerTop,JSON.stringify({width,...modalFit}));
    await page.locator('#filters-dialog .close-dialog[aria-label="Fechar"]').click();
  }
  check('Modal ampliado mantém rolagem interna e ações visíveis nas cinco larguras de tela');
  await page.setViewportSize({width:390,height:844});await page.locator('#filters-button').click();assert(await page.locator('#filters-dialog').isVisible());await page.locator('#filters-dialog .close-dialog[aria-label="Fechar"]').click();check('Cabeçalho responsivo mantém busca e filtros visíveis e painéis sem overflow da página');
  if(process.env.COMPRAS_QA_SCREENSHOT_DIR)await page.screenshot({path:process.env.COMPRAS_QA_SCREENSHOT_DIR+'/mobile.png',fullPage:true});
}
