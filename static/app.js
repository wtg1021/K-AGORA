'use strict';
const $ = (s) => document.querySelector(s);
const node = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
const state = {query: '', items: [], shown: 6, selected: null, serial: 0};
let history = [];
try { history = JSON.parse(localStorage.getItem('agora-history') || '[]'); if (!Array.isArray(history)) history = []; history = history.filter(x => typeof x === 'string').slice(0, 8); } catch { /* unavailable storage */ }
const fields = [
 ['number','안건번호',true],['title','안건 제목',true],['meeting','협의체명 / 회차',true],['date','개최일',true,'date'],['region','시·도',true],['organization','작성 기관'],['field','업무 분야',true],['status','반영 상태',true,'select'],['situation','현재 상황',false,'textarea'],['problem','문제점',false,'textarea'],['request','요구사항',true,'textarea'],['effect','기대효과',false,'textarea'],['review','검토 의견',false,'textarea'],['answer','당시 답변',false,'textarea'],['department','담당 부서'],['implemented_at','반영 시점'],['keywords','핵심 키워드'],['source','원문 URL',false,'url']
];
const statuses = ['검토 중','일부 반영','반영 완료','미반영'];
for (const [name,label,required,type] of fields) {
 const wrap = node('label',label + (required ? ' *' : ''),type === 'textarea' ? 'wide' : '');
 const input = node(type === 'select' ? 'select' : type === 'textarea' ? 'textarea' : 'input');
 input.name = name; input.required = !!required;
 if (input.tagName === 'INPUT') input.type = type || 'text';
 if (type === 'select') statuses.forEach(s => input.append(new Option(s,s)));
 if (input.tagName !== 'SELECT') input.maxLength = 20000;
 wrap.append(input); $('#editor-fields').append(wrap);
}
async function api(path, options = {}) {
 const headers = {...options.headers};
 if (options.body) headers['Content-Type'] = 'application/json';
 if (options.auth) headers.Authorization = 'Bearer ' + $('#admin-token').value;
 const response = await fetch(path, {...options, headers});
 const data = await response.json();
 if (!response.ok) throw new Error(data.error || '요청을 처리하지 못했습니다.');
 return data;
}
function renderHistory() {
 const list = $('#history'); list.replaceChildren();
 if (!history.length) list.append(node('li','아직 검색 기록이 없습니다.','empty-history'));
 history.forEach(q => { const li=node('li');const b=node('button','↳  '+q);b.title=q;b.onclick=()=>{navigate('search');search(q);};li.append(b);list.append(li); });
 try { localStorage.setItem('agora-history',JSON.stringify(history)); } catch { /* unavailable storage */ }
}
async function metadata() {
 const meta=await api('/api/meta');
 $('#total-count').textContent=`등록 안건 ${meta.count}건`;
 for (const key of ['year','region','field','status']) {
  const select=$('#filter-'+key), old=select.value;
  const values=key==='status'?meta.statuses:meta[key];
  while (select.options.length>1) select.remove(1);
  values.forEach(value=>select.append(new Option(key==='year'?value+'년':value,value)));
  select.value=old;
 }
 catalogue.dirty=true;
 if(catalogue.active)await loadCatalogue();
 $('#manage').title=meta.management_enabled?'안건 등록·수정·가져오기':'읽기 전용 실행 중: ADMIN_TOKEN 설정 후 관리 가능';
}
async function search(query=state.query, remember=false) {
 state.query=query.trim();$('#query').value=state.query; const serial=++state.serial;
 const params=new URLSearchParams(new FormData($('#filters')));params.set('q',state.query);
 $('#search-button').disabled=true;$('#feedback').textContent='안건을 찾고 있습니다…';
 try {
  const data=await api('/api/agendas?'+params);
  if(serial!==state.serial)return;
  state.items=data.items;state.shown=6;renderCards();
  $('#results-title').textContent=state.query?'검색 결과':'등록된 안건 둘러보기';
  $('#result-count').textContent=data.total;
  $('#answer').textContent=data.answer;$('#answer').hidden=!state.query;
  $('#feedback').textContent='';
  if(remember&&state.query){history=[state.query,...history.filter(q=>q!==state.query)].slice(0,8);renderHistory();}
 } catch(e) {if(serial===state.serial){$('#feedback').textContent='검색 실패: '+e.message;$('#results').replaceChildren();$('#answer').hidden=true;$('#load-more').hidden=true;$('#result-count').textContent='—';}} finally {if(serial===state.serial)$('#search-button').disabled=false;}
}
function badge(status){return node('span',status,'badge '+({'반영 완료':'done','일부 반영':'partial','검토 중':'pending'}[status]||''));}
function renderCards(){
 const list=$('#results');list.replaceChildren();
 if(!state.items.length){const e=node('div',undefined,'empty-state');e.append(node('strong','일치하는 안건이 없습니다.'),node('span','다른 검색어를 입력하거나 필터 조건을 초기화해 보세요.'));list.append(e);}
 state.items.slice(0,state.shown).forEach((a,i)=>{
  const c=node('article',undefined,'card'),top=node('div',undefined,'card-top');
  top.append(node('span',state.query?`관련도 순위 ${String(i+1).padStart(2,'0')} · 검색 점수 ${a.score}`:a.number,'card-rank'),badge(a.status));
  const title=node('button',a.title,'card-title');title.onclick=()=>detail(a.id);
  const meta=node('div',undefined,'card-meta');[a.meeting,a.date,a.region,a.field].forEach(t=>meta.append(node('span',t)));
  const review=node('div',undefined,'review-line');review.append(node('strong','당시 답변'),node('span',a.answer||'아직 등록된 답변이 없습니다.'));
  const bottom=node('div',undefined,'card-bottom'),open=node('button','안건 자세히 보기 ↗');open.onclick=()=>detail(a.id);
  bottom.append(node('span',state.query?'검색 근거: '+a.matched.join(' · '):a.number.startsWith('DEMO-')?'가상 예시 데이터':'등록 안건'),open);
  c.append(top,title,meta,node('p',a.request,'card-summary'),review,bottom);list.append(c);
 });
 $('#load-more').hidden=state.shown>=state.items.length;
}
async function detail(id){
 try{
  const a=await api('/api/agendas/'+encodeURIComponent(id));state.selected=a;
  const root=$('#detail-content');root.replaceChildren(node('h2',a.title,'detail-title'),badge(a.status),node('p',`${a.number} · ${a.meeting} · ${a.date} · ${a.region} · ${a.field}`,'detail-meta'));
  const grid=node('div',undefined,'detail-grid');
  for(const [key,label] of fields.filter(([key])=>!['title','number','meeting','date','region','field','status'].includes(key))){
   const section=node('section',undefined,'detail-section '+(['request','answer','review'].includes(key)?'wide':''));section.append(node('h3',label));
   if(key==='source'&&/^https?:\/\//.test(a[key])){const link=node('a','원문 열기 ↗');link.href=a[key];link.target='_blank';link.rel='noopener noreferrer';section.append(link);}else section.append(node('p',a[key]||'미등록'));
   grid.append(section);
  }
  const actions=node('div',undefined,'detail-actions'),copy=node('button','검토 내용 복사'),edit=node('button','이 안건 수정');
  copy.onclick=async()=>{try{await navigator.clipboard.writeText(fields.map(([key,label])=>`${label}: ${a[key]||'미등록'}`).join('\n'));copy.textContent='복사했습니다';}catch{copy.textContent='브라우저에서 복사를 허용해 주세요';}};
  edit.onclick=()=>{$('#detail-dialog').close();openEditor(a);};actions.append(copy,edit);root.append(grid,actions);$('#detail-dialog').showModal();
 }catch(e){$(catalogue.active?'#all-feedback':'#feedback').textContent=e.message;}
}
function openEditor(a=null){
 const form=$('#agenda-form');form.reset();form.elements.id.value=a?a.id:'';
 if(a)fields.forEach(([key])=>{form.elements[key].value=a[key]||'';});
 $('#delete-agenda').hidden=!a;$('#manage-feedback').textContent='';
 if(!$('#manage-dialog').open)$('#manage-dialog').showModal();
}
$('#search-form').onsubmit=e=>{e.preventDefault();search($('#query').value,true);};
$('#query').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();search($('#query').value,true);}};
$('#filters').onchange=()=>search();
$('#reset-filters').onclick=()=>{$('#filters').reset();search();};
$('#new-search').onclick=()=>{navigate('search');$('#filters').reset();search('');$('#query').focus();};
$('#clear-history').onclick=()=>{history=[];renderHistory();};
document.querySelectorAll('[data-query]').forEach(b=>b.onclick=()=>search(b.dataset.query,true));
$('#load-more').onclick=()=>{state.shown+=6;renderCards();};
$('#manage').onclick=()=>openEditor();$('#new-agenda').onclick=()=>openEditor();
document.querySelectorAll('.close-dialog').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('#agenda-form').onsubmit=async e=>{
 e.preventDefault();const form=e.target,values=Object.fromEntries(new FormData(form));const id=values.id;delete values.id;
 const button=form.querySelector('[type=submit]');button.disabled=true;
 try{const saved=await api('/api/agendas'+(id?'/'+encodeURIComponent(id):''),{method:id?'PUT':'POST',auth:true,body:JSON.stringify(values)});form.elements.id.value=saved.id;$('#delete-agenda').hidden=false;$('#manage-feedback').textContent='안건을 저장했습니다.';await metadata();await search();}catch(e){$('#manage-feedback').textContent=e.message;}finally{button.disabled=false;}
};
$('#delete-agenda').onclick=async()=>{
 const id=$('#agenda-form').elements.id.value;if(!id||!confirm('이 안건을 삭제할까요? 삭제 후에는 JSON 백업으로만 복구할 수 있습니다.'))return;
 try{await api('/api/agendas/'+encodeURIComponent(id),{method:'DELETE',auth:true});openEditor();$('#manage-feedback').textContent='삭제했습니다.';await metadata();await search();}catch(e){$('#manage-feedback').textContent=e.message;}
};
$('#import-file').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;
 try{if(file.size>2*1024*1024)throw new Error('2MB 이하 파일을 선택하세요.');const items=JSON.parse(await file.text());const result=await api('/api/import',{method:'POST',auth:true,body:JSON.stringify(items)});$('#manage-feedback').textContent=`${result.imported}건을 가져왔습니다.`;await metadata();await search();}catch(e){$('#manage-feedback').textContent='가져오기 실패: '+e.message;}finally{e.target.value='';}
};
$('#export').onclick=async()=>{try{const items=await api('/api/export',{auth:true});const url=URL.createObjectURL(new Blob([JSON.stringify(items,null,2)],{type:'application/json'}));const a=node('a');a.href=url;a.download='k-agora-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){$('#manage-feedback').textContent=e.message;}};
// Keep management available on small screens where the sidebar helper is hidden.
const mobileManage=node('button','안건 등록·관리','text-button');mobileManage.onclick=()=>openEditor();$('footer').append(mobileManage);

// The catalogue has its own filters, ordering, and fetch state.
const catalogue={active:false,dirty:true,items:[],serial:0};
function navigate(view){
 if(location.hash!=='#'+view)location.hash=view;
 showView(view);
}
function showView(view){
 const all=view==='all';const changed=catalogue.active!==all;catalogue.active=all;
 $('#search-view').hidden=all;$('#all-view').hidden=!all;
 $('#page-name').textContent=all?'전체 안건':'안건 검색';
 document.title='K-AGORA · '+(all?'전체 협의체 안건':'협의체 안건 검색');
 for(const [id,active] of [['#nav-search',!all],['#nav-all',all]]){
  const link=$(id);link.classList.toggle('active-nav',active);
  if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
 }
 if(all&&catalogue.dirty)loadCatalogue();
 if(changed){window.scrollTo(0,0);if(all)$('#all-heading').focus({preventScroll:true});}
}
async function loadCatalogue(){
 const serial=++catalogue.serial;
 $('#all-feedback').textContent='전체 안건을 불러오고 있습니다…';$('#all-count').textContent='불러오는 중…';
 $('#all-table-wrap').hidden=true;$('#all-empty').hidden=true;$('#all-retry').hidden=true;
 try{
  const data=await api('/api/agendas');if(serial!==catalogue.serial)return;
  catalogue.items=data.items;catalogue.dirty=false;
  for(const key of ['meeting','year','region','field','status']){
   const select=$('#all-filters').elements[key],old=select.value;
   const values=[...new Set(data.items.map(a=>String(a[key])))].sort((a,b)=>key==='year'?Number(b)-Number(a):a.localeCompare(b,'ko',{numeric:true}));
   while(select.options.length>1)select.remove(1);
   values.forEach(v=>select.append(new Option(key==='year'?v+'년':v,v)));select.value=values.includes(old)?old:'';
  }
  const summary=$('#all-summary');summary.replaceChildren();
  for(const [label,count] of [['전체 안건',data.items.length],...statuses.map(status=>[status,data.items.filter(a=>a.status===status).length])]){
   const card=node('div',undefined,'summary-item');card.append(node('span',label),node('strong',count+'건'));summary.append(card);
  }
  $('#all-feedback').textContent='';renderCatalogue();
 }catch(e){
  if(serial!==catalogue.serial)return;
  catalogue.dirty=true;$('#all-rows').replaceChildren();$('#all-summary').replaceChildren();
  $('#all-count').textContent='목록을 불러오지 못했습니다.';$('#all-feedback').textContent=e.message;$('#all-retry').hidden=false;
 }
}
function renderCatalogue(){
 if(catalogue.dirty)return;
 const form=$('#all-filters'),keyword=form.elements.keyword.value.trim().normalize('NFKC').toLocaleLowerCase('ko');
 const items=catalogue.items.filter(a=>{
  for(const key of ['meeting','year','quarter','region','field','status'])if(form.elements[key].value&&String(a[key])!==form.elements[key].value)return false;
  return !keyword||['number','title','meeting','region','field','request','review','answer','keywords'].some(key=>String(a[key]||'').normalize('NFKC').toLocaleLowerCase('ko').includes(keyword));
 });
 const sort=$('#all-sort').value;
 items.sort((a,b)=>{
  if(sort==='date-desc')return b.date.localeCompare(a.date)||a.number.localeCompare(b.number,'ko',{numeric:true});
  if(sort==='date-asc')return a.date.localeCompare(b.date)||a.number.localeCompare(b.number,'ko',{numeric:true});
  const comparison=sort==='status'?statuses.indexOf(a.status)-statuses.indexOf(b.status):String(a[sort]).localeCompare(String(b[sort]),'ko',{numeric:true});
  return comparison||b.date.localeCompare(a.date)||a.number.localeCompare(b.number,'ko',{numeric:true});
 });
 $('#all-count').replaceChildren(node('strong',items.length+'건'),document.createTextNode(' / 전체 '+catalogue.items.length+'건'));
 const rows=$('#all-rows');rows.replaceChildren();
 for(const a of items){
  const row=node('tr');
  for(const key of ['number','title','meeting','date','region','field','status']){
   const cell=node('td');
   if(key==='title'){const button=node('button',a.title,'table-title');button.onclick=()=>detail(a.id);cell.append(button);}
   else if(key==='status')cell.append(badge(a.status));else cell.textContent=a[key];
   row.append(cell);
  }
  rows.append(row);
 }
 $('#all-table-wrap').hidden=!items.length;$('#all-empty').hidden=!!items.length;
}
$('#all-filters').onsubmit=e=>{e.preventDefault();renderCatalogue();};
$('#all-filters').oninput=()=>renderCatalogue();
$('#all-filters').onchange=()=>renderCatalogue();
$('#all-filters').onreset=()=>{setTimeout(()=>renderCatalogue(),0);};
$('#all-sort').onchange=()=>renderCatalogue();
$('#all-retry').onclick=()=>loadCatalogue();
window.addEventListener('hashchange',()=>showView(location.hash==='#all'?'all':'search'));
showView(location.hash==='#all'?'all':'search');

renderHistory();
(async()=>{try{await metadata();await search();}catch(e){$('#feedback').textContent='서버에 연결할 수 없습니다. '+e.message;$('#total-count').textContent='연결 실패';}})();
