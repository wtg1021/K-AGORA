"use client";

import { FormEvent, useMemo, useState } from "react";
import { Search, Sparkles, CalendarDays, MapPin, FileText, ArrowUp, CircleCheck, Clock3, ChevronRight } from "lucide-react";

type Agenda = { id:number; title:string; summary:string; meeting:string; date:string; region:string; area:string; status:"반영 완료"|"검토 중"|"일부 반영"; answer:string; keywords:string[] };

const agendas: Agenda[] = [
  { id:1, title:"지출품의 결재선 자동 지정 기능 개선", summary:"업무유형과 금액 기준에 따라 결재선을 자동으로 불러오고 부서별 기본값을 저장할 수 있도록 개선 요청", meeting:"2025년 3분기 업무협의체", date:"2025. 09. 18.", region:"대전", area:"재무회계", status:"검토 중", answer:"부서별 결재선 저장 기능은 공통 적용 범위를 검토 중이며, 금액별 자동 지정은 내부통제 기준과 함께 검토할 예정입니다.", keywords:["결재선","지출품의","자동","부서","금액"] },
  { id:2, title:"법인카드 사용내역 일괄 등록", summary:"카드사 승인내역을 선택해 여러 건의 지출결의를 한 번에 작성하는 기능과 오류내역 별도 표시 요청", meeting:"2025년 2분기 업무협의체", date:"2025. 06. 12.", region:"부산", area:"재무회계", status:"일부 반영", answer:"일괄 선택 기능은 반영 완료되었으며, 오류 사유를 항목별로 내려받는 기능은 차기 개선 범위에 포함했습니다.", keywords:["법인카드","사용내역","일괄","지출결의","오류"] },
  { id:3, title:"EFT 이체 오류 사유 상세화", summary:"이체 실패 시 은행 응답코드만 표시되어 원인 파악이 어려우므로 담당자가 이해하기 쉬운 안내 문구 제공 요청", meeting:"2024년 4분기 업무협의체", date:"2024. 12. 05.", region:"경북", area:"자금관리", status:"반영 완료", answer:"주요 은행 응답코드에 대한 사용자 안내 문구를 추가하고, 상세 사유를 내려받을 수 있도록 반영했습니다.", keywords:["EFT","이체","실패","오류","은행","응답코드"] },
  { id:4, title:"개인정보 처리이력 다운로드 개선", summary:"대량 조회 시 다운로드 시간이 길고 파일 구분이 어려워 기간 분할 및 진행상태 표시 기능 요청", meeting:"2024년 3분기 업무협의체", date:"2024. 09. 26.", region:"서울", area:"공통", status:"반영 완료", answer:"비동기 생성 방식과 진행상태 표시를 적용했으며, 월 단위 분할 내려받기를 지원합니다.", keywords:["개인정보","처리이력","다운로드","대량","진행상태"] },
  { id:5, title:"지출결의서 첨부파일 일괄 확인", summary:"여러 지출결의서의 증빙 첨부 여부를 목록에서 확인하고 누락 건만 조회할 수 있는 기능 요청", meeting:"2025년 1분기 업무협의체", date:"2025. 03. 20.", region:"광주", area:"재무회계", status:"검토 중", answer:"첨부 여부 표시는 개인정보 노출 가능성과 목록 조회 성능을 함께 검토하고 있습니다.", keywords:["지출결의","첨부파일","증빙","누락","조회"] },
];

const samples = ["법인카드 내역을 한 번에 등록하는 안건이 있었어?","EFT 이체 실패 사유 관련 안건 찾아줘","결재선 자동 지정 요구가 전에 나왔는지 알려줘"];

function scoreAgenda(query:string, agenda:Agenda) {
  const normalized=query.toLowerCase().replace(/\s/g,"");
  const queryWords=query.toLowerCase().split(/\s+/).filter(q=>q.length>1);
  return [...agenda.keywords,agenda.title,agenda.summary].map(v=>v.toLowerCase().replace(/\s/g,"")).filter(word=>normalized.includes(word)||word.includes(normalized)||queryWords.some(q=>word.includes(q))).length;
}

