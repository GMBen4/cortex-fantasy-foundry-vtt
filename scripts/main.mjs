const ID = "cortex-fantasy";
const BUDGETS = Object.freeze({attributes:12,skills:19,specialties:4,assets:3});
const ATTRS = ["might","finesse","vigor","reason","instinct","resolve","presence"];
const SKILLS = ["melee","ranged","athletics","stealth","influence","performance","lore","investigation","medicine","spellcasting","survival","crafting","thievery","animalHandling","perception","insight"];
const DICE = [0,4,6,8,10,12];
const NPC_TYPES = ['minor', 'major', 'mob'];
const MAX_MOB_DICE = 30;
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
class FantasyActor extends foundry.documents.Actor {
 get sheet() {
  const worldActor = this.isToken ? this.token?.baseActor : null;
  if (worldActor?.type === 'character') return worldActor.sheet;
  return super.sheet;
 }
}

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

// Retain every v0.1.8 field on existing NPCs, including fields outside the new sheet.
class NpcData extends CharacterData {
 static defineSchema() {
  const {ArrayField, NumberField, StringField} = foundry.data.fields;
  const mobDie = new NumberField({required: true, integer: true, initial: 6, choices: DICE.slice(1)});
  return {
   ...super.defineSchema(),
   npcType: new StringField({required: true, initial: 'minor', choices: NPC_TYPES}),
   npcTraits: new ArrayField(schema({id: field(), name: field(), rating: mobDie}), {initial: []}),
   mobDie: new NumberField({required: true, integer: true, initial: 6, choices: DICE.slice(1)}),
   mobCount: new NumberField({required: true, integer: true, initial: 3, min: 0, max: MAX_MOB_DICE})
  };
 }
}

const opts = (value, {includeZero=true,showUntrained=false,skipD4=false}={}) => (includeZero?DICE:DICE.slice(1)).filter(n=>!(skipD4&&n===4)).map(n=>`<option value="${n}" ${Number(value)===n?'selected':''}>${n===0?(showUntrained?'Untrained':'—'):`d${n}`}</option>`).join('');
function dieSelect(path,value, extra=''){return `<select name="system.${path}" class="cfx-die" ${extra}>${opts(value,{skipD4:path.startsWith('skills.')||path.startsWith('specialties.')||path.startsWith('assets.')})}</select>`;}
function textInput(path,value,placeholder=''){return `<input name="system.${path}" type="text" value="${escapeHTML(value)}" placeholder="${escapeHTML(placeholder)}" autocomplete="off">`;}
function area(path,value,placeholder=''){return `<textarea name="system.${path}" rows="2" placeholder="${escapeHTML(placeholder)}">${escapeHTML(value)}</textarea>`;}

function makePoolOptions(actor){
 const sys=actor.system, list=[];
 if (actor.type === 'npc') {
  for (const trait of sys.npcTraits) {
   if (trait.name) list.push({category: 'Rated Traits', label: trait.name, faces: trait.rating});
  }
 }
 const useLegacyRatings = actor.type !== 'npc'
  || SKILLS.some(key => sys.skills[key] > 0)
  || ATTRS.some(key => sys.attributes[key] !== 4)
  || [sys.distinctions, sys.specialties].some(group => Object.values(group).some(trait => trait.name));
 for(const k of ATTRS)if(useLegacyRatings&&sys.attributes[k]>0)list.push({category:'Attributes',label:cap(k),faces:sys.attributes[k]});
 for(const k of SKILLS)if(sys.skills[k]>0)list.push({category:'Skills',label:cap(k),faces:sys.skills[k]});
 for(const [i,d] of Object.values(sys.distinctions).entries())if(d.name && d.rating>0)list.push({category:'Distinctions',label:d.name,faces:d.rating});
 for(const d of Object.values(sys.specialties))if(d.name&&d.rating>0)list.push({category:'Specialties',label:d.name,faces:d.rating});
 for(const d of Object.values(sys.assets))if(d.name&&d.rating>0)list.push({category:'Assets',label:d.name,faces:d.rating});
 // Stress and complications are opposition, not automatic helpful dice; optional manual dice cover special rolls.
 return list;
}

