const ID = "cortex-fantasy";
const BUDGETS = Object.freeze({attributes:12,skills:19,specialties:4,assets:3});
const ATTRS = ["might","finesse","vigor","reason","instinct","resolve","presence"];
const SKILLS = ["melee","ranged","athletics","stealth","influence","performance","lore","investigation","medicine","spellcasting","survival","crafting","thievery","animalHandling","perception","insight"];
const DICE = [0,4,6,8,10,12];
const HINDER_STEPS = Object.freeze({6:0,8:4,10:6,12:8});
const hinderDie = faces => HINDER_STEPS[faces] ?? 0;
const cap = s => s.replace(/([A-Z])/g,' $1').replace(/^./,x=>x.toUpperCase());
const escapeHTML = s => String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const field = (initial="") => new foundry.data.fields.StringField({required:true,initial});
const die = (initial=0) => new foundry.data.fields.NumberField({required:true,integer:true,initial,choices:DICE});
const schema = obj => new foundry.data.fields.SchemaField(obj);
function namedRating(initial=0) { return schema({name:field(),rating:die(initial),notes:field()}); }
function numberedRows(count, factory) { const o={}; for(let i=0;i<count;i++) o[`r${i}`]=factory(); return schema(o); }
const ratings = keys => schema(Object.fromEntries(keys.map(k=>[k,die(k==='none'?0:4)])));
class CharacterData extends foundry.abstract.TypeDataModel {
 static defineSchema(){return {
  concept:field(),pronouns:field(),ancestry:field(),background:field(),notes:field(),equipment:field(),
  attributes:ratings(ATTRS), skills:schema(Object.fromEntries(SKILLS.map(k=>[k,die(0)]))),
  distinctions:schema({first:namedRating(8),second:namedRating(8),third:namedRating(8)}),
  specialties:numberedRows(6,namedRating), assets:numberedRows(6,namedRating),
  abilities:numberedRows(6,()=>schema({name:field(),type:field(),description:field()})),
  beliefs:numberedRows(2,()=>field()), instincts:numberedRows(2,()=>field()),
  stress:schema({physical:die(0),mental:die(0),social:die(0)}),
  trauma:schema({physical:die(0),mental:die(0),social:die(0)}),
  complications:numberedRows(5,namedRating),
  plotPoints:new foundry.data.fields.NumberField({required:true,integer:true,min:0,initial:1})
 };}
}

const opts = (value, {includeZero=true,showUntrained=false,skipD4=false}={}) => (includeZero?DICE:DICE.slice(1)).filter(n=>!(skipD4&&n===4)).map(n=>`<option value="${n}" ${Number(value)===n?'selected':''}>${n===0?(showUntrained?'Untrained':'—'):`d${n}`}</option>`).join('');
function dieSelect(path,value, extra=''){return `<select name="system.${path}" class="cfx-die" ${extra}>${opts(value,{skipD4:path.startsWith('skills.')||path.startsWith('specialties.')||path.startsWith('assets.')})}</select>`;}
function textInput(path,value,placeholder=''){return `<input name="system.${path}" type="text" value="${escapeHTML(value)}" placeholder="${escapeHTML(placeholder)}" autocomplete="off">`;}
function area(path,value,placeholder=''){return `<textarea name="system.${path}" rows="2" placeholder="${escapeHTML(placeholder)}">${escapeHTML(value)}</textarea>`;}

function makePoolOptions(actor){
 const sys=actor.system, list=[];
 for(const k of ATTRS)if(sys.attributes[k]>0)list.push({category:'Attributes',label:cap(k),faces:sys.attributes[k]});
 for(const k of SKILLS)if(sys.skills[k]>0)list.push({category:'Skills',label:cap(k),faces:sys.skills[k]});
 for(const [i,d] of Object.values(sys.distinctions).entries())if(d.name && d.rating>0)list.push({category:'Distinctions',label:d.name,faces:d.rating});
 for(const d of Object.values(sys.specialties))if(d.name&&d.rating>0)list.push({category:'Specialties',label:d.name,faces:d.rating});
 for(const d of Object.values(sys.assets))if(d.name&&d.rating>0)list.push({category:'Assets',label:d.name,faces:d.rating});
 // Stress and complications are opposition, not automatic helpful dice; optional manual dice cover special rolls.
 return list;
}

