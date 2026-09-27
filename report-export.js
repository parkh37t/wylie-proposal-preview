/* Self-contained, offline report. Uploaded text is always escaped, never executed. */
(function(root){
  const titles={goals:'목표와 배경 관련 원문',requirements:'요구사항 후보',constraints:'일정과 제약 관련 원문',questions:'확인이 필요한 원문',statements:'고객 발언 미확정'};
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const css='body{font-family:"Malgun Gothic",sans-serif;color:#172b32;line-height:1.7;max-width:860px;margin:40px auto;padding:0 24px;overflow-wrap:anywhere}h1{font-size:26px}h2{font-size:19px;margin-top:32px}h3{font-size:15px}p{white-space:pre-wrap}small{color:#52636c}article{border-bottom:1px solid #ddd;padding:12px 0}article p{margin:4px 0}h1,h2,h3{break-after:avoid}small{display:block} @media print{body{margin:0;max-width:none;padding:0;font-size:11pt}@page{margin:20mm}}';
  function body({projectName,report,status,logs=[],notes='',createdAt}){
    const e=escape;
    let html=`<h1>${e(projectName)} 자료 검토 보고서</h1><p>규칙 기반 분류 초안입니다. AI 의미 분석과 외부 시장조사는 실행하지 않았습니다. 원문을 검토하고 조사 범위를 정하기 위한 자료입니다.</p><p>작성 시각: ${e(createdAt)}<br>처리 상태: ${e(status)}<br>읽은 본문: ${report.paragraphCount}개 문단</p><h2>자료 처리 내역</h2><ul>${logs.map(log=>`<li>${e(log)}</li>`).join('')}</ul><p>한 문단이 여러 분류에 포함될 수 있습니다. 분류되지 않은 문단도 있으므로 원문 전체 검토가 필요합니다. 문단 번호는 원본 문서에서 추출한 순서이며 페이지 번호가 아닙니다.</p>`;
    for(const [key,title] of Object.entries(titles)){
      html+=`<h2>${title} ${report.groups[key].length}건</h2>`;
      html+=report.groups[key].map((row,i)=>`<article><h3>${i+1}. ${e(title)}</h3><p>${e(row.text)}</p><small>${e(row.source)} · 문단 ${e(row.paragraph)} · ${row.role==='meeting'?'미확정 고객 발언':'RFP 원문'}</small></article>`).join('')||'<p>규칙에 해당하는 문장을 찾지 못했습니다. 해당 내용이 없다는 뜻은 아닙니다.</p>';
    }
    html+='<h2>조사 키워드 후보</h2><p>사전 정의한 업무 용어의 출현 빈도로 찾은 후보입니다. 검색량이나 시장조사 결과가 아닙니다.</p><ul>';
    html+=report.keywords.map(k=>`<li>${e(k.term)} · 관련 문단 ${k.hits.length}개 · ${e(k.hits[0].source)} 문단 ${e(k.hits[0].paragraph)}</li>`).join('')+'</ul>';
    html+=`<h2>검토 메모</h2><p>${e(notes.trim()||'아직 작성하지 않았습니다.')}</p><h2>다음 단계</h2><ol><li>사업 목표와 제안서 작성 지침을 구분하고 요구사항 후보를 원문과 대조합니다.</li><li>참조된 첨부파일과 회의록을 확인하고 누락 자료와 고객 질문을 정리합니다.</li><li>조사 질문, 키워드, 비교 서비스와 평가 기준을 확정합니다.</li><li>AI와 조사 도구 연결 후 실제 조사를 실행하고 출처를 검토합니다. 현재는 미실행 상태입니다.</li><li>조사 근거를 바탕으로 개선 기회와 제안 전략을 작성합니다.</li></ol>`;
    return html;
  }
  function html(data){return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escape(data.projectName)} 자료 검토 보고서</title><style>${css}</style></head><body>${body(data)}</body></html>`;}
  function filename(name){return (String(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,80)||'프로젝트')+' 자료 검토 보고서.html';}
  const api={body,html,filename};if(typeof module==='object'&&module.exports)module.exports=api;else root.WylieReport=api;
})(typeof window!=='undefined'?window:globalThis);
