(function(){
  const SETS = [
    ['walk_11','cafe_1','cafe_5'],
    ['walk_12','walk_3','cafe_6']
  ];
  let setIndex = 0;
  const originalLoadSteps = loadSteps;

  function buildStep(stepId){
    const base = MICROSTEP_POOL.find(step => step.stepId === stepId);
    if(!base) return null;
    const group = MICROSTEP_CHAINS[base.chainId];
    if(!group?.steps?.length) return null;
    const difficulty = Math.max(0, group.steps.findIndex(step => step.stepId === stepId));
    const selected = group.steps[difficulty >= 0 ? difficulty : 0] || base;
    return {
      stepId: selected.stepId,
      chainId: base.chainId,
      difficulty: Math.max(0, difficulty),
      text: selected.title,
      why: selected.why,
      feature: selected.feature,
      help: selected.help || null,
      level: selected.level,
      barrierTags: selected.barrierTags,
      goalTags: selected.goalTags,
      done: false,
      supportOpen: false,
      selectedSupport: 0,
      adjustedDown: 0,
      adjustedUp: 0
    };
  }

  function applyDemoSet(index){
    const steps = SETS[index].map(buildStep).filter(Boolean);
    if(steps.length !== 3) return false;

    state.screen = 'micro';
    state.profile = {
      level: 3,
      levelName: '제한적 외출',
      barrier: 'going',
      barrierLabel: '외출 부담',
      vision: 'social',
      helpRequest: '밖에 나가고 사람과 말하는 게 부담스러워요.'
    };
    state.answers = {
      ...(state.answers || {}),
      barrier: 'going',
      vision: 'social',
      nudgeon_help_open: '밖에 나가고 사람과 말하는 게 부담스러워요.'
    };
    state.group = 'isolation';
    state.micro = steps;
    state.selectedMicroIndex = null;
    state.recommendationHistory = [];
    if(!(state.visited instanceof Set)) state.visited = new Set(state.visited || []);
    state.visited.add('check');
    state.visited.add('micro');
    render();
    persistProgress();
    return true;
  }

  loadSteps = async function(regen=false){
    if(regen){
      setIndex = setIndex === 0 ? 1 : 0;
      if(applyDemoSet(setIndex)) return;
    }
    return originalLoadSteps(regen);
  };

  let attempts = 0;
  const timer = setInterval(()=>{
    attempts += 1;
    if(MICROSTEP_DATA_SOURCE === 'sheet' && MICROSTEP_POOL.length >= 3){
      clearInterval(timer);
      applyDemoSet(0);
    }else if(attempts >= 50){
      clearInterval(timer);
      state.screen = 'micro';
      state.profile = state.profile || {level:3,barrier:'going',barrierLabel:'외출 부담',vision:'social',helpRequest:'밖에 나가고 사람과 말하는 게 부담스러워요.'};
      originalLoadSteps(false);
    }
  }, 100);
})();