async function rollPool(actor){
 const pool=makePoolOptions(actor);
 let grouped = '';
 for(const cat of ['Attributes','Skills','Distinctions','Specialties','Assets']){
  const items=pool.map((d,i)=>({...d,i})).filter(d=>d.category===cat);
  if(!items.length)continue;
  grouped+=`<fieldset class="cfx-poolgroup"><legend>${cat}</legend>${items.map(d=>`<div class="cfx-poolrow"><label class="cfx-poolopt"><input type="checkbox" value="${d.i}"> ${escapeHTML(d.label)} <strong>d${d.faces}</strong></label>${cat==='Distinctions'?`<label class="cfx-hinderopt" title="Step down two dice sizes and gain 1 Plot Point when this roll is posted"><input type="checkbox" class="cfx-hinder" data-index="${d.i}"> Hinder</label>`:''}</div>`).join('')}</fieldset>`;
 }
 const selection=await foundry.applications.api.DialogV2.wait({window:{title:`${actor.name} — Build Dice Pool`},content:`<section class="cfx-rollbox"><p>Select appropriate dice. A Hindered Distinction steps down <b>two sizes</b> (d10→d6, d8→d4, d6→no die) and earns <b>+1 PP after the roll is confirmed</b>. Explain how the Distinction makes things harder.</p><div class="cfx-poolgroups">${grouped}</div><fieldset><legend>Extra dice (situational / GM)</legend><label>Die <select id="cfx-extra">${opts(0)}</select></label> <label>Quantity <input id="cfx-qty" type="number" min="0" max="8" value="0" style="width:65px"></label></fieldset></section>`,buttons:[{action:'roll',label:'Roll Selected Dice',icon:'fa-solid fa-dice',default:true,callback:(event,button,dialog)=>{
  const el=dialog.element;
  const indices=[...el.querySelectorAll('.cfx-poolopt input:checked')].map(x=>Number(x.value));
  const hinderIndices=[...el.querySelectorAll('.cfx-hinder:checked')].map(x=>Number(x.dataset.index));
  if(hinderIndices.length>1){ui.notifications.warn('Hinder only one Distinction per roll.');return false;}
  if(hinderIndices.some(i=>!indices.includes(i))){ui.notifications.warn('Select the Distinction you want to Hinder.');return false;}
  if(indices.filter(i=>pool[i].category==='Distinctions').length>1){ui.notifications.warn('Choose only one Distinction for this roll.');return false;}
  const hIdx=hinderIndices[0];
  const selected=indices.map(i=>{
   const d=pool[i];
   if(i!==hIdx)return d;
   return {...d,faces:hinderDie(d.faces),label:`${d.label} (Hindered)`};
  }).filter(d=>d.faces>0);
  const faces=Number(el.querySelector('#cfx-extra').value), quantity=Math.min(8,Math.max(0,Number(el.querySelector('#cfx-qty').value)||0));
  if(faces)for(let i=0;i<quantity;i++)selected.push({label:'Extra die',faces});
  if(selected.length<2){ui.notifications.warn('Choose at least two dice after Hindering.');return false;}
  return {dice:selected,hinderedName:hIdx===undefined?null:pool[hIdx].label};
 }},{action:'cancel',label:'Cancel',callback:()=>null}],rejectClose:false});
 if(!selection||selection===false)return;
 const formula=selection.dice.map(x=>`1d${x.faces}`).join('+');
 const roll=await new Roll(formula).evaluate();
 if(game.dice3d)await game.dice3d.showForRoll(roll,game.user,true);
 const results=roll.dice.map((d,i)=>({label:selection.dice[i]?.label??`Die ${i+1}`,faces:d.faces,result:d.results[0]?.result??0}));
 // A hitch (natural 1) cannot contribute to any kept result.
 const eligible=results.map((d,i)=>({...d,i})).filter(d=>d.result!==1);
 const defaults=[...eligible].sort((a,b)=>b.result-a.result||b.faces-a.faces);
 const totalIndices=defaults.slice(0,2).map(x=>x.i);
 const effectIndex=eligible.filter(x=>!totalIndices.includes(x.i)).sort((a,b)=>b.faces-a.faces)[0]?.i??-1;
 const rows=results.map((d,i)=>`<tr><td>${escapeHTML(d.label)}</td><td><b>d${d.faces}</b></td><td><strong class="${d.result===1?'cfx-hitch':''}">${d.result}${d.result===1?' ⚠':''}</strong></td><td><select class="cfx-keep" data-index="${i}" ${d.result===1?'disabled title="Hitches cannot be kept"':''}><option value="unused">${d.result===1?'Hitch':'Unused'}</option><option value="total" ${totalIndices.includes(i)?'selected':''}>TOTAL (add result)</option><option value="effect" ${effectIndex===i?'selected':''}>EFFECT (use die size)</option><option value="effect2">EXTRA EFFECT (+1 PP)</option></select></td></tr>`).join('');
 const ppAtRoll=actor.system.plotPoints;
 // Validate the *existing* dice assignments before allowing DialogV2 to submit.
 // Returning false from a DialogV2 button callback does NOT keep its window open.
 function getKeptChoice(el){
  const choices=[...el.querySelectorAll('.cfx-keep')].map(s=>({i:Number(s.dataset.index),role:s.value}));
  const kept=choices.filter(x=>x.role==='total'), effects=choices.filter(x=>x.role==='effect'), extras=choices.filter(x=>x.role==='effect2');
  const third=el.querySelector('#cfx-extra-total').checked;
  const second=el.querySelector('#cfx-extra-effect').checked;
  const spent=Number(third)+Number(second);
  let error='';
  if(spent>actor.system.plotPoints)error=`Not enough Plot Points: ${spent} needed, ${actor.system.plotPoints} available. Uncheck a PP option to continue.`;
  else if(kept.length!==(third?3:2))error=`Choose exactly ${third?3:2} dice for the total.`;
  else if(effects.length>1)error='Choose at most one main effect die.';
  else if(extras.length!==(second?1:0))error=second?'Choose exactly one extra effect die.':'Check Use 1 Plot Point before selecting an extra effect die.';
  else if(second&&effects.length!==1)error='An extra effect die requires a main effect die.';
  return {error,choices,spent,third,second};
 }
 const choice=await foundry.applications.api.DialogV2.wait({window:{title:`${actor.name} — Choose Kept Dice`},content:`<section class="cfx-resultbox"><p class="cfx-select-instructions">Assign <b>two dice to <span class="cfx-role-total">TOTAL</span></b> (or <b>three</b> if you spend 1 PP), and choose your <b><span class="cfx-role-effect">EFFECT</span></b>. Extra effect dice also cost 1 PP each. Hitches cannot be kept.</p><div class="cfx-pp-spend"><strong>Available PP before this roll: ${ppAtRoll}</strong><label><input type="checkbox" id="cfx-extra-total" ${ppAtRoll<1?'disabled':''}> <b>Use 1 Plot Point:</b> keep a third die in your total</label><label><input type="checkbox" id="cfx-extra-effect" ${ppAtRoll<1?'disabled':''}> <b>Use 1 Plot Point:</b> keep a second effect die</label><small>Choose the corresponding extra die below. Plot Points are deducted only when you confirm. PP earned from Hindering cannot be spent on this roll.</small></div><table><thead><tr><th>Trait</th><th>Die</th><th>Rolled</th><th>Assign die to…</th></tr></thead><tbody>${rows}</tbody></table><p class="hint">If no effect die remains, the effect defaults to d4. Canceling does not deduct PP or award a Hinder PP.</p><p class="cfx-validation" id="cfx-roll-validation" role="status" aria-live="polite"></p></section>`,buttons:[{action:'post',label:'Confirm & Post Result',icon:'fa-solid fa-comment',default:true,callback:(event,button,dialog)=>{
  const state=getKeptChoice(dialog.element);
  // The render-time guard keeps this path unreachable in ordinary use.
  if(state.error){ui.notifications.warn(state.error);return null;}
  return state;
 }},{action:'cancel',label:'Cancel',callback:()=>null}],render:(event,dialog)=>{
   const el=dialog.element;
   const post=el.querySelector('button[data-action="post"]');
   const feedback=el.querySelector('#cfx-roll-validation');
   const refresh=()=>{
    const state=getKeptChoice(el);
    if(feedback){feedback.textContent=state.error || `Ready to post. Plot Points to spend: ${state.spent}.`;feedback.classList.toggle('cfx-invalid',!!state.error);}
    if(post){post.disabled=!!state.error;post.title=state.error||'Post selected dice';}
   };
   el.addEventListener('change',refresh);
   // Catch keyboard submissions or alternate Foundry button markup if needed.
   el.addEventListener('submit',e=>{
    const state=getKeptChoice(el);
    if(state.error){e.preventDefault();e.stopImmediatePropagation();ui.notifications.warn(state.error);refresh();}
   },true);
   // Some Foundry themes use button click handlers rather than form submit.
   el.addEventListener('click',e=>{
    const target=e.target.closest('button[data-action="post"]');
    if(target){const state=getKeptChoice(el);if(state.error){e.preventDefault();e.stopImmediatePropagation();ui.notifications.warn(state.error);refresh();}}
   },true);
   refresh();
  },rejectClose:false});
 if(!choice||choice===false)return;
 if(choice.spent>actor.system.plotPoints){ui.notifications.warn('Not enough Plot Points; roll not posted.');return;}
 const total=choice.choices.filter(x=>x.role==='total').reduce((n,x)=>n+results[x.i].result,0);
 const effect=choice.choices.find(x=>x.role==='effect');
 const extraEffect=choice.choices.find(x=>x.role==='effect2');
 const faces=effect?results[effect.i].faces:4;
 const extraFaces=extraEffect?results[extraEffect.i].faces:null;
 const lines=results.map((d,i)=>{const role=choice.choices.find(x=>x.i===i)?.role??'unused';return `<span class="cfx-chatdie ${role}">${escapeHTML(d.label)}: d${d.faces} <strong>${d.result}</strong> ${d.result===1?'(Hitch)':role==='total'?'(Total)':role==='effect'?'(Effect)':role==='effect2'?'(Extra effect)':''}</span>`;}).join('');
 const ppSummary=choice.spent?`<p>Spent ${choice.spent} Plot Point${choice.spent===1?'':'s'} to keep ${[choice.third?'a third total die':null,choice.second?'an extra effect die':null].filter(Boolean).join(' and ')}.</p>`:'';
 const hinderSummary=selection.hinderedName?`<p><b>Hindered:</b> ${escapeHTML(selection.hinderedName)} — +1 PP after this roll.</p>`:'';
 const content=`<div class="cfx-chat"><header><strong>${escapeHTML(actor.name)} — Cortex Roll</strong></header><p class="cfx-chatbig">Total <b>${total}</b> · Effect <b>d${faces}${extraFaces?` + d${extraFaces}`:''}</b></p><div class="cfx-chatdice">${lines}</div>${ppSummary}${hinderSummary}${results.some(x=>x.result===1)?'<p>⚠ One or more hitches (rolled 1)</p>':''}</div>`;
 // Do not attach the Roll: those dice have already been evaluated and animated.
 await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content,flavor:`Cortex Pool: ${results.map(x=>`d${x.faces}`).join(' + ')}`,style:CONST.CHAT_MESSAGE_STYLES.OTHER},{rollMode:game.settings.get('core','rollMode')});
 const updatedPP=Math.max(0,actor.system.plotPoints-choice.spent+(selection.hinderedName?1:0));
 if(choice.spent||selection.hinderedName)await actor.update({'system.plotPoints':updatedPP});
}

