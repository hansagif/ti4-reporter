const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../season2/admin.js'), 'utf8');

function setup(season = 'season2') {
    const elements = new Map();
    const document = {
        body: { dataset: { season } },
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, { value: '', checked: false, addEventListener() {} });
            return elements.get(id);
        }
    };
    const context = vm.createContext({ document, location: { hostname: '127.0.0.1' }, sessionStorage: { getItem: () => null } });
    vm.runInContext(source, context);
    const run = script => vm.runInContext(script, context);
    const set = (id, value) => { document.getElementById(id).value = String(value); };
    run(`
        gamesData = Array.from({length: 6}, (_, i) => ({
            game_id: 'G01', game_name: 'Meciul 1', player_name: 'Player ' + i,
            status: 'scheduled', race: '', pick_order: '', speaker: '',
            ranking: '', winner: 'false', victory_points: '', duration_days: ''
        }));
        selectedPicks = RACES.slice(0, 6);
        selectedBans = RACES.slice(6, 12);
    `);
    set('game-status', 'ongoing');
    set('duration', '14.5');
    const races = run('selectedPicks.slice()');
    for (let i = 0; i < 6; i++) {
        for (const [field, value] of Object.entries({
            race: races[i], seat: i + 1, turns: 30 + i, timer: '02:15',
            vp: 10 - i, rank: i + 1
        })) set(`${field}-${i}`, value);
    }
    return { run, set, document };
}

test('finished report persists draft, seats, turn metrics, VP and winner', () => {
    const { run } = setup();
    const { rows, bans } = run("readUpdate('G01', 'finish')");
    assert.equal(rows.length, 6);
    assert.equal(bans.length, 6);
    assert.equal(rows[0].status, 'finished');
    assert.equal(rows[0].winner, 'true');
    assert.equal(rows[1].winner, 'false');
    assert.equal(rows[0].avg_turn_minutes, '135');
    assert.equal(rows[0].duration_days, '14.5');
    assert.equal(rows[5].starting_position, '6');
    assert.equal(rows[5].turns, '35');
    assert.equal(rows[5].pick_order, '6');
    assert.equal(rows[0].draft_races.split('|').length, 6);
});

test('partial update saves draft independently of player assignments', () => {
    const { run, set } = setup();
    set('race-0', '');
    set('turns-0', '');
    set('timer-0', '');
    set('rank-0', '');
    set('duration', '');
    const { rows } = run("readUpdate('G01', 'update')");
    assert.equal(rows[0].race, '');
    assert.equal(rows[0].pick_order, '');
    assert.equal(rows[0].draft_races.split('|').length, 6);
    assert.equal(rows[0].avg_turn_minutes, '');
    assert.equal(rows[0].winner, 'false');
});

test('empty scheduled games can be updated without invented results', () => {
    const { run, set } = setup();
    run('selectedBans = []; selectedPicks = [];');
    set('game-status', 'scheduled');
    set('duration', '');
    for (let i = 0; i < 6; i++) {
        for (const key of ['race', 'seat', 'turns', 'timer', 'vp', 'rank']) set(`${key}-${i}`, '');
    }
    assert.equal(run("readUpdate('G01', 'update').rows[0].status"), 'scheduled');
});

for (const [label, change, expected] of [
    ['unconfirmed bans', s => s.run('bansConfirmed = false'), /Confirm/],
    ['unconfirmed picks', s => s.run('picksConfirmed = false'), /Confirm/],
    ['seventh ban', s => s.run('selectedBans.push(RACES[12])'), /at most six/],
    ['incomplete draft', s => s.run('selectedPicks.pop()'), /six picks/],
    ['duplicate race', s => s.set('race-1', s.run('selectedPicks[0]')), /Races must be unique/],
    ['duplicate seat', s => s.set('seat-1', 1), /Starting positions must be unique/],
    ['duplicate rank', s => s.set('rank-1', 1), /Ranks must be unique/],
    ['invalid seat', s => s.set('seat-0', 7), /Starting position/],
    ['negative turns', s => s.set('turns-0', -1), /Turns/],
    ['fractional turns', s => s.set('turns-0', 2.5), /Turns/],
    ['invalid minutes', s => s.set('timer-0', '01:60'), /hh:mm/],
    ['half-filled timer', s => s.set('timer-0', '01:'), /hh:mm/],
    ['missing timer', s => s.set('timer-0', ''), /Complete every player/],
    ['missing duration', s => s.set('duration', ''), /duration/],
    ['negative duration', s => s.set('duration', -1), /Duration/],
    ['overlapping bans and picks', s => s.run('selectedBans[0] = selectedPicks[0]'), /cannot be banned|only once/],
    ['multiple speakers', s => { s.document.getElementById('speaker-0').checked = true; s.document.getElementById('speaker-1').checked = true; }, /at most one speaker/]
]) {
    test(`rejects ${label}`, () => {
        const state = setup();
        change(state);
        assert.throws(() => state.run("readUpdate('G01', 'finish')"), expected);
    });
}

