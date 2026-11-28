const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Actor {
 get sheet() { return this.ownSheet; }
}
class Sheet {
 async _preRender() {}
}
let dialogs, outcomes, evaluations, animations, events, formula;
let nextId = 0;
let initialize;
const registeredSheets = [];
class Field { constructor(options) { this.options = options; } }
class ArrayField extends Field { constructor(element, options) { super(options); this.element = element; } }
const ctx = vm.createContext({
 foundry: {
  documents: {Actor},
  data: {fields: {ArrayField, NumberField: Field, StringField: Field, SchemaField: Field}},
  utils: {randomID: () => String(++nextId)},
  abstract: {TypeDataModel: class {}},
  applications: {apps: {DocumentSheetConfig: {registerSheet(document, system, sheet, options) {
   registeredSheets.push({sheet, options});
  }}}, api: {
   HandlebarsApplicationMixin: x => x,
   DialogV2: {wait: data => dialogs.shift()(data)}
  }, sheets: {ActorSheetV2: Sheet}}
 },
 Hooks: {on() {}, once(name, callback) { if (name === "init") initialize = callback; }},
 CONFIG: {Actor: {dataModels: {}}},
 game: {dice3d: {showForRoll() {animations++;}}, settings: {get() {}}},
 Roll: class {
  constructor(expression) { formula = this.formula = expression; }
  evaluate() {
   evaluations++;
   this.dice = this.formula.split('+').map((term, i) => ({
    faces: Number(term.slice(2)), results: [{result: outcomes[i]}]
   }));
   return this;
  }
 },
 ChatMessage: {
  getSpeaker() {},
  create(data) { events.push(data.content); assert.equal(data.rolls, undefined); }
 },
 CONST: {CHAT_MESSAGE_STYLES: {OTHER: 0}},
 ui: {notifications: {warn() {}, error() {}}},
 console: {error() {}, log() {}}
});
const {rollPool, adjustPlotPoints, usePlotPoint, FantasyActor, FantasySheet, CharacterData, NpcData, NpcSheet, renderNpcSheet, makePoolOptions} = vm.runInContext(
 fs.readFileSync(path.join(__dirname, '../scripts/main.mjs'), 'utf8') + '\n({rollPool, adjustPlotPoints, usePlotPoint, FantasyActor, FantasySheet, CharacterData, NpcData, NpcSheet, renderNpcSheet, makePoolOptions})', ctx
);

function actor(pp) {
 return {
  name: 'PC', system: {plotPoints: pp, attributes: {might: 6, vigor: 6}, skills: {},
   distinctions: {first: {name: 'Hinder me', rating: 6}}, specialties: {
    a: {name: 'First', rating: 6}, b: {name: 'Second', rating: 6}
   }, assets: {}},
  async update(data) {
   events.push('update');
   this.system.plotPoints = data['system.plotPoints'];
   return this;
  }
 };
}