async function usePlotPoint(actor){
 if(actor.system.plotPoints<1){ui.notifications.warn('This character has no Plot Points to spend.');return;}
 const uses=[
  ['asset','Create a temporary d6 asset (scene)'],
  ['extend','Keep a temporary asset through the session'],
  ['share','Make a temporary asset available to others'],
  ['interfere','Interfere in an ongoing contest'],
  ['stay','Stay in the fight (take a Complication instead)'],
  ['ability','Activate an Ability with a PP cost'],
  ['other','Other Plot Point use (GM-approved)']
 ];
 const selection=await foundry.applications.api.DialogV2.wait({window:{title:`${actor.name} — Use Plot Point`},content:`<section class="cfx-pp-dialog"><p>Available: <b>${actor.system.plotPoints} Plot Points</b>. Choose a use; spending happens when you confirm.</p><label>Plot Point use <select id="cfx-pp-use">${uses.map(([key,label])=>`<option value="${key}">${escapeHTML(label)}</option>`).join('')}</select></label><label>Details (optional) <input id="cfx-pp-details" placeholder="Asset name, Ability, or fiction…" maxlength="200"></label><p class="hint">To keep an extra total or effect die, use the controls in the roll confirmation dialog instead.</p></section>`,buttons:[{action:'spend',label:'Spend 1 Plot Point',default:true,callback:(event,button,dialog)=>({use:dialog.element.querySelector('#cfx-pp-use').value,details:dialog.element.querySelector('#cfx-pp-details').value.trim()})},{action:'cancel',label:'Cancel',callback:()=>null}],rejectClose:false});
 if(!selection||selection===false)return;
 if(actor.system.plotPoints<1){ui.notifications.warn('Not enough Plot Points.');return;}
 const label=uses.find(x=>x[0]===selection.use)?.[1]??'Other Plot Point use';
 await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:`<div class="cfx-chat"><strong>${escapeHTML(actor.name)} spent 1 Plot Point</strong><p>${escapeHTML(label)}</p>${selection.details?`<p>${escapeHTML(selection.details)}</p>`:''}</div>`,style:CONST.CHAT_MESSAGE_STYLES.OTHER},{rollMode:game.settings.get('core','rollMode')});
 await actor.update({'system.plotPoints':Math.max(0,actor.system.plotPoints-1)});
}

