const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
function setup() {
    const container = { innerHTML: '' };
    const context = vm.createContext({ document: { getElementById: () => container } });
    for (const name of ['faction-icons', 'race-preference']) {
        vm.runInContext(fs.readFileSync(path.join(root, `season2/${name}.js`), 'utf8'), context);
    }
    return { run: script => vm.runInContext(script, context), container };
}

test('confirmed draft counted once per game independently of player assignments', () => {
    const { run } = setup();
    const result = run(`getRacePreference([
        ...Array.from({length:6}, () => ({game_id:'G01', status:'ongoing', draft_races:'Arborec|Nomad|Winnu|Crimson|Firmament|Nekro Virus'})),
        {game_id:'G02', status:'finished', race:'Nomad', pick_order:'1'},
        {game_id:'G02', status:'finished', race:'Arborec', pick_order:'6'},
        {game_id:'G03', status:'scheduled', draft_races:'Yin Brotherhood'},
        {game_id:'G04', status:'abandoned', race:'Yin Brotherhood', pick_order:'1'}
    ])`);
    assert.equal(result.drafts, 2);
    assert.equal(result.stats.length, 6);
    assert.equal(result.stats[0].race, 'Nomad');
    assert.equal(result.stats[0].average, 1.5);
    assert.equal(result.stats[0].picks, 2);
    assert.equal(result.stats.find(s => s.race === 'Arborec').average, 3.5);
});

test('missing and invalid legacy picks do not create a draft', () => {
    const { run } = setup();
    assert.equal(run(`getRacePreference([
        {game_id:'G01', status:'ongoing', race:'Arborec', pick_order:''},
        {game_id:'G02', status:'finished', race:'Nomad', pick_order:'7'}
    ]).drafts`), 0);
});

test('render empty state and accessible six-position heatmap', () => {
    const { run, container } = setup();
    run('renderRacePreference([])');
    assert.match(container.innerHTML, /No draft picks recorded/);
    run(`renderRacePreference([{game_id:'G01', status:'ongoing', race:'Arborec', pick_order:'1'}])`);
    assert.match(container.innerHTML, /1 draft recorded/);
    assert.equal((container.innerHTML.match(/class="pick-cell/g) || []).length, 6);
    assert.match(container.innerHTML, /1\.00/);
    assert.match(container.innerHTML, /aria-label="Arborec: 1 picks at position 1"/);
    assert.match(container.innerHTML, /arborec.png/);
});