async function rollPool(actor){
 const isNpc = actor.type === 'npc';
 const isMob = isNpc && actor.system.npcType === 'mob';
 if (isMob && actor.system.mobCount === 0) {
  ui.notifications.warn('The mob has no remaining dice.');
  return;
 }
 const pool=makePoolOptions(actor);
 let grouped = '';
 for(const cat of ['Rated Traits','Attributes','Skills','Distinctions','Specialties','Assets']){
  const items=pool.map((d,i)=>({...d,i})).filter(d=>d.category===cat);
  if(!items.length)continue;
  grouped+=`<fieldset class="cfx-poolgroup"><legend>${cat}</legend>${items.map(d=>`<div class="cfx-poolrow"><label class="cfx-poolopt"><input type="checkbox" value="${d.i}"> ${escapeHTML(d.label)} <strong>d${d.faces}</strong></label>${cat==='Distinctions'?`<label class="cfx-hinderopt" title="Step down two dice sizes and gain 1 Plot Point when this roll is posted"><input type="checkbox" class="cfx-hinder" data-index="${d.i}"> Hinder</label>`:''}</div>`).join('')}</fieldset>`;
 }
 function readPool(el) {
  const indices = [...el.querySelectorAll('.cfx-poolopt input:checked')].map(input => Number(input.value));
  const hinderIndices = [...el.querySelectorAll('.cfx-hinder:checked')].map(input => Number(input.dataset.index));
  if (indices.filter(i => pool[i].category === 'Specialties').length > 1) return {error: 'Choose only one Specialty for this roll.'};
  if (indices.filter(i => pool[i].category === 'Distinctions').length > 1) return {error: 'Choose only one Distinction for this roll.'};
  if (hinderIndices.length > 1) return {error: 'Hinder only one Distinction per roll.'};
  if (hinderIndices.some(i => !indices.includes(i))) return {error: 'Select the Distinction you want to Hinder.'};
  const hIdx=hinderIndices[0];
  const selected=indices.map(i=>{
   const d=pool[i];
   if(i!==hIdx)return d;
   return {...d,faces:hinderDie(d.faces),label:`${d.label} (Hindered)`};
  }).filter(d=>d.faces>0);
  const faces=Number(el.querySelector('#cfx-extra').value), quantity=Math.min(8,Math.max(0,Number(el.querySelector('#cfx-qty').value)||0));
  if(faces)for(let i=0;i<quantity;i++)selected.push({label:'Extra die',faces});
  if (isMob) {
   const {mobCount, mobDie} = actor.system;
   if (mobCount === 0) return {error: 'The mob has no remaining dice.'};
   for (let i = 0; i < mobCount; i++) selected.push({label: `Mob die ${i + 1}`, faces: mobDie});
  }
  if (isNpc && !selected.length) return {error: 'Choose at least one die.'};
  if (!isNpc && selected.length < 2) return {error: 'Choose at least two dice after Hindering.'};
  return {dice: selected, hinderedName: hIdx === undefined ? null : pool[hIdx].label};
 }
 const selection=await foundry.applications.api.DialogV2.wait({window:{title:`${actor.name} — Build Dice Pool`},content:`<section class="cfx-rollbox"><p>Select appropriate dice. ${isMob ? "All remaining mob dice are included automatically. " : ""}A Hindered Distinction steps down <b>two sizes</b> (d10→d6, d8→d4, d6→no die) and earns <b>+1 PP after the roll is confirmed</b>. Explain how the Distinction makes things harder.</p><div class="cfx-poolgroups">${grouped}</div><fieldset><legend>Extra dice (situational / GM)</legend><label>Die <select id="cfx-extra">${opts(0)}</select></label> <label>Quantity <input id="cfx-qty" type="number" min="0" max="8" value="0" style="width:65px"></label></fieldset><p class="cfx-validation" role="status" aria-live="polite"></p></section>`,buttons:[{action:'roll',label:'Roll Selected Dice',icon:'fa-solid fa-dice',default:true,callback: (event, button, dialog) => {
   const selection = readPool(dialog.element);
   if (selection.error) { ui.notifications.warn(selection.error); return null; }
   return selection;
  }}, {action: 'cancel', label: 'Cancel', callback: () => null}],
  render: (event, dialog) => {
   const el = dialog.element;
   const button = el.querySelector('button[data-action="roll"]');
   const feedback = el.querySelector('.cfx-validation');
   const refresh = () => {
    const {error} = readPool(el);
    if (button) button.disabled = Boolean(error);
    feedback.textContent = error ?? '';
    feedback.hidden = !error;
    feedback.classList.toggle('cfx-invalid', Boolean(error));
   };
   el.addEventListener('change', refresh);
   el.addEventListener('input', refresh);
   refresh();
  }, rejectClose: false});
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
 const assignments = [
  ['total', 'Total'], ['effect', 'Effect'], ['total2', 'Extra Total'],
  ['effect2', 'Extra Effect'], ['unused', 'Unused']
 ];
 const rows = results.map((die, i) => {
  const hitch = die.result === 1;
  const selected = totalIndices.includes(i) ? 'total' : effectIndex === i ? 'effect' : 'unused';
  const controls = hitch ? 'Hitch' : `<div class="cfx-assignments" role="group" aria-label="Assignment for die ${i + 1}, ${escapeHTML(die.label)}">${
   assignments.map(([role, label]) =>
    `<label><input class="cfx-keep" type="radio" name="cfx-assignment-${i}" data-index="${i}" value="${role}" ${selected === role ? 'checked' : ''}><span>${label}</span></label>`
   ).join('')
  }</div>`;
  return `<tr><td>${escapeHTML(die.label)}</td><td><b>d${die.faces}</b></td><td><strong class="${hitch ? 'cfx-hitch' : ''}">${die.result}${hitch ? ' ⚠' : ''}</strong></td><td>${controls}</td></tr>`;
 }).join('');
 const ppAtRoll=actor.system.plotPoints;
 const baseTotalCount = Math.min(2, eligible.length);
 const shortTotal = baseTotalCount < 2;
 const canBuyTotal = eligible.length >= 3 && ppAtRoll >= 1;
 const canBuyEffect = eligible.length >= 4 && ppAtRoll >= 1;
 // Validate the *existing* dice assignments before allowing DialogV2 to submit.
 // Returning false from a DialogV2 button callback does NOT keep its window open.
 function getKeptChoice(el){
  const choices=[...el.querySelectorAll('.cfx-keep:checked')].map(s=>({i:Number(s.dataset.index),role:s.value}));
  const kept=choices.filter(x=>x.role==='total'), effects=choices.filter(x=>x.role==='effect'), extras=choices.filter(x=>x.role==='effect2');
  const extraTotals=choices.filter(x=>x.role==='total2');
  const third=el.querySelector('#cfx-extra-total').checked;
  const second=el.querySelector('#cfx-extra-effect').checked;
  const spent=Number(third)+Number(second);
  let error='';
  const available = Math.min(ppAtRoll, actor.system.plotPoints);
  if(spent>available)error=`Not enough Plot Points: ${spent} needed, ${available} available. Uncheck a PP option to continue.`;
  else if(kept.length!==baseTotalCount)error=`Choose exactly ${baseTotalCount} dice as Total.`;
  else if(extraTotals.length!==Number(third))error=third?'Choose exactly one Extra Total die.':'Check Use 1 Plot Point before selecting an Extra Total die.';
  else if(effects.length>1)error='Choose at most one main effect die.';
  else if(extras.length!==(second?1:0))error=second?'Choose exactly one extra effect die.':'Check Use 1 Plot Point before selecting an extra effect die.';
  else if(second&&effects.length!==1)error='An extra effect die requires a main effect die.';
  const total = [...kept, ...extraTotals].reduce((sum, {i}) => sum + results[i].result, 0);
  const faces = effects.length ? results[effects[0].i].faces : 4;
  const extraFaces = extras.length ? results[extras[0].i].faces : null;
  return {error, choices, spent, third, second, total, faces, extraFaces, extraTotals, extras};
 }
 const choice=await foundry.applications.api.DialogV2.wait({window:{title:`${actor.name} — Choose Kept Dice`},position:{width:720},content:`<section class="cfx-resultbox"><p class="cfx-select-instructions">${shortTotal
  ? `Keep ${baseTotalCount === 1 ? "the one usable die" : "zero dice"} for the total. Missing dice contribute zero.`
  : 'Assign <b>two dice to <span class="cfx-role-total">TOTAL</span></b> (or <b>three</b> if you spend 1 PP), and choose your <b><span class="cfx-role-effect">EFFECT</span></b>. Extra effect dice also cost 1 PP each.'} Hitches cannot be kept.</p><div class="cfx-pp-spend"><label><input type="checkbox" id="cfx-extra-total" ${!canBuyTotal?'disabled':''}> <b>Use 1 Plot Point:</b> keep an Extra Total die</label><label><input type="checkbox" id="cfx-extra-effect" ${!canBuyEffect?'disabled':''}> <b>Use 1 Plot Point:</b> keep an Extra Effect die</label><small>Choose the corresponding extra die below. Plot Points are deducted only when you confirm. PP earned from Hindering cannot be spent on this roll.</small></div>
  <dl class="cfx-roll-summary" aria-live="polite" aria-atomic="true">
   <div><dt>Current Total</dt><dd data-summary="total"></dd></div>
   <div><dt>Current Effect Die</dt><dd data-summary="effect"></dd></div>
   <div><dt>Extra Total</dt><dd data-summary="extraTotal"></dd></div>
   <div><dt>Extra Effect</dt><dd data-summary="extraEffect"></dd></div>
   <div><dt>Plot Points to spend</dt><dd data-summary="spent"></dd></div>
   <div><dt>Plot Points before roll</dt><dd>${ppAtRoll}</dd></div>
  </dl>
  <div class="cfx-assignment-table"><table><thead><tr><th>Trait</th><th>Die</th><th>Rolled</th><th>Assignment</th></tr></thead><tbody>${rows}</tbody></table></div><p class="hint">If no effect die remains, the effect defaults to d4. Canceling does not deduct PP or award a Hinder PP.</p><p class="cfx-validation" id="cfx-roll-validation" role="status" aria-live="polite"></p></section>`,buttons:[{action:'post',label:'Confirm & Post Result',icon:'fa-solid fa-comment',default:true,callback:(event,button,dialog)=>{
  const state=getKeptChoice(dialog.element);
  // The render-time guard keeps this path unreachable in ordinary use.
  if(state.error){ui.notifications.warn(state.error);return null;}
  return state;
 }},{action:'cancel',label:'Cancel',callback:()=>null}],render:(event,dialog)=>{
   const el=dialog.element;
   const post=el.querySelector('button[data-action="post"]');
   const feedback=el.querySelector('#cfx-roll-validation');
   const summary = el.querySelector('.cfx-roll-summary');
   const refresh=()=>{
    const state=getKeptChoice(el);
    const values = {
     total: state.total, effect: `d${state.faces}`,
     extraTotal: state.extraTotals.map(({i}) => `${results[i].result} (d${results[i].faces})`).join(', ') || '—',
     extraEffect: state.extras.map(({i}) => `d${results[i].faces}`).join(', ') || '—',
     spent: state.spent
    };
    for (const [key, value] of Object.entries(values)) {
     summary.querySelector(`[data-summary="${key}"]`).textContent = value;
    }
    if(feedback){feedback.textContent=state.error || 'Ready to post.';feedback.classList.toggle('cfx-invalid',!!state.error);}
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
 const {total, faces, extraFaces} = choice;
 const lines=results.map((d,i)=>{const assigned=choice.choices.find(x=>x.i===i)?.role??'unused';const role=assigned==='total2'?'total':assigned;return `<span class="cfx-chatdie ${role}">${escapeHTML(d.label)}: d${d.faces} <strong>${d.result}</strong> ${d.result===1?'(Hitch)':role==='total'?'(Total)':role==='effect'?'(Effect)':role==='effect2'?'(Extra effect)':''}</span>`;}).join('');
 const ppSummary=choice.spent?`<p>Spent ${choice.spent} Plot Point${choice.spent===1?'':'s'} to keep ${[choice.third?'a third total die':null,choice.second?'an extra effect die':null].filter(Boolean).join(' and ')}.</p>`:'';
 const hinderSummary=selection.hinderedName?`<p><b>Hindered:</b> ${escapeHTML(selection.hinderedName)} — +1 PP after this roll.</p>`:'';
 const content=`<div class="cfx-chat"><header><strong>${escapeHTML(actor.name)} — Cortex Roll</strong></header><p class="cfx-chatbig">Total <b>${total}</b> · Effect <b>d${faces}${extraFaces?` + d${extraFaces}`:''}</b></p><div class="cfx-chatdice">${lines}</div>${ppSummary}${hinderSummary}${results.some(x=>x.result===1)?'<p>⚠ One or more hitches (rolled 1)</p>':''}</div>`;
 // Keep the original dice out of the chat payload so they animate only once.
 if (!await adjustPlotPoints(actor, Number(Boolean(selection.hinderedName)) - choice.spent, choice.spent)) return;
 await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content,flavor:`Cortex Pool: ${results.map(x=>`d${x.faces}`).join(' + ')}`,style:CONST.CHAT_MESSAGE_STYLES.OTHER},{rollMode:game.settings.get('core','rollMode')});
}

const pendingPlotPointUpdates = new WeakMap();

async function adjustPlotPoints(actor, delta, required = 0) {
 if (!delta && !required) return true;
 const previous = pendingPlotPointUpdates.get(actor);
 const update = (async () => {
  await previous;
  const balance = actor.system.plotPoints;
  if (balance < required) {
   ui.notifications.warn('Not enough Plot Points.');
   return false;
  }
  const next = Math.max(0, balance + delta);
  if (next === balance) return true;
  try {
   if (await actor.update({'system.plotPoints': next})) return true;
  } catch (error) {
   console.error('Cortex Fantasy | Plot Point update failed', error);
  }
  ui.notifications.error('Could not update Plot Points.');
  return false;
 })();
 pendingPlotPointUpdates.set(actor, update);
 try {
  return await update;
 } finally {
  if (pendingPlotPointUpdates.get(actor) === update) pendingPlotPointUpdates.delete(actor);
 }
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
 if (!await adjustPlotPoints(actor, -1, 1)) return;
 const label=uses.find(x=>x[0]===selection.use)?.[1]??'Other Plot Point use';
 await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),content:`<div class="cfx-chat"><strong>${escapeHTML(actor.name)} spent 1 Plot Point</strong><p>${escapeHTML(label)}</p>${selection.details?`<p>${escapeHTML(selection.details)}</p>`:''}</div>`,style:CONST.CHAT_MESSAGE_STYLES.OTHER},{rollMode:game.settings.get('core','rollMode')});
}

