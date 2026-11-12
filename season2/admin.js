const REPO = 'hansagif/ti4-reporter';
const BRANCH = 'main';
const SEASON = document.body.dataset.season;
if (!['season2', 'season2-simulation'].includes(SEASON)) throw new Error('Unsupported admin season.');
const DATA_PATH = `${SEASON}/data`;
const RACES = ['Arborec', 'Argent Flight', 'Barony of Letnev', 'Clan of Saar', 'Council Keleres', 'Crimson', 'Deepwrought Scholarate', 'Emirates of Hacan', 'Empyrean', 'Federation of Sol', 'Firmament', 'Ghosts of Creuss', 'L1Z1X Mindnet', 'Mahact Gene-Sorcerers', 'Mentak Coalition', 'Naalu Collective', 'Naaz-Rokha Alliance', 'Nekro Virus', 'Nomad', 'Regal Authority of Ral-Nel', "Sardakk N'orr", 'The Last Bastion', 'Titans of Ul', 'Universities of Jol-Nar', "Vuil'raith Cabal", 'Winnu', 'Xxcha Kingdom', 'Yin Brotherhood', 'Yssaril Tribes', 'Embers of Muaat'].sort();
let token = '', gamesData = [], bansData = [], gamesSHA = '', bansSHA = '';
let loadedGamesSHA = '', loadedBansSHA = '';
let localMode = false;
const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
let selectedBans = [], selectedPicks = [], bansConfirmed = true, picksConfirmed = true, saving = false, reloadRequired = false;
const el = id => document.getElementById(id);
const val = id => el(id).value;
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