class FantasySheet extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2){
 static DEFAULT_OPTIONS={classes:['cortex-fantasy','sheet'],position:{width:840,height:750},window:{resizable:true},actions:{roll:FantasySheet.rollAction,pp:FantasySheet.ppAction,usepp:FantasySheet.usePPAction}};
 static PARTS={sheet:{template:`systems/${ID}/templates/actor.hbs`}};
 constructor(options={}){super(options);this._cfxTab='traits';this._cfxScroll={};}
 async _prepareContext(options){const context=await super._prepareContext(options);const s=this.actor.system;return {...context,actor:this.actor,edit:this.isEditable,content:renderSheet(s,this.actor,this._cfxTab)};}
 static async rollAction(event,button){await rollPool(this.actor);}
 static async usePPAction(event,button){await usePlotPoint(this.actor);}
 static async ppAction(event,button){await this.actor.update({'system.plotPoints':Math.max(0,this.actor.system.plotPoints+Number(button.dataset.delta))});}
 _saveScroll(){const sc=this.element?.querySelector('.cfx-scroll');if(sc)this._cfxScroll[this._cfxTab]=sc.scrollTop;}
 _onRender(context,options){super._onRender(context,options);
  const el=this.element;
  // Tab switching is an in-place UI change, not a document re-render.
  // This keeps unsaved input, scroll offsets, and the sheet position stable.
  const showTab=(tab)=>{
   if(!['traits','extras','story','status'].includes(tab))return;
   this._cfxTab=tab;
   for(const panel of el.querySelectorAll('[data-cfx-panel]')){
    const isActive=panel.dataset.cfxPanel===tab;
    panel.hidden=!isActive;
    panel.classList.toggle('active',isActive);
   }
   for(const b of el.querySelectorAll('.cfx-tabs button[data-tab]')){
    const isActive=b.dataset.tab===tab;
    b.classList.toggle('active',isActive);
    b.setAttribute('aria-selected',String(isActive));
   }
  };
  for(const b of el.querySelectorAll('.cfx-tabs button[data-tab]')){
   b.addEventListener('click',event=>{
    event.preventDefault();
    this._saveScroll();
    showTab(b.dataset.tab);
    const sc=el.querySelector('.cfx-scroll');
    if(sc)sc.scrollTop=this._cfxScroll[this._cfxTab]??0;
   });
  }
  showTab(this._cfxTab);
  const sc=el.querySelector('.cfx-scroll');if(sc)sc.scrollTop=this._cfxScroll[this._cfxTab]??0;
  const refreshBudgets=()=>{
   for(const [group,base] of Object.entries(BUDGETS)){
    const inputs=[...el.querySelectorAll(`select[name^="system.${group}."][name$=".rating"], select[name^="system.${group}."]:not([name$=".rating"])`)];
    const spent=inputs.reduce((sum,input)=>{
     const rating=Number(input.value);
     // Attributes begin at d4; a trained Skill, Specialty or Asset begins at d6.
     // For all current creation budgets, upgrading one die step costs one point.
     return sum+(group==='attributes'?Math.max(0,(rating-4)/2):(rating>=6?(rating-4)/2:0));
    },0);
    const remaining=base-spent;
    const overCap=inputs.some(input=>Number(input.value)>(group==='assets'?10:group==='specialties'?8:group==='skills'||group==='attributes'?10:Infinity));
    const counter=el.querySelector(`[data-cfx-budget="${group}"]`);
    if(counter){
     const capNotice=overCap?' · exceeds starting die cap':'';
     counter.textContent=`${remaining} remaining · ${spent}/${base} spent${capNotice}`;
     counter.classList.toggle('cfx-overbudget',remaining<0||overCap);
     counter.setAttribute('aria-label',`${group}: ${remaining} points remaining out of ${base}${capNotice}`);
    }
   }
  };
  for(const input of el.querySelectorAll('select[name^="system.attributes."],select[name^="system.skills."],select[name^="system.specialties."][name$=".rating"],select[name^="system.assets."][name$=".rating"]')) input.addEventListener('change',refreshBudgets);
  refreshBudgets();
  el.querySelectorAll('[name^="system."], [name="name"]').forEach(input=>input.addEventListener('change',async e=>{
   if(!this.isEditable)return;
   this._saveScroll();const path=e.currentTarget.name;const value=e.currentTarget.tagName==='SELECT'||e.currentTarget.type==='number'?Number(e.currentTarget.value):e.currentTarget.value;
   // Character names are Actor fields, all others are system paths.
   await this.actor.update({[path]:value});
  }));
  el.querySelectorAll('textarea').forEach(text=>text.addEventListener('blur',e=>{if(e.currentTarget.value!==e.currentTarget.defaultValue)e.currentTarget.dispatchEvent(new Event('change',{bubbles:false}));}));
 }
}
function renderSheet(s,actor,tab){
 const parts=[];
 parts.push(`<header class="cfx-identity"><img src="${escapeHTML(actor.img)}" alt="Portrait"/><div class="cfx-identity-fields"><label>Character Name <input name="name" value="${escapeHTML(actor.name)}"></label><label>Concept ${textInput('concept',s.concept,'Druid, warrior, spellblade…')}</label><div class="cfx-pair"><label>Ancestry ${textInput('ancestry',s.ancestry)}</label><label>Background ${textInput('background',s.background)}</label></div></div><div class="cfx-pp"><span>Plot Points</span><div><button type="button" data-action="pp" data-delta="-1">−</button><strong>${s.plotPoints}</strong><button type="button" data-action="pp" data-delta="1">+</button></div><button type="button" data-action="usepp" class="cfx-usepp"><i class="fa-solid fa-coins"></i> Use Plot Point</button><button type="button" class="cfx-primary" data-action="roll"><i class="fa-solid fa-dice"></i> Roll Pool</button></div></header>`);
 parts.push(`<nav class="cfx-tabs">${[['traits','Traits, Skills & Distinctions'],['extras','Assets & Abilities'],['story','Beliefs & Instincts'],['status','Stress & Notes']].map(([key,label])=>`<button type="button" data-tab="${key}" role="tab" aria-selected="${tab===key}" class="${tab===key?'active':''}">${label}</button>`).join('')}</nav>`);
 const panels=[];
 for(const currentTab of ['traits','extras','story','status']){
 let body='';
 if(currentTab==='traits'){
 const attrs=ATTRS.map(k=>`<label class="cfx-rating"><span>${cap(k)}</span>${dieSelect(`attributes.${k}`,s.attributes[k])}</label>`).join('');
 const skills=SKILLS.map(k=>`<label class="cfx-rating"><span>${cap(k)}</span>${dieSelect(`skills.${k}`,s.skills[k])}</label>`).join('');
 const distinctions=Object.entries(s.distinctions).map(([k,d],i)=>`<div class="cfx-traitline"><label>Distinction ${i+1}${textInput(`distinctions.${k}.name`,d.name,'Short defining phrase')}</label>${dieSelect(`distinctions.${k}.rating`,d.rating)}</div>`).join('');
 body=`<div class="cfx-columns"><div class="cfx-column-stack"><section class="cfx-panel"><h2>Attributes <small>12 points · d4 → d10</small></h2><div class="cfx-budget" data-cfx-budget="attributes" aria-live="polite"></div>${attrs}</section><section class="cfx-panel"><h2>Distinctions <small>d8/d8/d8 or d10/d8/d6</small></h2>${distinctions}<p class="cfx-hint">Three defining traits; no SFX.</p></section></div><section class="cfx-panel"><h2>Skills <small>19 points · untrained = no die</small></h2><div class="cfx-budget" data-cfx-budget="skills" aria-live="polite"></div>${skills}</section></div>`;
 }
 if(currentTab==='story'){
 const b=Object.entries(s.beliefs).map(([k,v],i)=>`<label>Belief ${i+1}${area(`beliefs.${k}`,v,'I believe…')}</label>`).join('');
 const ins=Object.entries(s.instincts).map(([k,v],i)=>`<label>Instinct ${i+1}${area(`instincts.${k}`,v,'Whenever… I always…')}</label>`).join('');
 body=`<div class="cfx-columns"><section class="cfx-panel"><h2>Beliefs</h2>${b}</section><section class="cfx-panel"><h2>Instincts</h2>${ins}</section></div>`;
 }
 if(currentTab==='extras'){
 const specials=Object.entries(s.specialties).map(([k,d])=>`<div class="cfx-traitline">${textInput(`specialties.${k}.name`,d.name,'Specialty name')}${dieSelect(`specialties.${k}.rating`,d.rating)}</div>`).join('');
 const assets=Object.entries(s.assets).map(([k,d])=>`<div class="cfx-traitline">${textInput(`assets.${k}.name`,d.name,'Item, companion, affiliation…')}${dieSelect(`assets.${k}.rating`,d.rating)}</div>`).join('');
 const abilities=Object.entries(s.abilities).map(([k,d])=>`<div class="cfx-ability">${textInput(`abilities.${k}.name`,d.name,'Ability name')}${area(`abilities.${k}.description`,d.description,'Ability description (manual notes only)')}</div>`).join('');
 body=`<div class="cfx-columns"><section class="cfx-panel"><h2>Specialties <small>4 points · starting max d8</small></h2><div class="cfx-budget" data-cfx-budget="specialties" aria-live="polite"></div>${specials}<p class="cfx-hint">d6 costs 1, d8 costs 2. Ratings count toward the budget even if the name is blank. Only one Specialty per roll.</p></section><section class="cfx-panel"><h2>Assets <small>3 points · starting max d10</small></h2><div class="cfx-budget" data-cfx-budget="assets" aria-live="polite"></div>${assets}<p class="cfx-hint">d6 costs 1, d8 costs 2, d10 costs 3. Ratings count even if the name is blank. Ordinary equipment is free.</p></section></div><section class="cfx-panel"><h2>Abilities <small>Notes only in v0.1</small></h2><p class="cfx-hint">Passive and active effects are not automated yet.</p><div class="cfx-abilities">${abilities}</div></section>`;
 }
 if(currentTab==='status'){
 const stress=Object.entries(s.stress).map(([k,v])=>`<label class="cfx-rating"><span>${cap(k)} Stress</span>${dieSelect(`stress.${k}`,v)}</label>`).join('');
 const trauma=Object.entries(s.trauma).map(([k,v])=>`<label class="cfx-rating"><span>${cap(k)} Trauma</span>${dieSelect(`trauma.${k}`,v)}</label>`).join('');
 const comps=Object.entries(s.complications).map(([k,d])=>`<div class="cfx-traitline">${textInput(`complications.${k}.name`,d.name,'Tied Up, Disarmed, Cursed…')}${dieSelect(`complications.${k}.rating`,d.rating)}</div>`).join('');
 body=`<div class="cfx-columns"><section class="cfx-panel"><h2>Stress</h2>${stress}<p class="cfx-hint">Brief rest: step down one appropriate Stress. Extended safe rest may clear it.</p></section><section class="cfx-panel"><h2>Trauma</h2>${trauma}<p class="cfx-hint">Trauma requires more significant recovery.</p></section></div><section class="cfx-panel"><h2>Complications</h2>${comps}<p class="cfx-hint">Remove complications when their fictional cause is resolved.</p></section><div class="cfx-columns"><section class="cfx-panel"><h2>Equipment</h2>${area('equipment',s.equipment,'Ordinary gear and inventory')}</section><section class="cfx-panel"><h2>Character Notes</h2>${area('notes',s.notes,'Other notes')}</section></div>`;
 }
 panels.push(`<section class="cfx-tab-panel" data-cfx-panel="${currentTab}" ${currentTab===tab?'':'hidden'}>${body}</section>`);
 }
 parts.push(`<main class="cfx-scroll">${panels.join('')}</main>`);
 return parts.join('');
}
Hooks.on('preCreateActor',(actor,data)=>{if(data.type==='character')actor.updateSource({'prototypeToken.actorLink':true});});
Hooks.once('init',()=>{
 CONFIG.Actor.dataModels.character=CharacterData;
 CONFIG.Actor.dataModels.npc=CharacterData;
 const config=foundry.applications.apps.DocumentSheetConfig;
 config.registerSheet(foundry.documents.Actor,ID,FantasySheet,{types:['character','npc'],makeDefault:true,label:'Cortex Fantasy Sheet'});
 console.log('Cortex Fantasy | v0.1.6 initialized');
});
