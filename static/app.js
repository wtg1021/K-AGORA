'use strict';
const $ = (s) => document.querySelector(s);
const node = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
const readable = (value,item) => AgoraText.format(value,{pdf:/\.pdf$/i.test(item?.source_file||'')});
const state = {query: '', items: [], shown: 6, selected: null, serial: 0};
let history = [];
try { history = JSON.parse(localStorage.getItem('agora-history') || '[]'); if (!Array.isArray(history)) history = []; history = history.filter(x => typeof x === 'string').slice(0, 8); } catch { /* unavailable storage */ }
const statuses = ['미확인','검토 중','일부 반영','반영 완료','미반영'];
const reviewStatuses = ['미검토','현행유지','협의필요','개선예정'];
const businessFields = ['사업','예산','수입','지출','계약','세무','세입세출외현금','예산결산','발전기금','기타'];
const submissionTypes = ['미분류','협의체','교육부','SR','간담회','기타'];
const splitFields = value => String(value||'').split(/[·,、]/).map(v=>v.trim()).filter(Boolean);
const groups = [
 ['회의 정보', [['number','관리번호',true],['source_agenda_number','원문 안건번호'],['meeting','협의체명 / 회차',true],['date','개최일',true,'date'],['meeting_location','개최 장소'],['meeting_region','개최 시·도']]],
 ['제안 정보', [['title','요구사항명',true],['organization','기관명'],['region','제안 시·도',true],['submission_type','구분',false,'submission'],['field','업무 (복수 선택)',true,'business']]],
 ['요구사항', [['request','요구사항',true,'textarea'],['target_menu','대상 메뉴',false,'textarea'],['situation','현황',false,'textarea'],['problem','문제점',false,'textarea'],['improvement_plan','개선방안',false,'textarea'],['effect','기대효과',false,'textarea'],['additional_opinions','추가 의견',false,'textarea']]],
 ['KERIS 사전 검토', [['review_status','KERIS 검토 구분',false,'review'],['source_status','상세 본문 검토 표기 (원문)'],['list_status','요약 목록 검토 표기 (원문)'],['review','KERIS 검토의견 내용',false,'textarea']]],
 ['사후 처리 · 반영 현황', [['status','실제 반영 상태',true,'select'],['department','담당 부서'],['implemented_at','반영 시점'],['answer','회의 후 확정 답변',false,'textarea']]],
 ['출처 · 검수', [['source_file','원문 파일명'],['source_pages','PDF 쪽수'],['source','원문 URL',false,'url'],['keywords','핵심 키워드'],['review_notes','검수 메모 / 확인사항',false,'textarea']]]
];
const fields = groups.flatMap(([,fields])=>fields);
for(const [heading,entries] of groups){
 const section=node('fieldset',undefined,'editor-group');section.append(node('legend',heading));
 const grid=node('div',undefined,'editor-fields');
 for(const [name,label,required,type] of entries){
  const wrap=node('label',label+(required?' *':''),['textarea','business'].includes(type)?'wide':'');
  const choices=type==='select'?statuses:type==='review'?reviewStatuses:type==='submission'?submissionTypes:null;
  const input=node(choices?'select':type==='textarea'?'textarea':'input');input.name=name;
  if(type==='business'){
   const box=node('div',undefined,'business-options');box.id='business-options';
   for(const value of businessFields)addBusinessOption(box,value);
   const group=node('fieldset',undefined,'business-field wide');group.append(node('legend',label+' *'),box,node('small','해당하는 업무를 모두 선택하세요. 기존 업무명도 유지됩니다.'));grid.append(group);continue;
  }
  input.required=!!required;
  if(name==='target_menu')input.placeholder='지출관리 > 지출처리 > 지출품의 > 품의등록/품의목록';
  if(input.tagName==='INPUT')input.type=type||'text';
  if(choices)choices.forEach(value=>input.append(new Option(value,value)));
  if(input.tagName!=='SELECT')input.maxLength=20000;
  wrap.append(input);grid.append(wrap);
 }
 section.append(grid);$('#editor-fields').append(section);
}
function addBusinessOption(box,value){
 const label=node('label'),input=node('input');input.type='checkbox';input.name='business_field';input.value=value;label.append(input,document.createTextNode(value));box.append(label);
}
async function api(path, options = {}) {
 const headers = {...options.headers};
 if (options.body) headers['Content-Type'] = 'application/json';
 if (options.auth) headers.Authorization = 'Bearer ' + $('#admin-token').value;
 const response = await fetch(path, {...options, headers});
 const data = await response.json();
 if (!response.ok) throw new Error(data.error || '요청을 처리하지 못했습니다.');
 if(Array.isArray(data.items))AgoraText.registerItems(data.items);
 else if(data.id)AgoraText.registerItems([data]);
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
 for (const key of ['year','region','field','status','review_status']) {
  const select=$('#filter-'+key), old=select.value;
  const values=key==='status'?meta.statuses:key==='review_status'?meta.review_statuses:meta[key];
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
  $('#answer').textContent=readable(data.answer,state.items[0]);$('#answer').hidden=!state.query;
  $('#feedback').textContent='';
  if(remember&&state.query){history=[state.query,...history.filter(q=>q!==state.query)].slice(0,8);renderHistory();}
 } catch(e) {if(serial===state.serial){$('#feedback').textContent='검색 실패: '+e.message;$('#results').replaceChildren();$('#answer').hidden=true;$('#load-more').hidden=true;$('#result-count').textContent='—';}} finally {if(serial===state.serial)$('#search-button').disabled=false;}
}
function badge(status){return node('span',status,'badge '+({'반영 완료':'done','일부 반영':'partial','검토 중':'pending','현행유지':'retained','협의필요':'pending','개선예정':'planned','미확인':'unknown'}[status]||''));}
function renderCards(){
 const list=$('#results');list.replaceChildren();
 if(!state.items.length){const e=node('div',undefined,'empty-state');e.append(node('strong','일치하는 안건이 없습니다.'),node('span','다른 검색어를 입력하거나 필터 조건을 초기화해 보세요.'));list.append(e);}
 state.items.slice(0,state.shown).forEach((a,i)=>{
  const c=node('article',undefined,'card'),top=node('div',undefined,'card-top');
  top.append(node('span',state.query?`관련도 순위 ${String(i+1).padStart(2,'0')} · 검색 점수 ${a.score}`:a.number,'card-rank'),badge(a.status));
  const title=node('button',a.title,'card-title');title.onclick=()=>detail(a.id);
  const meta=node('div',undefined,'card-meta');[a.meeting,a.date,a.organization||a.region,a.field].forEach(t=>meta.append(node('span',t)));
  const review=node('div',undefined,'review-line');review.append(node('strong','KERIS 검토의견'),node('span',readable(a.review||a.answer||'아직 등록된 검토의견이 없습니다.',a)));
  if(a.review_status!=='미검토')top.append(badge(a.review_status));
  const bottom=node('div',undefined,'card-bottom'),open=node('button','안건 자세히 보기 ↗');open.onclick=()=>detail(a.id);
  bottom.append(node('span',state.query?'검색 근거: '+a.matched.join(' · '):a.number.startsWith('DEMO-')?'가상 예시 데이터':'등록 안건'),open);
  c.append(top,title,meta,node('p',readable(a.request,a),'card-summary'),review,bottom);list.append(c);
 });
 $('#load-more').hidden=state.shown>=state.items.length;
}
async function detail(id){
 try{
  const a=await api('/api/agendas/'+encodeURIComponent(id));state.selected=a;
  const root=$('#detail-content');root.replaceChildren();
  const heading=node('div',undefined,'form-heading');heading.append(node('span',a.source_agenda_number||a.number,'source-number'),node('h2',a.title,'detail-title'));root.append(heading);
  root.append(node('p',`${a.meeting} · ${a.date}${a.meeting_location?' · '+a.meeting_location:''}`,'detail-meta'));
  const info=node('dl',undefined,'form-info');
  for(const [label,value] of [['업무',a.field],['기관명',a.organization],['구분',a.submission_type],['제안 시·도',a.region],['개최 시·도',a.meeting_region],['관리번호',a.number]]){info.append(node('dt',label),node('dd',value||'미등록'));}root.append(info);
  const section=(label,value,cls='')=>{const box=node('section',undefined,'form-section '+cls);box.append(node('h3',label),node('p',cls==='source-text'?(value||'미등록'):readable(value||'미등록',a)));return box;};
  root.append(section('요구사항',a.request,'request-section'),section('대상 메뉴',AgoraText.menu(a.target_menu)));
  const current=node('div',undefined,'detail-grid');current.append(section('현황',a.situation),section('문제점',a.problem));root.append(current);
  for(const [key,label] of [['improvement_plan','개선방안'],['effect','기대효과'],['additional_opinions','추가 의견']])root.append(section(label,a[key]));
  const review=node('section',undefined,'form-section keris-section');const title=node('div',undefined,'review-heading');title.append(node('h3','KERIS 검토의견'),badge(a.review_status));review.append(title);
  review.append(node('p',readable(a.review||'등록된 검토의견이 없습니다.',a)));
  if(a.source_status)review.append(node('small','상세 본문 표기: '+a.source_status));
  if(a.list_status&&a.list_status!==a.source_status)review.append(node('p','확인 필요: 요약 목록은 ‘'+a.list_status+'’, 상세 본문은 ‘'+a.source_status+'’입니다.','source-warning'));
  if(a.source_file)review.append(node('small','자료집의 사전 검토의견입니다. 회의 후 확정 결과·실제 반영 상태와 구분해 확인하세요.'));
  root.append(review);
  const result=node('section',undefined,'form-section');const resultTitle=node('div',undefined,'review-heading');resultTitle.append(node('h3','사후 처리 · 반영 현황'),badge(a.status));result.append(resultTitle,node('p',readable(a.answer||'회의 후 확정 답변이 등록되지 않았습니다.',a)),node('small',`담당 부서: ${a.department||'미등록'} · 반영 시점: ${a.implemented_at||'미확인'}`));root.append(result);
  const source=node('details',undefined,'source-details');source.append(node('summary','출처 · 검수 메모 · 원문 텍스트'));
  source.append(section('원문 출처',(a.source_file||'파일명 미등록')+(a.source_pages?' / PDF '+a.source_pages+'쪽':'')),section('검수 메모',a.review_notes),section('핵심 키워드',a.keywords));
  if(a.source&&/^https?:\/\//.test(a.source)){const link=node('a','원문 URL 열기 ↗');link.href=a.source;link.target='_blank';link.rel='noopener noreferrer';source.append(link);}
  const pages=a.source_record?.record?.source_text_by_page;
  if(Array.isArray(pages))for(const page of pages){source.append(section('PDF '+page.pdf_page+'쪽',page.text,'source-text'));}
  root.append(source);
  const actions=node('div',undefined,'detail-actions'),copy=node('button','검토 내용 복사'),edit=node('button','이 안건 수정');
  copy.onclick=async()=>{try{await navigator.clipboard.writeText(fields.map(([key,label])=>`${label}: ${key==='target_menu'?(AgoraText.menu(a[key])||'미등록'):readable(a[key]||'미등록',a)}`).join('\n'));copy.textContent='복사했습니다';}catch{copy.textContent='브라우저에서 복사를 허용해 주세요';}};
  edit.onclick=()=>{$('#detail-dialog').close();openEditor(a);};actions.append(copy,edit);root.append(actions);$('#detail-dialog').showModal();
 }catch(e){$(catalogue.active?'#all-feedback':'#feedback').textContent=e.message;}
}
function openEditor(a=null){
 const form=$('#agenda-form');form.reset();form.elements.id.value=a?a.id:'';
 if(a)fields.filter(([key])=>key!=='field').forEach(([key])=>{form.elements[key].value=key==='target_menu'?AgoraText.menu(a[key]):a[key]||'';});
 const selected=splitFields(a?.field);
 for(const value of selected)if(![...document.querySelectorAll('[name=business_field]')].some(i=>i.value===value))addBusinessOption($('#business-options'),value);
 document.querySelectorAll('[name=business_field]').forEach(i=>i.checked=selected.includes(i.value));
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
 e.preventDefault();const form=e.target,data=new FormData(form),values=Object.fromEntries(data);
 const selected=data.getAll('business_field');if(!selected.length){$('#manage-feedback').textContent='업무를 한 개 이상 선택하세요.';return;}
 values.target_menu=AgoraText.menu(values.target_menu);
 values.field=selected.join(' · ');delete values.business_field;const id=values.id;delete values.id;
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
 $('#search-view').hidden=all;$('#all-view').hidden=!all;$('.workspace').classList.toggle('catalogue-layout',all);
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
  for(const key of ['meeting','year','region','organization','field','status','review_status','submission_type']){
   const select=$('#all-filters').elements[key],old=select.value;
   const values=[...new Set(data.items.flatMap(a=>key==='field'?splitFields(a.field):[String(a[key])]))].sort((a,b)=>key==='year'?Number(b)-Number(a):a.localeCompare(b,'ko',{numeric:true}));
   while(select.options.length>1)select.remove(1);
   values.forEach(v=>select.append(new Option(key==='year'?v+'년':v,v)));select.value=values.includes(old)?old:'';
  }
  const summary=$('#all-summary');summary.replaceChildren();
  for(const [label,count] of [['전체 안건',data.items.length],...reviewStatuses.slice(1).concat('미검토').map(status=>[status,data.items.filter(a=>a.review_status===status).length])]){
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
  for(const key of ['meeting','year','quarter','region','organization','field','status','review_status','submission_type']){const value=form.elements[key].value;if(value&&(key==='field'?!splitFields(a.field).includes(value):String(a[key])!==value))return false;}
  return !keyword||['number','title','meeting','region','field','request','review','answer','keywords','target_menu','improvement_plan','additional_opinions','source_agenda_number'].some(key=>String(a[key]||'').normalize('NFKC').toLocaleLowerCase('ko').includes(keyword));
 });
 const sort=$('#all-sort').value;
 items.sort((a,b)=>{
  if(sort==='date-desc')return b.date.localeCompare(a.date)||a.number.localeCompare(b.number,'ko',{numeric:true});
  if(sort==='date-asc')return a.date.localeCompare(b.date)||a.number.localeCompare(b.number,'ko',{numeric:true});
  const comparison=sort==='status'?statuses.indexOf(a.status)-statuses.indexOf(b.status):sort==='review_status'?reviewStatuses.indexOf(a.review_status)-reviewStatuses.indexOf(b.review_status):String(a[sort]).localeCompare(String(b[sort]),'ko',{numeric:true});
  return comparison||b.date.localeCompare(a.date)||a.number.localeCompare(b.number,'ko',{numeric:true});
 });
 $('#all-count').replaceChildren(node('strong',items.length+'건'),document.createTextNode(' / 전체 '+catalogue.items.length+'건'));
 const rows=$('#all-rows');rows.replaceChildren();
 for(const a of items){
  const row=node('tr');
  for(const key of ['source_agenda_number','field','submission_type','organization','title','review_status','status','meeting']){
   const cell=node('td');
   if(key==='title'){const button=node('button',a.title,'table-title');button.onclick=()=>detail(a.id);cell.append(button);}
   else if(key==='status'||key==='review_status')cell.append(badge(a[key]));
   else if(key==='source_agenda_number'){cell.append(node('strong',a.source_agenda_number||'—'),node('small',a.number));}
   else if(key==='organization'){cell.append(node('span',a.organization||'미등록'),node('small',a.region));}
   else if(key==='meeting'){cell.append(node('span',a.meeting),node('small',a.date));}
   else cell.textContent=a[key];
   row.append(cell);
  }
  rows.append(row);
 }
 $('#all-table-wrap').hidden=!items.length;$('#all-empty').hidden=!!items.length;
}
$('#all-filters').onsubmit=e=>{e.preventDefault();renderCatalogue();};
$('#all-filters').oninput=e=>{if(e.target.name==='keyword')renderCatalogue();};
$('#all-filters').onchange=e=>{if(e.target.name!=='keyword')renderCatalogue();};
$('#all-filters').onreset=()=>{setTimeout(()=>renderCatalogue(),0);};
$('#all-sort').onchange=()=>renderCatalogue();
$('#all-retry').onclick=()=>loadCatalogue();
window.addEventListener('hashchange',()=>showView(location.hash==='#all'?'all':'search'));
showView(location.hash==='#all'?'all':'search');

renderHistory();
(async()=>{try{await metadata();await search();}catch(e){$('#feedback').textContent='서버에 연결할 수 없습니다. '+e.message;$('#total-count').textContent='연결 실패';}})();