function openPortraitPicker(actor, savePortrait) {
 const Picker = foundry.applications.apps.FilePicker.implementation;
 return new Picker({type: 'image', current: actor.img, callback: savePortrait}).render({force: true});
}

class FantasySheet extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2){
 static DEFAULT_OPTIONS={classes:['cortex-fantasy','sheet'],position:{width:840,height:750},window:{resizable:true},actions:{roll:FantasySheet.rollAction,pp:FantasySheet.ppAction,usepp:FantasySheet.usePPAction,portrait:FantasySheet.pickPortrait}};
 static PARTS={sheet:{template:`systems/${ID}/templates/actor.hbs`}};
 constructor(options={}){super(options);this._cfxTab='traits';this._cfxScroll={};}
 async _prepareContext(options){const context=await super._prepareContext(options);const s=this.actor.system;return {...context,actor:this.actor,edit:this.isEditable,content:renderSheet(s,this.actor,this._cfxTab,this.isEditable)};}
 static pickPortrait() {
  if (!this.isEditable) return;
  return openPortraitPicker(this.actor, img => this.actor.update({img}));
 }
 static async rollAction(event,button){await rollPool(this.actor);}
 static async usePPAction(event,button){await usePlotPoint(this.actor);}
 static async ppAction(event,button){await adjustPlotPoints(this.actor, Number(button.dataset.delta));}
 _saveScroll(){const sc=this.element?.querySelector('.cfx-scroll');if(sc)this._cfxScroll[this._cfxTab]=sc.scrollTop;}
 async _preRender(context, options) {
  await super._preRender(context, options);
  if (this.rendered) this._saveScroll();
 }
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
function renderSheet(s,actor,tab,editable){
 const parts=[];
 parts.push(`<header class="cfx-identity"><button type="button" class="cfx-pc-portrait" data-action="portrait" aria-label="Change portrait" title="Change portrait" ${editable ? '' : 'disabled'}><img src="${escapeHTML(actor.img)}" alt="Portrait"></button><div class="cfx-identity-fields"><label>Character Name <input name="name" value="${escapeHTML(actor.name)}"></label><label>Concept ${textInput('concept',s.concept,'Druid, warrior, spellblade…')}</label><div class="cfx-pair"><label>Ancestry ${textInput('ancestry',s.ancestry)}</label><label>Background ${textInput('background',s.background)}</label></div></div><div class="cfx-pp"><span>Plot Points</span><div><button type="button" data-action="pp" data-delta="-1">−</button><strong>${s.plotPoints}</strong><button type="button" data-action="pp" data-delta="1">+</button></div><button type="button" data-action="usepp" class="cfx-usepp"><i class="fa-solid fa-coins"></i> Use Plot Point</button><button type="button" class="cfx-primary" data-action="roll"><i class="fa-solid fa-dice"></i> Roll Pool</button></div></header>`);
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
class NpcSheet extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) {
 static DEFAULT_OPTIONS = {
  classes: ['cortex-fantasy', 'sheet', 'cfx-npc'],
  position: {width: 660, height: 640},
  window: {resizable: true},
  actions: {
   roll: NpcSheet.roll,
   pp: FantasySheet.ppAction,
   usepp: FantasySheet.usePPAction,
   portrait: NpcSheet.pickPortrait,
   addTrait: NpcSheet.addTrait,
   removeTrait: NpcSheet.removeTrait,
   mobDice: NpcSheet.changeMobDice
  }
 };
 static PARTS = {sheet: {template: `systems/${ID}/templates/actor.hbs`}};

