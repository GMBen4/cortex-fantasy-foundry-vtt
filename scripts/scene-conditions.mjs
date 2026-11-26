export const SYSTEM_ID = 'cortex-fantasy';
const FLAG = 'sceneConditions';
const FLAG_PATH = `flags.${SYSTEM_ID}.${FLAG}`;
const RATINGS = [4, 6, 8, 10, 12];

export function getActiveSceneConditions() {
 const scene = game.scenes.active;
 if (!scene || (!game.user.isGM && !scene.isView)) return {scene: null, conditions: []};
 const stored = scene.getFlag(SYSTEM_ID, FLAG) ?? {};
 const conditions = Object.entries(stored)
  .filter(([, condition]) => typeof condition?.name === 'string' && RATINGS.includes(condition.rating))
  .map(([id, {name, rating}]) => ({id, name, rating}));
 return {scene, conditions};
}

class SceneConditions extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
 static DEFAULT_OPTIONS = {
  id: 'cortex-fantasy-scene-conditions',
  classes: ['cortex-fantasy', 'cfx-scene-conditions'],
  window: {title: 'Scene Conditions', resizable: true},
  position: {width: 390, height: 320},
  actions: {addCondition: SceneConditions.add, removeCondition: SceneConditions.remove}
 };
 static PARTS = {
  conditions: {template: `systems/${SYSTEM_ID}/templates/scene-conditions.hbs`, scrollable: ['.cfx-condition-list']}
 };

 async _prepareContext() {
  const {scene, conditions} = getActiveSceneConditions();
  this._sceneId = scene?.id;
  return {
   sceneId: this._sceneId,
   editable: Boolean(scene && game.user.isGM),
   conditions: conditions.map(condition => ({
    ...condition,
    ratings: RATINGS.map(rating => ({rating, selected: rating === condition.rating}))
   }))
  };
 }

 _onRender(context, options) {
  super._onRender(context, options);
  this.element.querySelector('.cfx-condition-list').onchange = event => {
   const input = event.target;
   const row = input.closest('[data-condition-id]');
   const scene = this._sceneForEdit();
   if (!scene || !row) return;
   const {conditionId} = row.dataset;
   if (!Object.hasOwn(scene.getFlag(SYSTEM_ID, FLAG) ?? {}, conditionId)) return;
   const path = `${FLAG_PATH}.${conditionId}`;
   if (input.name === 'rating' && RATINGS.includes(Number(input.value))) {
    return this._save(scene, {[path + '.rating']: Number(input.value)});
   }
   if (input.name === 'name') {
    const name = input.value.trim();
    if (!name) {
     input.value = scene.getFlag(SYSTEM_ID, FLAG)[conditionId].name;
     return;
    }
    return this._save(scene, {[path + '.name']: name});
   }
  };
 }

 _sceneForEdit() {
  const scene = game.scenes.active;
  return game.user.isGM && scene?.id === this._sceneId ? scene : null;
 }

 async _save(scene, changes) {
  try {
   await scene.update(changes);
  } catch (error) {
   console.error('Cortex Fantasy | Scene condition update failed', error);
   ui.notifications.error('Could not save Scene Conditions.');
   if (this.rendered) this.render();
  }
 }

 static add() {
  const scene = this._sceneForEdit();
  if (!scene) return;
  const id = foundry.utils.randomID();
  return this._save(scene, {[`${FLAG_PATH}.${id}`]: {name: 'New Condition', rating: 6}});
 }

 static remove(event, button) {
  const scene = this._sceneForEdit();
  const id = button.closest('[data-condition-id]')?.dataset.conditionId;
  if (!scene || !Object.hasOwn(scene.getFlag(SYSTEM_ID, FLAG) ?? {}, id)) return;
  return this._save(scene, {[`${FLAG_PATH}.-=${id}`]: null});
 }
}

let windowInstance;
function openSceneConditions() {
 windowInstance ??= new SceneConditions();
 windowInstance.render({force: true});
}

export function registerSceneConditions() {
 game.keybindings.register(SYSTEM_ID, 'sceneConditions', {
  name: 'Open Scene Conditions',
  editable: [{key: 'KeyC', modifiers: ['Alt', 'Shift']}],
  onDown: () => {
   openSceneConditions();
   return true;
  }
 });
}

Hooks.on('getSceneControlButtons', controls => {
 if (!game.user.isGM || !controls.tokens) return;
 controls.tokens.tools.cortexSceneConditions = {
  name: 'cortexSceneConditions',
  title: 'Scene Conditions',
  icon: 'fa-solid fa-cloud',
  order: Object.keys(controls.tokens.tools).length,
  button: true,
  onChange: openSceneConditions
 };
});

function refreshConditions() {
 if (windowInstance?.rendered) windowInstance.render();
}

Hooks.on('canvasReady', refreshConditions);
Hooks.on('deleteScene', refreshConditions);
Hooks.on('updateScene', (scene, changes) => {
 if ('active' in changes || scene.id === game.scenes.active?.id) refreshConditions();
});