export default function Home() {
  const [query,setQuery]=useState("");
  const [asked,setAsked]=useState("법인카드 사용내역 일괄 등록과 비슷한 안건이 있었어?");
  const results=useMemo(()=>agendas.map(a=>({...a,score:scoreAgenda(asked,a)})).sort((a,b)=>b.score-a.score).slice(0,3),[asked]);
  function submit(e:FormEvent){e.preventDefault();if(!query.trim())return;setAsked(query.trim());setQuery("");}
  const best=results[0];
  return <main className="min-h-screen bg-background text-foreground">
    <header className="border-b border-border bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-5 lg:px-8">
        <div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground"><Search size={18} strokeWidth={2.4}/></div><div><p className="text-[15px] font-bold tracking-tight">협의체 안건 찾기</p><p className="text-xs text-muted-foreground">K-에듀파인 업무지원</p></div></div>
        <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"><span className="size-2 rounded-full bg-emerald-500"/>예시 데이터 128건</div>
      </div>
    </header>
    <div className="mx-auto grid max-w-[1440px] lg:grid-cols-[270px_1fr]">
      <aside className="hidden min-h-[calc(100vh-65px)] border-r border-border bg-white p-5 lg:block">
        <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-sm"><Sparkles size={16}/>새로운 검색</button>
        <div className="mt-8"><p className="px-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">최근 검색</p><div className="mt-3 space-y-1">
          {["법인카드 일괄 등록","EFT 오류 사유","결재선 자동 지정"].map((item,i)=><button key={item} onClick={()=>setAsked(samples[i])} className="flex w-full items-center justify-between rounded-lg px-2 py-2.5 text-left text-sm text-slate-600 hover:bg-slate-100"><span>{item}</span><ChevronRight size={14}/></button>)}
        </div></div>
        <div className="mt-8 rounded-2xl bg-slate-50 p-4"><p className="text-sm font-bold">검색 팁</p><p className="mt-2 text-[13px] leading-5 text-muted-foreground">기능명, 업무명, 오류 내용처럼 기억나는 표현만 입력해도 유사 안건을 찾을 수 있어요.</p></div>
      </aside>
      <section className="flex min-h-[calc(100vh-65px)] flex-col">
        <div className="mx-auto w-full max-w-4xl flex-1 px-5 pb-32 pt-10 sm:px-8 lg:pt-14">
          <div className="mb-10 text-center"><div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-blue-50 text-primary"><Sparkles size={22}/></div><h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">전에 나온 안건인지 바로 확인해 보세요</h1><p className="mt-3 text-[15px] text-muted-foreground">협의체 자료에서 비슷한 요구사항과 당시 검토 결과를 찾아드립니다.</p></div>
          <div className="space-y-5">
            <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-primary px-5 py-3.5 text-[15px] leading-6 text-primary-foreground shadow-sm">{asked}</div>
            <div className="flex gap-3"><div className="mt-1 grid size-8 shrink-0 place-items-center rounded-xl bg-blue-50 text-primary"><Sparkles size={16}/></div><div className="min-w-0 flex-1">
              <p className="text-[15px] leading-7"><strong>유사한 안건을 찾았습니다.</strong><br/>가장 비슷한 안건은 <span className="font-bold text-primary">{best.meeting}</span>에서 논의됐어요.</p>
              <div className="mt-4 space-y-3">{results.map((item,index)=><article key={item.id} className="group rounded-2xl border border-border bg-white p-5 shadow-[0_3px_16px_rgba(15,23,42,0.04)] transition hover:border-blue-200 hover:shadow-md">
                <div className="flex flex-wrap items-center gap-2"><span className={"rounded-full px-2.5 py-1 text-xs font-bold "+(index===0?"bg-blue-50 text-primary":"bg-slate-100 text-slate-600")}>{index===0?"가장 유사":"유사 안건"}</span><Status status={item.status}/><span className="ml-auto text-xs font-semibold text-muted-foreground">일치도 {Math.max(68,96-index*13)}%</span></div>
                <h2 className="mt-3 text-[17px] font-extrabold tracking-tight">{item.title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{item.summary}</p>
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 pt-4 text-[13px] text-slate-500"><span className="flex items-center gap-1.5"><CalendarDays size={14}/>{item.meeting} · {item.date}</span><span className="flex items-center gap-1.5"><MapPin size={14}/>{item.region}</span><span className="flex items-center gap-1.5"><FileText size={14}/>{item.area}</span></div>
                <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3"><p className="text-xs font-bold text-slate-500">당시 검토 결과</p><p className="mt-1.5 text-[13px] leading-5 text-slate-700">{item.answer}</p></div>
              </article>)}</div>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">※ 현재는 예시 데이터로 동작하는 시제품입니다. 실제 도입 시 협의체 문서를 등록해 검색 정확도를 높일 수 있습니다.</p>
            </div></div>
          </div>
        </div>
        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-white/95 p-4 backdrop-blur lg:left-[270px]"><div className="mx-auto max-w-4xl">
          <form onSubmit={submit} className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-white p-2 pl-4 shadow-[0_8px_32px_rgba(15,23,42,0.12)] focus-within:border-primary focus-within:ring-4 focus-within:ring-blue-50">
            <textarea aria-label="안건 검색어" rows={1} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();e.currentTarget.form?.requestSubmit()}}} placeholder="찾고 싶은 안건 내용을 입력하세요" className="max-h-28 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-[15px] outline-none placeholder:text-slate-400"/>
            <button aria-label="검색" className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition hover:brightness-110 disabled:opacity-40" disabled={!query.trim()}><ArrowUp size={19} strokeWidth={2.5}/></button>
          </form>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1 scrollbar-none sm:justify-center">{samples.map(s=><button key={s} onClick={()=>setAsked(s)} className="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-blue-50 hover:text-primary">{s.replace(" 알려줘","").replace(" 찾아줘","")}</button>)}</div>
        </div></div>
      </section>
    </div>
  </main>
}

function Status({status}:{status:Agenda["status"]}){
  const complete=status==="반영 완료";
  return <span className={"flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold "+(complete?"bg-emerald-50 text-emerald-700":status==="검토 중"?"bg-amber-50 text-amber-700":"bg-violet-50 text-violet-700")}>{complete?<CircleCheck size={13}/>:<Clock3 size={13}/>} {status}</span>
}