 _scrollByType = {};
 _pendingUpdate = Promise.resolve();

 async _prepareContext(options) {
  const context = await super._prepareContext(options);
  return {...context, content: renderNpcSheet(this.actor, this.isEditable)};
 }

 async _preRender(context, options) {
  await super._preRender(context, options);
  if (this.rendered) this._saveScroll();
 }

 _saveScroll() {
  const scroll = this.element?.querySelector('.cfx-scroll');
  if (scroll) this._scrollByType[scroll.dataset.npcType] = scroll.scrollTop;
 }

 _onRender(context, options) {
  super._onRender(context, options);
  const scroll = this.element.querySelector('.cfx-scroll');
  scroll.scrollTop = this._scrollByType[scroll.dataset.npcType] ?? 0;
  this.element.querySelector('.cfx-root').addEventListener('change', event => {
   const input = event.target;
   if (!this.isEditable || !input.name) return;
   if (input.name === 'system.npcType') this._showType(input.value);
   const value = input.matches('[data-number]') ? Number(input.value) : input.value;
   if (input.dataset.trait !== undefined) {
    const {trait, field} = input.dataset;
    this._editTraits(traits => {
     const row = traits.find(row => row.id === trait);
     if (row) row[field] = value;
    });
   } else {
    this._updateNpc(() => ({[input.name]: value}));
   }
  });
 }

