import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const nodes=new Map();
function node(selector){if(!nodes.has(selector))nodes.set(selector,{textContent:'',dataset:{},handlers:{},setAttribute(){},addEventListener(type,fn){this.handlers[type]=fn;},querySelector(s){return node(selector+s);}});return nodes.get(selector);}
const form=node('#product-form');form.elements={photo:{files:[],addEventListener(){}},visible:{checked:true},id:{value:'cable'}};
const state={products:[{id:'cable',name:'Cable blanco'}]};
let responseStatus=200,networkError=false,renders=0;
const values={id:'cable',name:'Cable gris',category:'tecnologia',price:'₡13.000',status:'Disponible',sizes:'No aplica',description:'Cable'};
const context={document:{querySelector:node,querySelectorAll:()=>[]},sessionStorage:{getItem:()=>'',setItem(){},removeItem(){}},location:{search:'',pathname:'/admin/',reload(){throw new Error('No debe recargar al guardar');}},URLSearchParams,history:{replaceState(){}},window:{},state,updateStats(){},render(){renders++;},FormData:class{*[Symbol.iterator](){yield*Object.entries(values);}},fetch:async()=>{if(networkError)throw new TypeError('network');return Response.json(responseStatus===200?{ok:true,product:values}:{error:'Conflicto de edición'},{status:responseStatus});},Response,TypeError,console,setTimeout(){},navigator:{}};
vm.createContext(context);vm.runInContext(readFileSync(new URL('../admin/editor.js',import.meta.url),'utf8'),context);
const submit=form.handlers.submit,event={preventDefault(){}};
await submit(event);assert.equal(state.products[0].name,'Cable gris');assert.equal(renders,1);assert.match(node('#editor-status').textContent,/guardados correctamente/);assert.equal(node('#product-form[type="submit"]').disabled,false);
responseStatus=409;await submit(event);assert.equal(renders,1);assert.match(node('#editor-status').textContent,/Conflicto/);
networkError=true;await submit(event);assert.match(node('#editor-status').textContent,/conexión/);assert.equal(form.elements.id.value,'cable');assert.equal(node('#product-form[type="submit"]').disabled,false);
console.log('OK: formulario actualiza el listado, muestra confirmación, conserva la edición ante conflicto o desconexión y habilita reintentar sin recargar.');

