import {createResultsTable} from '../public/results-table.js';
const rows=Array.from({length:100},(_,index)=>({titulo:`Documento ${index+1}`,objeto:'Objeto longo '.repeat(20),orgao:'<img src=x onerror="window.injected=true">'}));
const columns=[{field:'titulo',title:'Título',width:260},{field:'objeto',title:'Objeto',width:280},{field:'orgao',title:'Órgão',width:260,filterable:true,native_order:{asc:'orgao',desc:'-orgao'}}];
const calls={pages:[],opened:[],actions:[]};
const instance=createResultsTable({container:document.getElementById('results-table'),columns,footerContent:document.getElementById('counter'),
  menuIcon:'<svg class="header-filter-icon" aria-hidden="true"></svg>',
  onPageChange:page=>{calls.pages.push(page);instance.renderPage({rows,page,lastPage:100});},
  onOpenDocument:row=>calls.opened.push(row.titulo),onColumnAction:(...action)=>calls.actions.push(action)});
instance.renderPage({rows,page:1,lastPage:100});
window.tableFixture={instance,calls,rows,columns};
