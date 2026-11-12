function getRacePreference(rows) {
    const games = new Map();
    rows.filter(row => row.status === 'ongoing' || row.status === 'finished').forEach(row => {
        if (!games.has(row.game_id)) games.set(row.game_id, []);
        games.get(row.game_id).push(row);
    });
    const races = new Map();
    let drafts = 0;
    for (const players of games.values()) {
        const draft = players.find(row => row.draft_races)?.draft_races.split('|');
        const picks = draft
            ? draft.map((race, i) => ({ race, order: i + 1 }))
            : players.filter(row => row.race && /^[1-6]$/.test(String(row.pick_order)))
                .map(row => ({ race: row.race, order: Number(row.pick_order) }));
        if (!picks.length) continue;
        drafts++;
        const seen = new Set();
        for (const { race, order } of picks) {
            if (!race || order > 6 || seen.has(race)) continue;
            seen.add(race);
            if (!races.has(race)) races.set(race, { race, counts: [0, 0, 0, 0, 0, 0], picks: 0, sum: 0 });
            const stat = races.get(race);
            stat.counts[order - 1]++;
            stat.picks++;
            stat.sum += order;
        }
    }
    const stats = [...races.values()].map(stat => ({ ...stat, average: stat.sum / stat.picks }))
        .sort((a, b) => a.average - b.average || b.picks - a.picks || a.race.localeCompare(b.race));
    return { drafts, stats };
}

function renderRacePreference(rows) {
    const { drafts, stats } = getRacePreference(rows);
    const container = document.getElementById('race-preference');
    const escape = value => String(value).replace(/[&<>"']/g, c =>
        ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    container.innerHTML = `
        <div class="preference-heading"><div><h2>Race Draft Preference</h2>
        <p>Who gets snapped up first? Earlier average picks rank higher.</p></div>
        <span class="draft-count">${drafts} ${drafts === 1 ? 'draft' : 'drafts'} recorded</span></div>
        <p class="preference-note">Ongoing and finished games only. Each cell counts picks at that position; brighter cells mean more picks. Hover or focus for details. Small samples are not a strength ranking.</p>
        ${stats.length ? `<div class="preference-scroll"><table class="preference-table">
        <thead><tr><th>Race</th><th>Avg pick</th><th>Picks</th>${['1st', '2nd', '3rd', '4th', '5th', '6th'].map(label => `<th>${label}</th>`).join('')}</tr></thead>
        <tbody>${stats.map(stat => `<tr><td><div class="preference-race">${renderFactionIcons([stat.race])}<span>${escape(stat.race)}</span></div></td>
        <td><span class="average-pick">${stat.average.toFixed(2)}</span></td><td>${stat.picks}</td>
        ${stat.counts.map((count, i) => `<td><span class="pick-cell${count ? ' has-picks' : ''}" tabindex="0" style="--heat:${count / stat.picks}" aria-label="${escape(stat.race)}: ${count} picks at position ${i + 1}" title="${escape(stat.race)}: ${count} of ${stat.picks} picks at position ${i + 1}">${count || '-'}</span></td>`).join('')}</tr>`).join('')}</tbody></table></div>`
        : '<p class="preference-empty">No draft picks recorded yet. Confirm a race pick order and start a game to see preferences here.</p>'}`;
}
