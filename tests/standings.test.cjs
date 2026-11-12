const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const icons = fs.readFileSync(path.join(root, 'season2/faction-icons.js'), 'utf8');

function setup(season) {
    const html = fs.readFileSync(path.join(root, season, 'index.html'), 'utf8');
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/init\(\);/, '');
    const tbody = { innerHTML: '' };
    const context = vm.createContext({
        document: {
            querySelector: () => tbody,
            getElementById: () => ({ querySelectorAll: () => [] }),
            addEventListener() {}
        },
        window: { addEventListener() {} }
    });
    vm.runInContext(icons + '\n' + script, context);
    return { run: code => vm.runInContext(code, context), tbody, html };
}

for (const season of ['season2', 'season2-simulation']) {
    test(`${season}: six columns, winning and active icons, unique played races and finished-only points`, () => {
        const { run, tbody, html } = setup(season);
        const header = html.match(/<table id="standings-table">([\s\S]*?)<\/thead>/)[1];
        assert.equal((header.match(/<th[ >]/g) || []).length, 6);
        assert.match(header, /Started Games/);
        assert.match(header, /Races Played/);
        run(`
            playersData = [{player_name: 'Alice'}, {player_name: 'Bob'}];
            gamesData = [
                {player_name:'Alice', status:'finished', race:'Arborec', winner:'true', totalPts:15, vp:10},
                {player_name:'Alice', status:'finished', race:'Arborec', winner:'true', totalPts:15, vp:10},
                {player_name:'Alice', status:'ongoing', race:'Nomad', totalPts:8, vp:4},
                {player_name:'Alice', status:'scheduled', race:'Winnu', totalPts:0, vp:0},
                {player_name:'Alice', status:'abandoned', race:'Crimson', totalPts:0, vp:0}
            ];
            renderStandings();
        `);
        assert.doesNotMatch(tbody.innerHTML, /⭐/u);
        assert.equal((tbody.innerHTML.match(/<img /g) || []).length, 5);
        assert.equal((tbody.innerHTML.match(/role="tooltip">Won: Arborec/g) || []).length, 2);
        assert.equal((tbody.innerHTML.match(/role="tooltip">Playing: Nomad/g) || []).length, 1);
        assert.match(tbody.innerHTML, /role="tooltip">Arborec/);
        assert.match(tbody.innerHTML, /role="tooltip">Nomad/);
        assert.doesNotMatch(tbody.innerHTML, /Winnu|Crimson/);
        assert.match(tbody.innerHTML, /class="num">30<\/td>/);
        assert.match(tbody.innerHTML, /Bob/);
        assert.equal(run('renderStandings._sortKey'), 'totalPts');
    });

    test(`${season}: active race icons retain duplicate games and show unassigned races explicitly`, () => {
        const { run } = setup(season);
        const result = run(`standingsParticipation([
            {player_name:'Alice', status:'ongoing', race:'Nomad', game_id:'G01'},
            {player_name:'Alice', status:'ongoing', race:'Nomad', game_id:'G02'},
            {player_name:'Alice', status:'ongoing', race:'', game_id:'G03'},
            {player_name:'Bob', status:'ongoing', race:'Arborec', game_id:'G04'}
        ], 'Alice')`);
        assert.equal(result.startedGames, 3);
        assert.equal(result.activeRaces.length, 3);
        const rendered = run(`renderFactionIcons(${JSON.stringify(result.activeRaces)}, 'Playing')`);
        assert.equal((rendered.match(/<img /g) || []).length, 2);
        assert.match(rendered, /Playing: Nomad - G01/);
        assert.match(rendered, /Playing: Nomad - G02/);
        assert.match(rendered, /Race TBD - G03/);
    });
}

test('all 30 mapped faction assets exist and have PNG signatures', () => {
    const context = vm.createContext({});
    vm.runInContext(icons, context);
    const names = vm.runInContext('Object.values(FACTION_ICONS)', context);
    assert.equal(names.length, 30);
    for (const name of names) {
        const buffer = fs.readFileSync(path.join(root, 'assets/factions', name + '.png'));
        assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    }
});