 _showType(type) {
  this._saveScroll();
  const scroll = this.element.querySelector('.cfx-scroll');
  scroll.dataset.npcType = type;
  for (const section of this.element.querySelectorAll('[data-npc-only]')) {
   section.hidden = section.dataset.npcOnly !== type;
  }
  scroll.scrollTop = this._scrollByType[type] ?? this._scrollByType[this.actor.system.npcType] ?? 0;
 }

 _updateNpc(getChanges) {
  this._pendingUpdate = this._pendingUpdate.then(async () => {
   if (!this.isEditable) return;
   if (!await this.actor.update(getChanges())) throw new Error('Actor update was cancelled');
  }).catch(error => {
   console.error('Cortex Fantasy | NPC update failed', error);
   ui.notifications.error('Could not save the NPC change.');
   if (this.rendered) this.render();
  });
  return this._pendingUpdate;
 }

 _editTraits(edit) {
  return this._updateNpc(() => {
   const traits = this.actor.system.npcTraits.map(trait => ({...trait}));
   edit(traits);
   return {'system.npcTraits': traits};
  });
 }

 static async roll() {
  await this._pendingUpdate;
  return rollPool(this.actor);
 }

 static pickPortrait() {
  if (!this.isEditable) return;
  return openPortraitPicker(this.actor, img => this._updateNpc(() => ({img})));
 }