test('zero bans and zero-valued player metrics are valid', () => {
    const { run, set } = setup();
    run('selectedBans = []');
    set('turns-0', 0);
    set('timer-0', '00:00');
    set('vp-0', 0);
    assert.equal(run("readUpdate('G01', 'finish').rows[0].avg_turn_minutes"), '0');
});

test('race assignment can be saved before drafting and hh:mm supports long turns', () => {
    const { run, set } = setup();
    run('selectedPicks = [];');
    set('timer-0', '26:05');
    const { rows } = run("readUpdate('G01', 'update')");
    assert.notEqual(rows[0].race, '');
    assert.equal(rows[0].pick_order, '');
    assert.equal(rows[0].avg_turn_minutes, '1565');
});

test('reporting preserves historical not-picked records without an input field', () => {
    const { run } = setup();
    run("bansData = [{game_id: 'G01', race: RACES[12], type: 'not_picked'}]");
    const { bans } = run("readUpdate('G01', 'finish')");
    assert.equal(bans.filter(row => row.type === 'banned').length, 6);
    assert.equal(bans.filter(row => row.type === 'not_picked').length, 1);
});

test('reopen retains results and metrics but clears winner and finished status', () => {
    const { run } = setup();
    run("gamesData = readUpdate('G01', 'finish').rows");
    assert.throws(() => run("readUpdate('G01', 'update')"), /Reopen/);
    const { rows } = run("readUpdate('G01', 'reopen')");
    assert.equal(rows[0].status, 'ongoing');
    assert.equal(rows[0].winner, 'false');
    assert.equal(rows[0].ranking, '1');
    assert.equal(rows[0].avg_turn_minutes, '135');
    run('gamesData = ' + JSON.stringify(rows));
    assert.equal(run("readUpdate('G01', 'finish').rows[0].winner"), 'true');
});

test('simulation and real admin use separate whitelisted data paths', () => {
    assert.equal(setup().run('DATA_PATH'), 'season2/data');
    assert.equal(setup('season2-simulation').run('DATA_PATH'), 'season2-simulation/data');
    assert.throws(() => setup('season1'), /Unsupported/);
});

test('local read and write requests never use GitHub or token headers', async () => {
    const { run } = setup();
    run(`
        localMode = true;
        token = 'must-not-be-sent';
        globalThis.requests = [];
        globalThis.fetch = async (url, options) => {
            requests.push({url, options});
            return {ok: true, json: async () => ({sha: 'test'})};
        };
    `);
    await run("ghGet('season2/data/games.csv')");
    await run("ghPut('season2/data/games.csv', 'csv', 'old-sha', 'update')");
    const requests = JSON.parse(run('JSON.stringify(requests)'));
    assert.equal(requests[0].url, '/api/local-data/season2/data/games.csv');
    assert.equal(requests[1].options.method, 'PUT');
    assert.equal(requests[1].options.headers.Authorization, undefined);
    assert.deepEqual(JSON.parse(requests[1].options.body), { content: 'csv', sha: 'old-sha' });
});

test('static-only servers show an explicit local-server setup error', async () => {
    const { run } = setup();
    run('globalThis.fetch = async () => ({ok: false, status: 501})');
    await assert.rejects(run("localRequest('season2/data/games.csv')"), /python3 serve.py/);
});