function msg(id, type, text) {
    el(id).className = 'msg ' + type;
    el(id).textContent = text;
}
async function ghGet(path) {
    if (localMode) return localRequest(path);
    const response = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}?ref=${BRANCH}&t=${Date.now()}`, {
        headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json' }
    });
    if (!response.ok) throw new Error('GitHub ' + response.status);
    return response.json();
}
async function ghPut(path, content, sha, message) {
    if (localMode) return localRequest(path, { content, sha });
    const response = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
        method: 'PUT',
        headers: { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, content: btoa(unescape(encodeURIComponent(content))), sha, branch: BRANCH })
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'GitHub ' + response.status);
    }
    return response.json();
}
async function localRequest(path, update) {
    const response = await fetch(`/api/local-data/${path}`, update ? {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update)
    } : { cache: 'no-store' });
    if (!response.ok) {
        if (response.status === 404 || response.status === 501) throw new Error('Local saving requires the reporting server. Run python3 serve.py and open its URL.');
        const error = await response.json();
        throw new Error(error.message || `Local server ${response.status}`);
    }
    return response.json();
}
function parseFile(file) {
    const text = decodeURIComponent(escape(atob(file.content.replace(/\n/g, ''))));
    const result = Papa.parse(text.replace(/\r?\n$/, ''), { header: true, skipEmptyLines: true });
    if (result.errors.length) throw new Error('Invalid CSV: ' + result.errors[0].message);
    return result.data;
}
async function loadCSVs() {
    const [games, bans] = await Promise.all([ghGet(`${DATA_PATH}/games.csv`), ghGet(`${DATA_PATH}/bans.csv`)]);
    const parsedGames = parseFile(games), parsedBans = parseFile(bans);
    gamesData = parsedGames;
    bansData = parsedBans;
    gamesSHA = games.sha;
    bansSHA = bans.sha;
}
async function doAuth(useLocal = false) {
    localMode = useLocal === true;
    if (localMode && !isLocalhost) return msg('auth-msg', 'err', 'Local mode is only available on localhost.');
    token = localMode ? '' : val('tok').trim();
    if (!localMode && !token) return msg('auth-msg', 'err', 'Enter a token or connect locally.');
    el('connect').disabled = true;
    el('connect-local').disabled = true;
    msg('auth-msg', 'load', 'Connecting...');
    try {
        await loadCSVs();
        if (!localMode) sessionStorage.setItem('ti4tok', token);
        reloadRequired = false;
        fillSelect();
        el('game-form').hidden = true;
        el('auth-wrap').hidden = true;
        el('app').hidden = false;
        el('connection-mode').textContent = localMode
            ? `LOCAL MODE - saves to ${DATA_PATH} in this checkout only. No GitHub writes.`
            : `GITHUB MODE - saves to ${REPO}, branch ${BRANCH}, ${DATA_PATH}.`;
    } catch (error) {
        msg('auth-msg', 'err', 'Failed: ' + error.message);
    } finally {
        el('connect').disabled = false;
        el('connect-local').disabled = false;
    }
}
function fillSelect(selected = '') {
    const ids = [...new Set(gamesData.map(row => row.game_id))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    el('game-select').innerHTML = '<option value="">-- Select --</option>' + ids.map(id => {
        const game = gamesData.find(row => row.game_id === id);
        return `<option value="${escapeHTML(id)}">${escapeHTML(game.game_name)} (${escapeHTML(game.status)})</option>`;
    }).join('');
    el('game-select').value = selected;
}
function setWorkflow() {
    const finished = val('game-status') === 'finished';
    el('report-fields').disabled = finished || saving || reloadRequired;
    el('save').hidden = finished;
    el('finish').hidden = finished;
    el('reopen').hidden = !finished;
    ['save', 'finish', 'reopen', 'game-select', 'logout'].forEach(id => { el(id).disabled = saving || reloadRequired; });
    el('workflow-status').textContent = finished
        ? 'Finished game. Reopen to edit; reopening removes this game from finished-game standings until finished again.'
        : 'Update saves partial progress. Finish requires confirmed bans, six confirmed picks, player assignments, seats, turns, average turn times, VP, ranks and duration.';
}
function loadGame() {
    const id = val('game-select');
    const rows = gamesData.filter(row => row.game_id === id);
    el('game-form').hidden = !rows.length;
    msg('update-msg', '', '');
    if (!rows.length) return;
    loadedGamesSHA = gamesSHA;
    loadedBansSHA = bansSHA;
    el('game-status').value = rows[0].status;
    el('duration').value = rows[0].duration_days;
    selectedBans = bansData.filter(row => row.game_id === id && row.type === 'banned').map(row => row.race);
    selectedPicks = rows[0].draft_races
        ? rows[0].draft_races.split('|')
        : rows.filter(row => row.race && row.pick_order).sort((a, b) => Number(a.pick_order) - Number(b.pick_order)).map(row => row.race);
    bansConfirmed = true;
    picksConfirmed = true;
    const numberInput = (i, key, label, value, min, max = '') => `<input id="${key}-${i}" aria-label="${escapeHTML(rows[i].player_name)} ${label}" type="number" min="${min}" ${max === '' ? '' : `max="${max}"`} step="1" value="${escapeHTML(value ?? '')}">`;
    el('players').innerHTML = rows.map((row, i) => {
        const minutes = row.avg_turn_minutes;
        return `<tr>
            <td>${escapeHTML(row.player_name)}</td>
            <td><select id="race-${i}" aria-label="${escapeHTML(row.player_name)} race"></select></td>
            <td>${numberInput(i, 'seat', 'starting position', row.starting_position, 1, 6)}</td>
            <td>${numberInput(i, 'turns', 'turns', row.turns, 0)}</td>
            <td><input id="timer-${i}" aria-label="${escapeHTML(row.player_name)} average turn time (hh:mm)" type="text" inputmode="text" pattern="[0-9]+:[0-5][0-9]" placeholder="00:00" title="Hours and two-digit minutes, e.g. 01:30 or 26:05" value="${minutes === '' || minutes == null ? '' : `${String(Math.floor(Number(minutes) / 60)).padStart(2, '0')}:${String(Number(minutes) % 60).padStart(2, '0')}`}"></td>
            <td>${numberInput(i, 'vp', 'VP', row.victory_points, 0, 10)}</td>
            <td>${numberInput(i, 'rank', 'rank', row.ranking === '0' ? '' : row.ranking, 1, 6)}</td>
            <td><input id="speaker-${i}" aria-label="${escapeHTML(row.player_name)} speaker" type="checkbox"${row.speaker === 'true' ? ' checked' : ''}></td>
        </tr>`;
    }).join('');
    renderRaceBoxes();
    syncPlayerRaces(rows.map(row => row.race));
    setWorkflow();
}
function syncPlayerRaces(initial) {
    gamesData.filter(row => row.game_id === val('game-select')).forEach((row, i) => {
        const select = el('race-' + i);
        const current = initial ? initial[i] : select.value;
        const choices = RACES.filter(race => !selectedBans.includes(race) || race === current);
        select.innerHTML = '<option value="">-- Race --</option>' + choices.map(race => `<option value="${escapeHTML(race)}">${escapeHTML(race)}</option>`).join('');
        select.value = current;
    });
}
function renderRaceBoxes() {
    for (const kind of ['ban', 'pick']) {
        const selected = kind === 'ban' ? selectedBans : selectedPicks;
        el(kind + '-boxes').innerHTML = RACES.map(race => {
            const index = selected.indexOf(race);
            const blocked = kind === 'ban' ? selectedPicks.includes(race) : selectedBans.includes(race);
            const disabled = index < 0 && (blocked || selected.length === 6);
            return `<button type="button" class="race-box" data-race="${escapeHTML(race)}" aria-pressed="${index >= 0}"${disabled ? ' disabled' : ''}>${kind === 'pick' && index >= 0 ? `${index + 1}. ` : ''}${escapeHTML(race)}</button>`;
        }).join('');
    }
    el('ban-summary').textContent = `${selectedBans.length}/6 bans - ${bansConfirmed ? 'confirmed' : 'unconfirmed changes'}.`;
    el('pick-summary').textContent = `${selectedPicks.length}/6 picks - ${picksConfirmed ? 'confirmed' : 'unconfirmed changes'}. ${selectedPicks.map((race, i) => `${i + 1}. ${race}`).join(' / ')}`;
    el('confirm-picks').disabled = selectedPicks.length !== 6;
}
function toggleRace(kind, race) {
    const selected = kind === 'ban' ? selectedBans : selectedPicks;
    const index = selected.indexOf(race);
    if (index >= 0) selected.splice(index, 1);
    else selected.push(race);
    if (kind === 'ban') bansConfirmed = false;
    else picksConfirmed = false;
    renderRaceBoxes();
    [...el(kind + '-boxes').querySelectorAll('button')].find(button => button.dataset.race === race).focus();
}
function integer(id, label, min, max = Number.MAX_SAFE_INTEGER) {
    const value = val(id);
    if (value === '') return '';
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`${label} must be an integer from ${min} to ${max}.`);
    return value;
}
function readUpdate(id, action) {
    const existing = gamesData.filter(row => row.game_id === id);
    if (existing.length !== 6) throw new Error('Select an existing six-player game.');
    if (action === 'reopen') {
        if (existing[0].status !== 'finished') throw new Error('Only finished games can be reopened.');
        return { rows: existing.map(row => ({ ...row, status: 'ongoing', winner: 'false' })), bans: bansData.filter(row => row.game_id === id) };
    }
    if (existing[0].status === 'finished') throw new Error('Reopen this game before editing.');
    const status = action === 'finish' ? 'finished' : val('game-status');
    if (!['scheduled', 'ongoing', 'finished', 'abandoned'].includes(status)) throw new Error('Choose a valid status.');
    if (!bansConfirmed || !picksConfirmed) throw new Error('Confirm your ban and pick changes before saving.');
    if (selectedBans.length > 6) throw new Error('Select at most six bans.');
    if (selectedPicks.length && selectedPicks.length !== 6) throw new Error('Confirm all six picks before saving.');
    const duration = val('duration');
    if (duration !== '' && (!Number.isFinite(Number(duration)) || Number(duration) < 0)) throw new Error('Duration must be a non-negative number of days.');
    const rows = existing.map((row, i) => {
        const timer = val('timer-' + i).trim();
        if (timer !== '' && !/^[0-9]+:[0-5][0-9]$/.test(timer)) throw new Error(`Enter average turn time for ${row.player_name} as hh:mm, e.g. 01:30.`);
        const [hours, minutes] = timer.split(':').map(Number);
        const averageMinutes = timer === '' ? '' : hours * 60 + minutes;
        if (averageMinutes !== '' && !Number.isSafeInteger(averageMinutes)) throw new Error('Average turn time is too large.');
        const race = val('race-' + i);
        if (race && !RACES.includes(race)) throw new Error('Choose a valid player race.');
        if (race && selectedPicks.length && !selectedPicks.includes(race)) throw new Error(`${row.player_name}'s race is not in the confirmed draft. Correct the assignment or draft order.`);
        return {
            ...row, status, race, pick_order: selectedPicks.includes(race) ? String(selectedPicks.indexOf(race) + 1) : '',
            draft_races: selectedPicks.join('|'),
            starting_position: integer('seat-' + i, 'Starting position', 1, 6),
            turns: integer('turns-' + i, 'Turns', 0),
            avg_turn_minutes: String(averageMinutes),
            victory_points: integer('vp-' + i, 'VP', 0, 10),
            ranking: integer('rank-' + i, 'Rank', 1, 6),
            speaker: String(el('speaker-' + i).checked),
            winner: String(status === 'finished' && val('rank-' + i) === '1'),
            duration_days: duration
        };
    });
    for (const [key, label] of [['race', 'Races'], ['starting_position', 'Starting positions'], ['ranking', 'Ranks']]) {
        const values = rows.map(row => row[key]).filter(Boolean);
        if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`);
    }
    if (rows.filter(row => row.speaker === 'true').length > 1) throw new Error('Choose at most one speaker.');
    if (status === 'finished') {
        if (selectedPicks.length !== 6) throw new Error('Confirm six race picks before finishing.');
        if (duration === '') throw new Error('Enter the game duration before finishing.');
        if (rows.some(row => ['race', 'starting_position', 'turns', 'avg_turn_minutes', 'victory_points', 'ranking'].some(key => row[key] === ''))) {
            throw new Error('Complete every player race, starting position, turns, average turn time, VP and rank before finishing.');
        }
    }
    if (rows.some(row => row.race && selectedBans.includes(row.race))) throw new Error('A player race cannot be banned.');
    const listed = [...selectedBans, ...selectedPicks];
    if (listed.some(race => !RACES.includes(race))) throw new Error('Unknown race in the game area.');
    if (new Set(listed).size !== listed.length) throw new Error('A race can appear only once across bans and picks.');
    const bans = [
        ...selectedBans.map(race => ({ game_id: id, race, type: 'banned' })),
        ...bansData.filter(row => row.game_id === id && row.type !== 'banned')
    ];
    return { rows, bans };
}
async function saveGame(action) {
    if (saving || reloadRequired) return;
    const id = val('game-select');
    let wroteGames = false;
    try {
        if (action !== 'reopen' && !el('game-form').reportValidity()) throw new Error('Correct the highlighted fields.');
        const { rows, bans } = readUpdate(id, action);
        saving = true;
        setWorkflow();
        msg('update-msg', 'load', 'Saving...');
        await loadCSVs();
        if (gamesSHA !== loadedGamesSHA || bansSHA !== loadedBansSHA) {
            throw new Error('Data changed in the repository. Reselect the game to load the latest data before saving.');
        }
        const updated = gamesData.map(row => row.game_id === id ? rows.find(update => update.player_name === row.player_name) : row);
        const fields = [...new Set(updated.flatMap(row => Object.keys(row)))];
        const updatedBans = [...bansData.filter(row => row.game_id !== id), ...bans];
        await ghPut(`${DATA_PATH}/games.csv`, Papa.unparse({ fields, data: updated }, { newline: '\n' }) + '\n', gamesSHA, `${action}: ${rows[0].game_name}`);
        wroteGames = true;
        if (Papa.unparse(updatedBans) !== Papa.unparse(bansData)) {
            await ghPut(`${DATA_PATH}/bans.csv`, (updatedBans.length ? Papa.unparse(updatedBans, { newline: '\n' }) : 'game_id,race,type') + '\n', bansSHA, `Update bans for ${rows[0].game_name}`);
        }
        await loadCSVs();
        fillSelect(id);
        loadGame();
        msg('update-msg', 'ok', action === 'finish' ? 'Game finished.' : action === 'reopen' ? 'Game reopened. Existing results are retained for correction.' : 'Game updated.');
    } catch (error) {
        if (wroteGames) reloadRequired = true;
        msg('update-msg', 'err', (wroteGames ? 'Game data was saved, but bans or refresh may be incomplete. Reload and reconnect before retrying. ' : '') + error.message);
    } finally {
        saving = false;
        setWorkflow();
    }
}
el('connect').addEventListener('click', () => doAuth());
el('connect-local').hidden = !isLocalhost;
el('local-help').hidden = !isLocalhost;
el('connect-local').addEventListener('click', () => doAuth(true));
el('logout').addEventListener('click', () => { sessionStorage.removeItem('ti4tok'); location.reload(); });
el('game-select').addEventListener('change', loadGame);
el('game-form').addEventListener('submit', event => { event.preventDefault(); saveGame('update'); });
el('finish').addEventListener('click', () => saveGame('finish'));
el('reopen').addEventListener('click', () => saveGame('reopen'));
for (const kind of ['ban', 'pick']) {
    el(kind + '-boxes').addEventListener('click', event => {
        const button = event.target.closest('button[data-race]');
        if (button && !button.disabled) toggleRace(kind, button.dataset.race);
    });
}
el('confirm-bans').addEventListener('click', () => { bansConfirmed = true; syncPlayerRaces(); renderRaceBoxes(); });
el('confirm-picks').addEventListener('click', () => {
    picksConfirmed = true;
    syncPlayerRaces();
    renderRaceBoxes();
});
const saved = sessionStorage.getItem('ti4tok');
if (saved) {
    el('tok').value = saved;
    doAuth();
}
