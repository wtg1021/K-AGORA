/* Display-only repair of PDF line wrapping. Stored text and source pages remain unchanged. */
(function (root) {
 'use strict';
 const words=new Set(['계약','에듀파인','K-에듀파인','관련','연계','최소화','가능하도록','원인행위','지출결의','신용카드','수수료','행정업무','행정효율화','업무담당자','검사검수','요구사항','개선방안','검토의견','현행유지','협의필요','개선예정']);
 const token='[가-힣A-Za-z0-9_-]+';
 function learn(text){for(const match of String(text||'').matchAll(/[가-힣A-Za-z][가-힣A-Za-z0-9_-]{1,39}/g))words.add(match[0]);}
 function registerItems(items){
  for(const item of items||[]){
   for(const value of Object.values(item))if(typeof value==='string')learn(value);
   for(const page of item.source_record?.record?.source_text_by_page||[])learn(page.text);
  }
 }
 function marker(line){return /^(?:[❍○●□■※▶▷◆◇•▪‣*]|[-–—]\s*\S|\d+[.)]\s|[가-하][.)]\s|\[[^\]]+\]$|출처\s*[:：])/.test(line);}
 function tableRow(line){return /\t|\S {2,}\S|^\|/.test(line)||((line.match(/\d[\d,.~]*\s*[명원%]?/g)||[]).length>=3&&line.length<120);}
 function join(left,right){
  const end=left.match(new RegExp('('+token+')$')),start=right.match(new RegExp('^('+token+')'));
  if(end&&start&&words.has(end[1]+start[1]))return left+right;
  if(/[([（「『]$/.test(left)||/^[,.;:!?%)\]）」』]/.test(right))return left+right;
  return left+' '+right;
 }
 function format(value,options={}){
  const text=String(value??'').replace(/\r\n?/g,'\n');
  const blocks=text.split(/\n[ \t]*\n+/).map(block=>{
   const lines=block.split('\n').map(line=>line.trim()).filter(Boolean);if(!lines.length)return '';
   const diagram=lines.length>=3&&lines.every(line=>line.length<60)&&lines.filter(line=>/^(?:[([（]|계약|검사|검수|첨부|결재|요청|처리|전송|정보|등록|조회|저장|확정|결정|지출|원인행위|G2B|K-에듀)/.test(line)).length>=3;
   if(lines.filter(tableRow).length>=2||diagram)return lines.join('\n');
   const result=[lines[0]];
   for(const line of lines.slice(1)){
    const previous=result[result.length-1];
    const heading=/[:：]$/.test(previous)||/^\[[^\]]+\]$/.test(previous);
    const menu=/[>→]/.test(previous)&&/[>→]/.test(line);
    if(marker(line)||heading||tableRow(previous)||tableRow(line)||menu||/[.!?。]$/.test(previous))result.push(line);
    else result[result.length-1]=join(previous,line);
   }
   return result.join('\n');
  });
  if(!options.pdf)return blocks.join('\n\n').trim();
  const result=[];
  for(const block of blocks){
   const previous=result[result.length-1];
   const bracketContinuation=previous&&!/[.!?。:：]$/.test(previous)&&/^\([^)]{1,60}\)(?:와|과|는|은|의|를|을|에)/.test(block)&&!block.includes('\n');
   const continuation=bracketContinuation||previous&&marker(previous)&&!/[.!?。:：]$/.test(previous)&&!marker(block)&&!block.includes('\n')&&!tableRow(block);
   if(continuation)result[result.length-1]=join(previous,block);else result.push(block);
  }
  return result.join('\n\n').trim();
 }
 // A slash separates sibling screens; each newline starts a separate menu path.
 function menu(value){
  const lines=String(value??'').replace(/\r\n?/g,'\n').split('\n');
  const paths=[];
  for(let line of lines){
   line=line.replace(/\[[\s/|>–—-]*\]/g,'').trim();
   if(!line)continue;
   line=line.replace(/^[①-⑳]\s*/, '').replace(/(?:[–—－→⇒〉›»]+|\s+-\s+)/g,' > ');
   const trailing=/[>]\s*$/.test(line),leading=/^\s*[>]/.test(line);
   const stages=line.split(/\s*>+\s*/).map(stage=>stage.trim().replace(/^\[([^\]]+)\]$/, '$1').trim().replace(/\s*[,，]\s*/g,'/').replace(/\s*\/\s*/g,'/').replace(/[ \t]+/g,' ')).filter(Boolean);
   const path=stages.join(' > ');if(!path)continue;
   const previous=paths[paths.length-1];
   if(previous&&(leading||previous.continues)){
    previous.text+=(previous.continues||leading?' > ':' ')+path;previous.continues=trailing;
   }else paths.push({text:path,continues:trailing});
  }
  return paths.map(path=>path.text).join('\n');
 }
 const api={format,registerItems,menu};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else root.AgoraText=api;
})(globalThis);
