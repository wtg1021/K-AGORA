const{test}=require('node:test');const assert=require('node:assert/strict');const{format,registerItems,menu}=require('../static/text-format.js');
test('unwraps prose and preserves list starts',()=>{assert.equal(format('❍ 계약 업무의 중복 입력을\n최소화합니다.\n❍ 별도 요구사항입니다.'),'❍ 계약 업무의 중복 입력을 최소화합니다.\n❍ 별도 요구사항입니다.');});
test('repairs a known word split across a line',()=>{assert.equal(format('관련 계\n약·부담·정산업무'),'관련 계약·부담·정산업무');assert.equal(format('K-에듀파\n인 쌍방향 연계'),'K-에듀파인 쌍방향 연계');});
test('keeps spaces between separate Korean words',()=>{assert.equal(format('업무에 집중\n가능하도록 지원'),'업무에 집중 가능하도록 지원');});
test('preserves paragraphs, numbered lists, and notes',()=>{const text='1) 첫 번째 항목\n내용을 이어서 작성\n2) 두 번째 항목\n\n※ 별도 참고사항';assert.equal(format(text),'1) 첫 번째 항목 내용을 이어서 작성\n2) 두 번째 항목\n\n※ 별도 참고사항');});
test('preserves numeric table rows and column spacing',()=>{const text='학교급  100명  300명\n초등  2,000원  5,000원\n고등  4,000원  10,000원';assert.equal(format(text),text);});
test('preserves menu paths and headings',()=>{const text='대상 메뉴:\n지출 > 계약\n서비스 > 권한';assert.equal(format(text),text);});
test('does not remove spacing inside manual paragraphs',()=>{assert.equal(format('첫 문단입니다.\n\n둘째 문단입니다.'),'첫 문단입니다.\n\n둘째 문단입니다.');});
test('learns intact words from source without changing the source',()=>{const records=[{request:'자동정산처리',source_record:{record:{source_text_by_page:[{text:'자동정산처리 내용을 검토'}]}}}];const before=JSON.stringify(records);registerItems(records);assert.equal(format('자동정산\n처리 기능'),'자동정산처리 기능');assert.equal(JSON.stringify(records),before);});
test('normalizes CRLF and leaves literal HTML as text',()=>{assert.equal(format('첫 문장\r\n이어서 작성'),'첫 문장 이어서 작성');assert.equal(format('<script>alert(1)</script>'),'<script>alert(1)</script>');});

test('joins blank PDF continuation inside bullets while retaining manual paragraphs',()=>{const text='❍ 계약 정보 자동 연계로\n\n업무 부담 감소\n\n❍ 다른 항목';assert.equal(format(text,{pdf:true}),'❍ 계약 정보 자동 연계로 업무 부담 감소\n\n❍ 다른 항목');assert.equal(format(text),text);});

test('keeps workflow diagram rows separate from surrounding prose',()=>{const diagram='계약서 작성 계약 체결\n계약방법 계약(요청) 첨부서류 계약 체결\n(계약서류 정보 연계\n결정 정보 입력 전송 (결재)\n첨부) (계약 완료)';assert.equal(format('❍ 계약 정보 연계\n\n'+diagram,{pdf:true}),'❍ 계약 정보 연계\n\n'+diagram);});
test('connects parenthetical continuation separated by extraction whitespace',()=>{assert.equal(format('지정정보처리장치\n\n(G2B·S2B·eaT)와 연계 기능이 없음',{pdf:true}),'지정정보처리장치 (G2B·S2B·eaT)와 연계 기능이 없음');});

test('menu: strips empty PDF controls and normalizes en dashes',()=>{assert.equal(menu('[수입관리] – 출납관리 – 신용카드승인 취소요청 – 고지서출력\n[ ] [ / ] [ ]'),'수입관리 > 출납관리 > 신용카드승인 취소요청 > 고지서출력');});
test('menu: keeps screen alternatives at the same hierarchy level',()=>{assert.equal(menu('지출관리 > 계약처리 > 계약목록, 검사검수목록'),'지출관리 > 계약처리 > 계약목록/검사검수목록');assert.equal(menu('지출관리>지출처리>지출품의>품의등록 / 품의목록'),'지출관리 > 지출처리 > 지출품의 > 품의등록/품의목록');});
test('menu: keeps distinct routes on separate lines',()=>{assert.equal(menu('① 지출관리 > 출장여비(관내)\n\n② 서비스공통>권한관리>(재정)접근권한관리'),'지출관리 > 출장여비(관내)\n서비스공통 > 권한관리 > (재정)접근권한관리');});
test('menu: supports arrows and spaced hyphens without changing K-EDUFINE names',()=>{assert.equal(menu('K-에듀파인 - 지출관리 → 지출품의'),'K-에듀파인 > 지출관리 > 지출품의');});
test('menu: joins wrapped separators and is idempotent',()=>{const path=menu('지출관리 >\n지출처리 > 지출품의\n> 품의등록');assert.equal(path,'지출관리 > 지출처리 > 지출품의 > 품의등록');assert.equal(menu(path),path);});
test('menu: preserves unspecified paths and real repeated menu names',()=>{assert.equal(menu('회계연도가 존재하는 학교회계 메뉴'),'회계연도가 존재하는 학교회계 메뉴');assert.equal(menu('지출관리 > 계약처리 > 계약처리 > 검사검수목록'),'지출관리 > 계약처리 > 계약처리 > 검사검수목록');assert.equal(menu('[ ] [ / ] [ ]'),'');});
