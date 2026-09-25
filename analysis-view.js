/* Results reflect completed local operations; external research is explicitly unconnected. */
(() => {
  const $=id=>document.getElementById(id);
  const node=(tag,text,cls)=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
  let cancelled=false;
  const paint=()=>new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
  function render(rows){
    const report=window.WylieDocuments.analyze(rows);
    $('analysis-results').replaceChildren();
    const titles={goals:'목표·배경 관련 원문',requirements:'요구사항 후보',constraints:'일정·제약 관련 원문',questions:'확인이 필요한 원문',statements:'고객 발언 · 미확정'};
    for(const [key,title] of Object.entries(titles)){
      const section=node('section','', 'analysis-group');section.append(node('h3',`${title} (${report.groups[key].length})`));
      if(!report.groups[key].length)section.append(node('p','규칙에 해당하는 문장을 찾지 못했습니다. 해당 내용이 없다는 뜻은 아닙니다.'));
      report.groups[key].slice(0,60).forEach(row=>{const detail=document.createElement('details');detail.append(node('summary',row.text.slice(0,180)+(row.text.length>180?'…':'')),node('p',row.text),node('small',`${row.source} · 문단 ${row.paragraph} · ${row.role==='meeting'?'미확정 고객 발언':'RFP 원문'}`));section.append(detail);});
      if(report.groups[key].length>60)section.append(node('p','각 분류는 앞의 60개를 표시합니다. 원문 전체 검토를 병행해 주세요.'));
      $('analysis-results').append(section);
    }
    const research=node('section','', 'analysis-group');research.append(node('h3','문서에서 찾은 조사 키워드 후보'));
    report.keywords.forEach(k=>research.append(node('p',`${k.term} — 관련 문단 ${k.hits.length}개 · 첫 근거: ${k.hits[0].source}, 문단 ${k.hits[0].paragraph}`)));
    if(!report.keywords.length)research.append(node('p','기본 용어 목록에 해당하는 후보가 없습니다. 키워드를 직접 보완해 주세요.'));
    research.append(node('small','사전 정의한 업무 용어의 출현 빈도로 찾은 후보입니다. AI 선정·검색량 결과가 아닙니다.'));
    $('analysis-results').append(research);
    $('analysis-count').textContent=`본문 ${report.paragraphCount.toLocaleString()}개 문단에서 후보를 정리했습니다.`;
  }
  window.runDocumentAnalysis=async data=>{
    cancelled=false;$('intake-form').hidden=true;$('analysis-panel').hidden=false;$('analysis-edit').disabled=true;$('analysis-cancel').hidden=false;
    $('analysis-results').replaceChildren();$('analysis-log').replaceChildren();$('analysis-count').textContent='';
    $('analysis-state').textContent='본문을 읽고 있습니다.';$('analysis-external').textContent='';
    $('analysis-heading').textContent=data.projectName+' · 문서 분석';$('analysis-heading').focus();
    const files=[{file:data.rfp,role:'rfp'},...data.meetingFiles.map(file=>({file,role:'meeting'}))];let rows=[],failures=0;
    try{
      for(const {file,role} of files){
        if(cancelled)break;
        const line=node('li',`${file.name} — 본문 읽는 중`);$('analysis-log').append(line);await paint();
        try{
          const extracted=await window.WylieDocuments.read(file);
          if(cancelled){line.textContent=file.name+' — 중지됨';break;}
          rows.push(...extracted.map(row=>({...row,role})));line.textContent=`${file.name} — ${extracted.length}개 문단 읽기 완료`;
          render(rows);await paint();
        }catch(error){failures++;line.textContent=`${file.name} — 읽기 실패: ${error.message}`;}
      }
      if(!cancelled&&data.meetingText.trim()){
        rows.push(...data.meetingText.split(/\r?\n/).map((text,i)=>({text:text.trim(),source:'직접 입력 회의록',paragraph:i+1,role:'meeting'})).filter(row=>row.text));
        $('analysis-log').append(node('li','직접 입력 회의록 — 읽기 완료'));render(rows);
      }
      $('analysis-state').textContent=cancelled?'중지됨 · 완료한 결과는 유지됩니다.':failures?`일부 파일 읽기 실패 (${failures}개) · 등록 자료에서 확인 후 다시 분석해 주세요.`:'문서 읽기·규칙 기반 분류 완료';
      if(!rows.length)$('analysis-count').textContent='분석 가능한 본문이 없습니다. 자료를 확인해 주세요.';
      $('analysis-external').textContent=`AI 의미 분석: 연결 필요 · ListeningMind: 연결 필요 · 서비스 URL ${data.urls.filter(x=>x.trim()).length}개: 관찰 연결 필요. 현재 외부 요청은 실행하지 않았습니다.`;
    }catch(error){$('analysis-state').textContent='분석 오류: '+error.message;}
    finally{$('analysis-edit').disabled=false;$('analysis-cancel').hidden=true;}
  };
  $('analysis-cancel').addEventListener('click',()=>{cancelled=true;$('analysis-state').textContent='현재 파일 읽기 후 중지합니다.';});
  $('analysis-edit').addEventListener('click',()=>{$('analysis-panel').hidden=true;$('intake-form').hidden=false;$('project-name').focus();});
})();
