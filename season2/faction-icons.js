// Asset filenames from AsyncTI4/TI4_map_generator_bot (see README attribution).
const FACTION_ICONS = {
    'Arborec': 'arborec', 'Argent Flight': 'argent', 'Barony of Letnev': 'letnev',
    'Clan of Saar': 'saar', 'Council Keleres': 'keleres', 'Crimson': 'crimson',
    'Deepwrought Scholarate': 'deepwrought', 'Emirates of Hacan': 'hacan',
    'Empyrean': 'empyrean', 'Federation of Sol': 'sol', 'Firmament': 'firmament',
    'Ghosts of Creuss': 'ghost', 'L1Z1X Mindnet': 'l1z1x',
    'Mahact Gene-Sorcerers': 'mahact', 'Mentak Coalition': 'mentak',
    'Naalu Collective': 'naalu', 'Naaz-Rokha Alliance': 'naaz', 'Nekro Virus': 'nekro',
    'Nomad': 'nomad', 'Regal Authority of Ral-Nel': 'ralnel',
    "Sardakk N'orr": 'sardakk', 'The Last Bastion': 'bastion', 'Titans of Ul': 'titans',
    'Universities of Jol-Nar': 'jolnar', "Vuil'raith Cabal": 'cabal',
    'Winnu': 'winnu', 'Xxcha Kingdom': 'xxcha', 'Yin Brotherhood': 'yin',
    'Yssaril Tribes': 'yssaril', 'Embers of Muaat': 'muaat'
};

function standingsParticipation(rows, player) {
    const played = rows.filter(row => row.player_name === player
        && (row.status === 'ongoing' || row.status === 'finished'));
    return {
        startedGames: played.filter(row => row.status === 'ongoing').length,
        activeRaces: played.filter(row => row.status === 'ongoing'),
        winningRaces: played.filter(row => row.status === 'finished' && row.winner === 'true'),
        racesPlayed: [...new Set(played.map(row => row.race).filter(Boolean))].sort()
    };
}

function renderFactionIcons(races, context = '') {
    const escape = value => String(value).replace(/[&<>"']/g, c =>
        ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
    return races.length ? `<div class="faction-icons">${races.map(entry => {
        const race = typeof entry === 'string' ? entry : entry.race;
        const name = race || 'Race TBD';
        const label = escape(typeof entry === 'string' ? name
            : `${context}: ${name} - ${entry.game_name || entry.game_id}`);
        const icon = FACTION_ICONS[race];
        return icon
            ? `<span class="faction-icon" tabindex="0" aria-label="${label}"><img src="../assets/factions/${icon}.png" alt="${label}" width="30" height="30"><span role="tooltip">${label}</span></span>`
            : `<span>${label}</span>`;
    }).join('')}</div>` : '-';
}