 static addTrait() {
  return this._editTraits(traits => traits.push({id: foundry.utils.randomID(), name: '', rating: 6}));
 }

 static removeTrait(event, button) {
  return this._editTraits(traits => {
   const index = traits.findIndex(row => row.id === button.dataset.traitId);
   if (index >= 0) traits.splice(index, 1);
  });
 }

 static changeMobDice(event, button) {
  const delta = Number(button.dataset.delta);
  return this._updateNpc(() => ({
   'system.mobCount': Math.min(MAX_MOB_DICE, Math.max(0, this.actor.system.mobCount + delta))
  }));
 }
}

function renderNpcSheet(actor, editable) {
 const s = actor.system;
 const disabled = editable ? '' : 'disabled';
 const typeOptions = NPC_TYPES.map(type =>
  `<option value="${type}" ${s.npcType === type ? 'selected' : ''}>${cap(type)}</option>`
 ).join('');
 const ratedRows = (group, label) => Object.entries(s[group]).map(([key, row], index) => `
  <div class="cfx-traitline">
   ${textInput(`${group}.${key}.name`, row.name, `${label} ${index + 1}`)}
   <select name="system.${group}.${key}.rating" data-number aria-label="${label} ${index + 1} rating">${opts(row.rating)}</select>
  </div>`).join('');
 const tracks = group => Object.entries(s[group]).map(([key, value]) => `
  <label class="cfx-rating"><span>${cap(key)}</span>
   ${dieSelect(`${group}.${key}`, value, 'data-number')}
  </label>`).join('');
 const traits = s.npcTraits.map((row, index) => `
  <div class="cfx-npc-trait">
   <input name="trait-${index}-name" data-trait="${escapeHTML(row.id)}" data-field="name" value="${escapeHTML(row.name)}"
    aria-label="Trait ${index + 1} name" placeholder="Trait name">
   <select name="trait-${index}-rating" data-trait="${escapeHTML(row.id)}" data-field="rating" data-number
    aria-label="Trait ${index + 1} rating">${opts(row.rating, {includeZero: false})}</select>
   <button type="button" data-action="removeTrait" data-trait-id="${escapeHTML(row.id)}" aria-label="Remove trait ${index + 1}">−</button>
  </div>`).join('');
 const abilities = Object.entries(s.abilities).map(([key, row], index) => `
  <div class="cfx-ability">
   ${textInput(`abilities.${key}.name`, row.name, `Ability ${index + 1}`)}
   ${area(`abilities.${key}.description`, row.description, 'Ability description')}
  </div>`).join('');
 return `
  <header class="cfx-npc-header">
   <button type="button" class="cfx-npc-portrait" data-action="portrait" aria-label="Change portrait" title="Change portrait" ${disabled}>
    <img src="${escapeHTML(actor.img)}" alt="NPC portrait">
   </button>
   <label>Name <input name="name" value="${escapeHTML(actor.name)}" ${disabled}></label>
   <label>NPC Type <select name="system.npcType" ${disabled}>${typeOptions}</select></label>
   <button type="button" class="cfx-primary" data-action="roll">Roll Pool</button>
  </header>
  <div class="cfx-scroll" data-npc-type="${s.npcType}">
   <fieldset class="cfx-npc-fields" ${disabled}>
    <section class="cfx-panel"><label>Description ${area('notes', s.notes)}</label></section>
    <section class="cfx-panel" data-npc-only="mob" ${s.npcType === 'mob' ? '' : 'hidden'}>
     <h2>Mob Pool</h2>
     <div class="cfx-npc-mob">
      <label>Die rating <select name="system.mobDie" data-number>${opts(s.mobDie, {includeZero: false})}</select></label>
      <label>Remaining dice <input type="number" name="system.mobCount" min="0" max="${MAX_MOB_DICE}" step="1" value="${s.mobCount}" data-number></label>
      <button type="button" data-action="mobDice" data-delta="-1" ${s.mobCount === 0 ? 'disabled' : ''}>Remove die</button>
      <button type="button" data-action="mobDice" data-delta="1" ${s.mobCount === MAX_MOB_DICE ? 'disabled' : ''}>Add die</button>
     </div>
     <p class="cfx-hint">${s.mobCount ? `The mob rolls ${s.mobCount}d${s.mobDie} plus any selected traits or assets.` : 'The mob is taken out.'}</p>
    </section>
    <section class="cfx-panel"><h2>Rated Traits</h2>${traits}
     <button type="button" data-action="addTrait">Add trait</button>
    </section>
    <div class="cfx-columns">
     <section class="cfx-panel"><h2>Assets</h2>${ratedRows('assets', 'Asset')}</section>
     <section class="cfx-panel"><h2>Complications</h2>${ratedRows('complications', 'Complication')}</section>
    </div>
    <div data-npc-only="major" ${s.npcType === 'major' ? '' : 'hidden'}>
     <section class="cfx-panel"><h2>Plot Points</h2>
      <div class="cfx-npc-pp">
       <button type="button" data-action="pp" data-delta="-1" aria-label="Remove Plot Point">−</button>
       <strong>${s.plotPoints}</strong>
       <button type="button" data-action="pp" data-delta="1" aria-label="Add Plot Point">+</button>
       <button type="button" data-action="usepp">Use Plot Point</button>
      </div>
     </section>
     <div class="cfx-columns">
      <section class="cfx-panel"><h2>Stress</h2>${tracks('stress')}</section>
      <section class="cfx-panel"><h2>Trauma</h2>${tracks('trauma')}</section>
     </div>
     <section class="cfx-panel"><h2>Abilities</h2><div class="cfx-abilities">${abilities}</div></section>
    </div>
   </fieldset>
  </div>`;
}

Hooks.on('preCreateActor',(actor,data)=>{if(data.type==='character')actor.updateSource({'prototypeToken.actorLink':true});});
Hooks.once('init',()=>{
 CONFIG.Actor.documentClass=FantasyActor;
 CONFIG.Actor.dataModels.character=CharacterData;
 CONFIG.Actor.dataModels.npc=NpcData;
 const config=foundry.applications.apps.DocumentSheetConfig;
 config.registerSheet(foundry.documents.Actor,ID,FantasySheet,{types:['character'],makeDefault:true,label:'Cortex Fantasy Sheet'});
 config.registerSheet(foundry.documents.Actor,ID,NpcSheet,{types:['npc'],makeDefault:true,label:'Cortex Fantasy NPC Sheet'});
 console.log('Cortex Fantasy | v0.1.9 initialized');
});
