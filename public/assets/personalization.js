(function exposeNudgeonPersonalization(root){
  const BARRIER_CODES = new Set(['going','contact','overload','judged','late','energy']);

  const HELP_GOAL_RULES = [
    {tags:['job','career'], pattern:/(취업|구직|일자리|직장|회사|면접|이력서|자소서|아르바이트|알바|일하고\s*싶)/},
    {tags:['edu'], pattern:/(공부|학업|학교|대학|복학|수업|시험|자격증|졸업)/},
    {tags:['friend','peer','community'], pattern:/(친구|사람들과?|인간관계|대인관계|관계|모임|대화|연락)/},
    {tags:['daily'], pattern:/(생활|일상|수면|잠|식사|씻|정리|청소|운동|건강|병원)/},
    {tags:['money'], pattern:/(돈|경제|생활비|월세|빚|재정|금전)/},
    {tags:['pro','change'], pattern:/(마음|정신건강|상담|치료|우울|불안|회복|달라지고\s*싶)/}
  ];
  const HELP_BARRIER_RULES = [
    {tag:'going', pattern:/(외출|밖에\s*나가|집\s*밖|현관|산책)/},
    {tag:'contact', pattern:/(연락|전화|문자|답장|대화|말\s*걸|사람\s*만나|친구\s*만나)/},
    {tag:'overload', pattern:/(모르겠|뭘\s*해야|무엇을\s*해야|어디서부터|막막|정보|복잡|선택하기\s*어려)/},
    {tag:'judged', pattern:/(무섭|무서워|무서운|두렵|불안|거절|평가|눈치|실수|창피|민망|부담)/},
    {tag:'late', pattern:/(늦었|늦은|뒤처|이미\s*늦|포기|실패|자책)/},
    {tag:'energy', pattern:/(기운|피곤|지쳤|지쳐|무기력|힘이\s*없|귀찮|침대|아무것도\s*못)/}
  ];

  function splitTags(value){
    if(Array.isArray(value)) return value.map(String).map(tag=>tag.trim()).filter(Boolean);
    return String(value ?? '').split(/[|,]/).map(tag=>tag.trim()).filter(Boolean);
  }

  function unique(values){
    return [...new Set(values.filter(Boolean))];
  }

  function helpSignalsFromText(value){
    const text=String(value??'').trim().toLowerCase().replace(/\s+/g,' ');
    if(!text)return {goalTags:[],barrierTags:[]};
    const goalTags=HELP_GOAL_RULES.flatMap(rule=>rule.pattern.test(text)?rule.tags:[]);
    const barrierTags=HELP_BARRIER_RULES.filter(rule=>rule.pattern.test(text)).map(rule=>rule.tag);
    return {goalTags:unique(goalTags),barrierTags:unique(barrierTags)};
  }

  function goalTagsFromAnswers(answers={}){
    const tags=[];
    ['h_need','i_need','p_goal'].forEach(key=>{ if(answers[key]) tags.push(String(answers[key])); });
    const concernMap={
      job:['job','career'],rel:['friend','peer','community'],study:['edu'],
      health:['daily','pro'],family:['friend'],money:['money'],gradual:['change']
    };
    tags.push(...(concernMap[answers.s1_why]||[]));
    const warmupMap={study:['edu'],house:['daily'],rest:['daily','solo'],quiet:['solo']};
    tags.push(...(warmupMap[answers.w_do]||[]));
    const legacyMap={
      work:['job','career'],social:['friend','peer','community'],study:['edu'],unsure:['change']
    };
    tags.push(...(legacyMap[answers.vision]||[]));
    return unique(tags);
  }

  function normalizeStep(step){
    return {...step,level:Number(step.level)||3,
      barrierTags:splitTags(step.barrierTags??step.barrier_tags),
      goalTags:splitTags(step.goalTags??step.goal_tags)};
  }

  function scoreStep(rawStep,profile,goalTags=[],helpBarrierTags=[],helpGoalTags=[]){
    const step=normalizeStep(rawStep);
    const barrier=BARRIER_CODES.has(profile?.barrier)?profile.barrier:'going';
    const goals=unique([...(profile?.goalTags||[]),...goalTags]);
    const level=Math.max(1,Math.min(5,Number(profile?.level)||3));
    const levelGap=Math.abs(step.level-level);
    let score=levelGap===0?6:levelGap===1?3:levelGap===2?1:-2;
    if(step.barrierTags.includes(barrier)) score+=8;
    const goalMatches=goals.filter(goal=>step.goalTags.includes(goal)).length;
    score+=Math.min(8,goalMatches*4);
    const helpBarrierMatch=helpBarrierTags.some(tag=>step.barrierTags.includes(tag));
    if(helpBarrierMatch)score+=6;
    const helpGoalMatches=helpGoalTags.filter(goal=>step.goalTags.includes(goal)).length;
    score+=Math.min(6,helpGoalMatches*3);
    return {score,levelGap,goalMatches,helpBarrierMatch,helpGoalMatches,step};
  }

  function recommendMicrosteps({pool,profile,answers={},avoidChainIds=[],hardExcludeChainIds=[],limit=3}){
    const goals=goalTagsFromAnswers(answers);
    const help=helpSignalsFromText(answers.nudgeon_help_open||profile?.helpRequest||'');
    const avoid=new Set(avoidChainIds),hardExclude=new Set(hardExcludeChainIds),bestByChain=new Map();
    pool.map(step=>scoreStep(step,profile,goals,help.barrierTags,help.goalTags)).forEach(candidate=>{
      const chainId=String(candidate.step.chainId||'').trim();
      if(!chainId)return;
      const current=bestByChain.get(chainId);
      const better=!current||candidate.score>current.score||
        (candidate.score===current.score&&candidate.levelGap<current.levelGap)||
        (candidate.score===current.score&&candidate.levelGap===current.levelGap&&
          String(candidate.step.stepId).localeCompare(String(current.step.stepId))<0);
      if(better)bestByChain.set(chainId,candidate);
    });
    const ranked=[...bestByChain.values()].sort((a,b)=>b.score-a.score||a.levelGap-b.levelGap||
      String(a.step.chainId).localeCompare(String(b.step.chainId)));
    const selected=[];
    const addFrom=tier=>{for(const candidate of tier){
      if(selected.length>=limit)break;
      if(!selected.some(item=>item.step.chainId===candidate.step.chainId))selected.push(candidate);
    }};
    addFrom(ranked.filter(item=>!hardExclude.has(item.step.chainId)&&!avoid.has(item.step.chainId)));
    addFrom(ranked.filter(item=>!hardExclude.has(item.step.chainId)));
    addFrom(ranked);
    return selected.slice(0,limit).map(item=>item.step);
  }

  root.NudgeonPersonalization={splitTags,helpSignalsFromText,goalTagsFromAnswers,scoreStep,recommendMicrosteps};
})(typeof window!=='undefined'?window:globalThis);
