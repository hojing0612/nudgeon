(function exposeNudgeonPersonalization(root){
  const BARRIER_CODES = new Set(['going','contact','overload','judged','late','energy']);

  function splitTags(value){
    if(Array.isArray(value)) return value.map(String).map(tag=>tag.trim()).filter(Boolean);
    return String(value ?? '').split(/[|,]/).map(tag=>tag.trim()).filter(Boolean);
  }

  function unique(values){
    return [...new Set(values.filter(Boolean))];
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

  function scoreStep(rawStep,profile,goalTags=[]){
    const step=normalizeStep(rawStep);
    const barrier=BARRIER_CODES.has(profile?.barrier)?profile.barrier:'going';
    const goals=unique([...(profile?.goalTags||[]),...goalTags]);
    const level=Math.max(1,Math.min(5,Number(profile?.level)||3));
    const levelGap=Math.abs(step.level-level);
    let score=levelGap===0?6:levelGap===1?3:levelGap===2?1:-2;
    if(step.barrierTags.includes(barrier)) score+=8;
    const goalMatches=goals.filter(goal=>step.goalTags.includes(goal)).length;
    score+=Math.min(8,goalMatches*4);
    return {score,levelGap,goalMatches,step};
  }

  function recommendMicrosteps({pool,profile,answers={},avoidChainIds=[],hardExcludeChainIds=[],limit=3}){
    const goals=goalTagsFromAnswers(answers);
    const avoid=new Set(avoidChainIds),hardExclude=new Set(hardExcludeChainIds),bestByChain=new Map();
    pool.map(step=>scoreStep(step,profile,goals)).forEach(candidate=>{
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

  root.NudgeonPersonalization={splitTags,goalTagsFromAnswers,scoreStep,recommendMicrosteps};
})(typeof window!=='undefined'?window:globalThis);