function builder(indices, hinder = [], extra = 0) {
 return {
  querySelectorAll(selector) {
   return selector.includes('poolopt')
     ? indices.map(value => ({value}))
     : hinder.map(index => ({dataset: {index}}));
  },
  querySelector(selector) { return {value: selector === '#cfx-extra' ? 6 : extra}; }
 };
}
function confirmation(data, roles, buyTotal = false, buyEffect = false) {
 const markup = [...data.content.matchAll(/data-index="(\d+)" value="([^"]+)" checked/g)];
 assert.match(data.content, /<th>Assignment<\/th>/);
 assert.match(data.content, /data-summary="extraTotal"/);
 const selects = markup.map(([, index, role]) => ({
  dataset: {index}, value: roles?.[index] ?? role
 }));
 const output = new Map();
 let refresh;
 const button = {};
 const feedback = {classList: {toggle() {}}};
 const summary = {querySelector(key) {
  if (!output.has(key)) output.set(key, {});
  return output.get(key);
 }};
 const element = {
  addEventListener(event, handler) { if (event === 'change') refresh = handler; },
  querySelectorAll() {return selects;},
  querySelector(selector) {
   if (selector === '.cfx-roll-summary') return summary;
   if (selector === '#cfx-roll-validation') return feedback;
   if (selector.startsWith('button')) return button;
   return {checked: selector === '#cfx-extra-total' ? buyTotal : buyEffect};
  }
 };
 data.render(null, {element});
 const result = data.buttons[0].callback(null, null, {element});
 if (result) {
  assert.equal(output.get('[data-summary="total"]').textContent, result.total);
  assert.equal(output.get('[data-summary="effect"]').textContent, 'd'+result.faces);
  assert.equal(output.get('[data-summary="spent"]').textContent, result.spent);
  const kept = selects.find(select => select.value === 'total');
  if (kept) {
   const value = kept.value;
   kept.value = 'unused';
   refresh();
   assert.ok(output.get('[data-summary="total"]').textContent < result.total);
   assert.equal(button.disabled, true);
   kept.value = value;
   refresh();
   assert.equal(button.disabled, false);
  }
 }
 return result;

}
async function roll(values, {pp = 0, hinder = false, roles, third = false, second = false, fail = false, cancel = false} = {}) {
 outcomes = values;
 events = [];
 evaluations = animations = 0;
 const pc = actor(pp);
 if (fail) pc.update = async () => { throw new Error('mock update failure'); };
 dialogs = [
  data => data.buttons[0].callback(null, null, {element: builder(hinder ? [0, 1, 2] : [0, 1], hinder ? [2] : [], values.length - 2)}),
  data => cancel ? null : confirmation(data, roles, third, second)
 ];
 await rollPool(pc);
 assert.equal(evaluations, 1);
 assert.equal(animations, 1);
 return pc;
}
(async () => {
 initialize();
 assert.equal(registeredSheets.find(entry => entry.options.types.includes('character')).sheet, FantasySheet);
 assert.equal(registeredSheets.find(entry => entry.options.types.includes('npc')).sheet, NpcSheet);
 assert.equal(ctx.CONFIG.Actor.dataModels.character, CharacterData);
 assert.equal(ctx.CONFIG.Actor.dataModels.npc, NpcData);
 await roll([1, 1]);
 assert.match(events[0], /Total <b>0<\/b> · Effect <b>d4.*Hitch/);
 await roll([1, 5]);
 assert.match(events[0], /Total <b>5<\/b> · Effect <b>d4/);
 await roll([4, 5, 6]);
 assert.match(events[0], /Total <b>11<\/b> · Effect <b>d6/);
 let pc = await roll([1, 1], {hinder: true});
 assert.equal(pc.system.plotPoints, 1);
 assert.equal(events[0], 'update');
 assert.match(events[1], /Hindered/);
 pc = await roll([4, 5, 6], {hinder: true, third: true, roles: ['total', 'total', 'total2']});
 assert.equal(pc.system.plotPoints, 0);
 assert.deepEqual(events, []);
 await roll([4, 5, 6, 3, 2], {pp: 2, third: true, second: true, roles: ['total', 'total', 'total2', 'effect', 'effect2']});
 assert.equal(events[0], 'update');
 assert.match(events[1], /Total <b>15<\/b> · Effect <b>d6 \+ d6/);
 await roll([2, 3], {hinder: true, fail: true});
 assert.deepEqual(events, []);
 await roll([2, 3], {hinder: true, cancel: true});
 assert.deepEqual(events, []);

 dialogs = [data => {
  const el = builder([0, 3, 4]);
  const button = {};
  const feedback = {classList: {toggle() {}}};
  el.querySelector = selector => selector.startsWith('button') ? button
   : selector === '.cfx-validation' ? feedback
   : {value: 0};
  el.addEventListener = () => {};
  data.render(null, {element: el});
  assert.equal(button.disabled, true);
  assert.match(feedback.textContent, /only one Specialty/);
  return data.buttons[0].callback(null, null, {element: el});
 }];
 await rollPool(actor(1));

 events = [];
 pc = actor(1);
 dialogs = [() => ({use: 'asset', details: ''})];
 await usePlotPoint(pc);
 assert.equal(events[0], 'update');
 assert.match(events[1], /spent 1 Plot Point/);
 events = [];
 pc = actor(1);
 pc.update = async () => undefined;
 dialogs = [() => ({use: 'asset', details: ''})];
 await usePlotPoint(pc);
 assert.deepEqual(events, []);
 pc = actor(1);
 assert.deepEqual(await Promise.all([adjustPlotPoints(pc, -1, 1), adjustPlotPoints(pc, -1, 1)]), [true, false]);
 assert.equal(pc.system.plotPoints, 0);

 const synthetic = new FantasyActor();
 synthetic.isToken = true;
 synthetic.ownSheet = 'token';
 synthetic.token = {baseActor: {type: 'character', sheet: 'world'}};
 assert.equal(synthetic.sheet, 'world');
 synthetic.token.baseActor.type = 'npc';
 assert.equal(synthetic.sheet, 'token');
 const sheet = new FantasySheet();
 sheet.rendered = true;
 sheet.element = {querySelector: () => ({scrollTop: 173})};
 await sheet._preRender();
 assert.equal(sheet._cfxScroll.traits, 173);
 const legacy = CharacterData.defineSchema(), npcSchema = NpcData.defineSchema();
 for (const key of Object.keys(legacy)) assert.deepEqual(npcSchema[key], legacy[key]);
 assert.equal(npcSchema.npcType.options.initial, 'minor');

 const npc = actor(2);
 npc.type = 'npc';
 npc.system = {...npc.system, npcType: 'minor', mobDie: 8, mobCount: 3,
  npcTraits: [{id: 'legacy', name: '<Guard>', rating: 6}], complications: {}, abilities: {}, stress: {}, trauma: {}};
 npc.update = async function(data) {
  for (const [key, value] of Object.entries(data)) this.system[key.split('.')[1]] = value;
  return this;
 };
 assert.match(renderNpcSheet(npc, true), /&lt;Guard&gt;/);
 assert.match(renderNpcSheet(npc, true), /data-npc-only="major" hidden/);
 npc.system.npcType = 'major';
 assert.doesNotMatch(renderNpcSheet(npc, true), /data-npc-only="major" hidden/);
 assert.equal(makePoolOptions(npc)[0].faces, 6);

 const npcSheet = new NpcSheet();
 npcSheet.actor = npc;
 npcSheet.isEditable = true;
 await NpcSheet.addTrait.call(npcSheet);
 assert.equal(npc.system.npcTraits.length, 2);
 await NpcSheet.removeTrait.call(npcSheet, null, {dataset: {traitId: 'legacy'}});
 assert.equal(npc.system.npcTraits.length, 1);
 npc.system.npcType = 'mob';
 npc.system.npcTraits[0].name = 'Guard';
 outcomes = [5, 1, 4, 7];
 events = [];
 evaluations = animations = 0;
 dialogs = [
  data => data.buttons[0].callback(null, null, {element: builder([0])}),
  data => confirmation(data)
 ];
 await rollPool(npc);
 assert.equal(formula, '1d6+1d8+1d8+1d8');
 assert.equal(evaluations, 1);
 assert.equal(animations, 1);
 assert.match(events[0], /Total <b>12<\/b> · Effect <b>d8/);
 await NpcSheet.changeMobDice.call(npcSheet, null, {dataset: {delta: '-1'}});
 assert.equal(npc.system.mobCount, 2);
 npc.system.mobCount = 1;
 outcomes = [4];
 events = [];
 dialogs = [data => data.buttons[0].callback(null, null, {element: builder([])}), data => confirmation(data)];
 await rollPool(npc);
 assert.equal(formula, '1d8');
 assert.match(events[0], /Total <b>4<\/b> · Effect <b>d4/);
 await NpcSheet.changeMobDice.call(npcSheet, null, {dataset: {delta: '-1'}});
 const evaluatedBefore = evaluations;
 await rollPool(npc);
 assert.equal(evaluations, evaluatedBefore);
 await NpcSheet.changeMobDice.call(npcSheet, null, {dataset: {delta: '1'}});
 assert.equal(npc.system.mobCount, 1);

 const scroll = {scrollTop: 123, dataset: {npcType: 'minor'}};
 const majorSection = {dataset: {npcOnly: 'major'}};
 const mobSection = {dataset: {npcOnly: 'mob'}};
 npcSheet.element = {querySelector: () => scroll, querySelectorAll: () => [majorSection, mobSection]};
 npcSheet._showType('major');
 assert.equal(majorSection.hidden, false);
 assert.equal(mobSection.hidden, true);
 scroll.scrollTop = 69;
 npcSheet._showType('minor');
 assert.equal(scroll.scrollTop, 123);
 npcSheet._showType('major');
 assert.equal(scroll.scrollTop, 69);
 console.log('Mocked NPC, mob, PC regression, Plot Point, token routing, and scroll checks passed');
})().catch(error => {console.error(error); process.exitCode = 1;});
