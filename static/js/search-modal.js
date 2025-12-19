// Search Modal control functions
let seriesData = [];
let moviesData = [];
let searchResults = [];

// Open search modal
function openSearchModal() {
	document.getElementById('searchModal').classList.remove('hidden');
	document.getElementById('search-input').value = '';
	document.getElementById('search-results').innerHTML = '';
	// Auto-focus search input
	document.getElementById('search-input').focus();
	// Load data if not already loaded
	if (seriesData.length === 0 || moviesData.length === 0) {
		loadSearchData();
	}
}

// Close search modal
function closeSearchModal() {
	document.getElementById('searchModal').classList.add('hidden');
	document.getElementById('search-input').value = '';
	document.getElementById('search-results').innerHTML = '';
	searchResults = [];
}

// Load data from APIs
async function loadSearchData() {
	const loadingIndicator = document.getElementById('search-loading');
	if (loadingIndicator) {
		loadingIndicator.classList.remove('hidden');
	}
	
	try {
		// Load series data
		const seriesResponse = await fetch('https://seriesapi.mlc.to/series.json');
		const seriesJson = await seriesResponse.json();
		// Handle both array and object responses, check for "data" field
		if (seriesJson.data) {
			seriesData = Array.isArray(seriesJson.data) ? seriesJson.data : Object.values(seriesJson.data);
		} else {
			seriesData = Array.isArray(seriesJson) ? seriesJson : Object.values(seriesJson);
		}
		
		// Load movies data
		const moviesResponse = await fetch('https://seriesapi.mlc.to/movies.json');
		const moviesJson = await moviesResponse.json();
		// Movies are in "data" field
		if (moviesJson.data) {
			moviesData = Array.isArray(moviesJson.data) ? moviesJson.data : Object.values(moviesJson.data);
		} else {
			moviesData = Array.isArray(moviesJson) ? moviesJson : Object.values(moviesJson);
		}
		
		console.log(`Loaded ${seriesData.length} series and ${moviesData.length} movies`);
	} catch (error) {
		console.error('Fehler beim Laden der Daten:', error);
		showSearchError('Fehler beim Laden der Daten von der API');
	} finally {
		if (loadingIndicator) {
			loadingIndicator.classList.add('hidden');
		}
	}
}

// Search function
function performSearch() {
	const searchTerm = document.getElementById('search-input').value.trim().toLowerCase();
	
	if (searchTerm.length < 2) {
		document.getElementById('search-results').innerHTML = '<div class="text-center text-gray-400 py-8">Bitte mindestens 2 Zeichen eingeben</div>';
		return;
	}
	
	// Normalize search term: replace " s" with ".s" for season searches
	const normalizedSearchTerm = searchTerm.replace(/\s+s(\d)/g, '.s$1');
	
	searchResults = [];
	const addedSeriesKeys = new Set(); // Prevent duplicates
	
	// Extract season filter if present (e.g., "s02" or "s2")
	const seasonMatch = normalizedSearchTerm.match(/s(\d{1,2})/i);
	const seasonFilter = seasonMatch ? seasonMatch[1].padStart(2, '0') : null;
	
	// Search in series
	seriesData.forEach(series => {
		// Check if series matches search term (use both original and normalized)
		const nameMatches = series.name && series.name.toLowerCase().includes(normalizedSearchTerm);
		const seriesMatches = series.series && series.series.toLowerCase().includes(normalizedSearchTerm);
		
		if (!nameMatches && !seriesMatches) return;
		
		// If season filter is present, only show matching seasons
		if (seasonFilter && series.season && String(series.season).padStart(2, '0') !== seasonFilter) {
			return;
		}
		
		// Create unique key to avoid duplicates
		const uniqueKey = `${series.series}_${series.season}_${series.episode}`;
		
		if (!addedSeriesKeys.has(uniqueKey)) {
			addedSeriesKeys.add(uniqueKey);
			searchResults.push({
				type: 'Serie',
				name: series.name,
				link: series.link,
				series: series.series,
				season: series.season,
				episode: series.episode,
				year: null,
				quality: null
			});
		}
	});
	
	// Search in movies
	moviesData.forEach(movie => {
		if (movie.name && typeof movie.name === 'string' && movie.name.toLowerCase().includes(searchTerm)) {
			// Add each upload as a separate result
			if (movie.uploads && movie.uploads.length > 0) {
				movie.uploads.forEach(upload => {
					searchResults.push({
						type: 'Film',
						name: movie.name,
						link: `http://mlcboard.com/forum/showthread.php?t=${upload.tid}`,
						series: null,
						season: null,
						episode: null,
						year: movie.year,
						quality: movie.quality && movie.quality.length > 0 ? movie.quality.join(', ') : 'N/A',
						uploadTitle: upload.title
					});
				});
			} else {
				searchResults.push({
					type: 'Film',
					name: movie.name,
					link: null,
					series: null,
					season: null,
					episode: null,
					year: movie.year,
					quality: movie.quality && movie.quality.length > 0 ? movie.quality.join(', ') : 'N/A'
				});
			}
		}
	});
	
	// Sort results: Series by season/episode, Movies by year
	searchResults.sort((a, b) => {
		if (a.type === 'Serie' && b.type === 'Serie') {
			if (a.season !== b.season) return (a.season || 0) - (b.season || 0);
			return (a.episode || 0) - (b.episode || 0);
		}
		if (a.type === 'Film' && b.type === 'Film') {
			return (b.year || 0) - (a.year || 0);
		}
		return a.type === 'Serie' ? -1 : 1; // Series first
	});
	
	displaySearchResults();
}

// Display search results
function displaySearchResults() {
	const resultsContainer = document.getElementById('search-results');
	
	if (searchResults.length === 0) {
		resultsContainer.innerHTML = '<div class="text-center text-gray-400 py-8">Keine Ergebnisse gefunden</div>';
		return;
	}
	
	let html = `<div class="text-sm text-gray-400 mb-4">${searchResults.length} Ergebnis${searchResults.length !== 1 ? 'se' : ''} gefunden</div>`;
	html += '<div class="space-y-3">';
	
	searchResults.forEach((result, index) => {
		// For movies, use uploadTitle for tag extraction as it contains full release info
		const nameForTags = result.uploadTitle || result.name;
		const tags = extractReleaseTags(nameForTags);
		
		// For series, show series name + season/episode; for movies, show movie name
		const displayName = result.type === 'Serie' ? result.series : result.name;
		const seasonEpisode = result.type === 'Serie' && result.season && result.episode 
			? `S${String(result.season).padStart(2, '0')}E${String(result.episode).padStart(2, '0')}` 
			: '';
		
		html += `
			<div class="bg-gray-700/50 rounded-lg p-4 hover:bg-gray-700 transition-all duration-200">
				<div class="flex items-start justify-between gap-4">
					<div class="flex-1 min-w-0">
						<div class="flex items-center gap-2 mb-2 flex-wrap">
							<h3 class="font-semibold text-white truncate">${escapeHtml(displayName)}</h3>
							${seasonEpisode ? `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-600/50 text-gray-200 border border-gray-500/30">${seasonEpisode}</span>` : ''}
							<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${result.type === 'Serie' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'}">
								${result.type}
							</span>
						</div>
						
						<!-- Release Tags -->
						${tags.length > 0 ? `
							<div class="flex flex-wrap gap-1.5 mb-2">
								${tags.map(tag => `
									<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${tag.color}">
										${tag.text}
									</span>
								`).join('')}
							</div>
						` : ''}
						
						<div class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-400">
							${result.year ? `<span class="flex items-center"><svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>${result.year}</span>` : ''}
							${result.quality ? `<span class="flex items-center"><svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>${escapeHtml(result.quality)}</span>` : ''}
						</div>
						
						${result.uploadTitle ? `<div class="text-xs text-gray-500 mt-1 truncate">${escapeHtml(result.uploadTitle)}</div>` : ''}
						${result.type === 'Serie' ? `<div class="text-xs text-gray-500 mt-1 truncate">${escapeHtml(result.name)}</div>` : ''}
					</div>
					
					${result.link ? `
						<a href="${escapeHtml(result.link)}" target="_blank" rel="noopener noreferrer" class="flex-shrink-0 inline-flex items-center px-3 py-2 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white text-sm font-medium rounded-lg transition-all duration-200 shadow-lg hover:shadow-green-500/50">
							<svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
							</svg>
							Forum
						</a>
					` : '<span class="text-xs text-gray-500 italic">Kein Link verfügbar</span>'}
				</div>
			</div>
		`;
	});
	
	html += '</div>';
	resultsContainer.innerHTML = html;
}

// Show error message
function showSearchError(message) {
	const resultsContainer = document.getElementById('search-results');
	resultsContainer.innerHTML = `
		<div class="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-center">
			<svg class="w-12 h-12 text-red-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
			</svg>
			<p class="text-red-400">${escapeHtml(message)}</p>
		</div>
	`;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
	if (!text) return '';
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

// Extract release tags from filename
function extractReleaseTags(filename) {
	if (!filename) return [];
	
	const tags = [];
	const name = filename.toUpperCase();
	
	// Auflösung
	if (name.includes('2160P')) tags.push({ text: '4K', category: 'resolution', color: 'bg-red-500/20 text-red-400 border-red-500/30' });
	else if (name.includes('1440P')) tags.push({ text: '1440p', category: 'resolution', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' });
	else if (name.includes('1080P')) tags.push({ text: '1080p', category: 'resolution', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' });
	else if (name.includes('720P')) tags.push({ text: '720p', category: 'resolution', color: 'bg-green-500/20 text-green-400 border-green-500/30' });
	else if (name.includes('576P')) tags.push({ text: '576p', category: 'resolution', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' });
	else if (name.includes('480P')) tags.push({ text: '480p', category: 'resolution', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' });
	
	// HDR Formate
	if (name.includes('DOLBYVISION') || name.includes('DV.')) tags.push({ text: 'Dolby Vision', category: 'hdr', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' });
	if (name.includes('HDR10+')) tags.push({ text: 'HDR10+', category: 'hdr', color: 'bg-pink-500/20 text-pink-400 border-pink-500/30' });
	else if (name.includes('HDR10')) tags.push({ text: 'HDR10', category: 'hdr', color: 'bg-pink-500/20 text-pink-400 border-pink-500/30' });
	else if (name.includes('HDR')) tags.push({ text: 'HDR', category: 'hdr', color: 'bg-pink-500/20 text-pink-400 border-pink-500/30' });
	if (name.includes('HLG')) tags.push({ text: 'HLG', category: 'hdr', color: 'bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30' });
	
	// Video Codecs
	if (name.includes('H265') || name.includes('X265') || name.includes('HEVC')) tags.push({ text: 'H265', category: 'codec', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' });
	else if (name.includes('H264') || name.includes('X264') || name.includes('AVC')) tags.push({ text: 'H264', category: 'codec', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' });
	if (name.includes('AV1')) tags.push({ text: 'AV1', category: 'codec', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' });
	if (name.includes('XVID')) tags.push({ text: 'XviD', category: 'codec', color: 'bg-sky-500/20 text-sky-400 border-sky-500/30' });
	
	// Audio
	if (name.includes('ATMOS')) tags.push({ text: 'Atmos', category: 'audio', color: 'bg-violet-500/20 text-violet-400 border-violet-500/30' });
	if (name.includes('DTS-X')) tags.push({ text: 'DTS-X', category: 'audio', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' });
	else if (name.includes('DTS-HD')) tags.push({ text: 'DTS-HD', category: 'audio', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' });
	else if (name.includes('DTS')) tags.push({ text: 'DTS', category: 'audio', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' });
	if (name.includes('TRUEHD')) tags.push({ text: 'TrueHD', category: 'audio', color: 'bg-violet-500/20 text-violet-400 border-violet-500/30' });
	if (name.includes('DD+') || name.includes('EAC3')) tags.push({ text: 'DD+', category: 'audio', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' });
	else if (name.includes('DD') || name.includes('AC3')) tags.push({ text: 'DD', category: 'audio', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' });
	if (name.includes('AAC')) tags.push({ text: 'AAC', category: 'audio', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' });
	if (name.includes('FLAC')) tags.push({ text: 'FLAC', category: 'audio', color: 'bg-teal-500/20 text-teal-400 border-teal-500/30' });
	if (name.includes('7.1')) tags.push({ text: '7.1', category: 'audio', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' });
	else if (name.includes('5.1')) tags.push({ text: '5.1', category: 'audio', color: 'bg-green-500/20 text-green-400 border-green-500/30' });
	
	// Sprache
	if (name.includes('.DL.') || name.includes('.DUAL.')) tags.push({ text: 'Dual Language', category: 'language', color: 'bg-lime-500/20 text-lime-400 border-lime-500/30' });
	if (name.includes('.ML.')) tags.push({ text: 'Multi Language', category: 'language', color: 'bg-lime-500/20 text-lime-400 border-lime-500/30' });
	if (name.includes('GERMAN') || name.includes('.GER.') || name.includes('.DE.')) tags.push({ text: 'GER', category: 'language', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' });
	if (name.includes('ENGLISH') || name.includes('.ENG.')) tags.push({ text: 'ENG', category: 'language', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' });
	if (name.includes('.SUBBED') || name.includes('.SUB.')) tags.push({ text: 'SUBBED', category: 'language', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' });
	
	// Quelle
	if (name.includes('BLURAY') || name.includes('BDRIP')) tags.push({ text: 'BluRay', category: 'source', color: 'bg-sky-500/20 text-sky-400 border-sky-500/30' });
	else if (name.includes('WEB-DL') || name.includes('WEBDL')) tags.push({ text: 'WEB-DL', category: 'source', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' });
	else if (name.includes('WEBRIP')) tags.push({ text: 'WEBRip', category: 'source', color: 'bg-teal-500/20 text-teal-400 border-teal-500/30' });
	else if (name.includes('.WEB.')) tags.push({ text: 'WEB', category: 'source', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' });
	if (name.includes('HDTV')) tags.push({ text: 'HDTV', category: 'source', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' });
	if (name.includes('DVDRIP')) tags.push({ text: 'DVDRip', category: 'source', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' });
	if (name.includes('REMUX')) tags.push({ text: 'REMUX', category: 'source', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' });
	
	// Streaming Anbieter
	if (name.includes('.NF.') || name.includes('NETFLIX')) tags.push({ text: 'Netflix', category: 'provider', color: 'bg-red-600/20 text-red-400 border-red-600/30' });
	if (name.includes('.AMZN.') || name.includes('AMAZON')) tags.push({ text: 'Amazon', category: 'provider', color: 'bg-blue-600/20 text-blue-400 border-blue-600/30' });
	if (name.includes('.DSNP.') || name.includes('DISNEY')) tags.push({ text: 'Disney+', category: 'provider', color: 'bg-indigo-600/20 text-indigo-400 border-indigo-600/30' });
	if (name.includes('.ATVP.') || name.includes('APPLETV')) tags.push({ text: 'Apple TV+', category: 'provider', color: 'bg-gray-600/20 text-gray-400 border-gray-600/30' });
	if (name.includes('.HMAX.')) tags.push({ text: 'HBO Max', category: 'provider', color: 'bg-purple-600/20 text-purple-400 border-purple-600/30' });
	if (name.includes('.HULU.')) tags.push({ text: 'Hulu', category: 'provider', color: 'bg-green-600/20 text-green-400 border-green-600/30' });
	
	// Sonstige
	if (name.includes('REPACK')) tags.push({ text: 'REPACK', category: 'misc', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' });
	if (name.includes('PROPER')) tags.push({ text: 'PROPER', category: 'misc', color: 'bg-green-500/20 text-green-400 border-green-500/30' });
	if (name.includes('EXTENDED')) tags.push({ text: 'EXTENDED', category: 'misc', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' });
	if (name.includes('UNCUT')) tags.push({ text: 'UNCUT', category: 'misc', color: 'bg-red-500/20 text-red-400 border-red-500/30' });
	if (name.includes('COMPLETE')) tags.push({ text: 'COMPLETE', category: 'misc', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' });
	if (name.includes('LIMITED')) tags.push({ text: 'LIMITED', category: 'misc', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' });
	if (name.includes('INTERNAL')) tags.push({ text: 'INTERNAL', category: 'misc', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' });
	
	return tags;
}

// Search on Enter key
document.addEventListener('DOMContentLoaded', function() {
	const searchInput = document.getElementById('search-input');
	if (searchInput) {
		// Search on Enter key
		searchInput.addEventListener('keypress', function(e) {
			if (e.key === 'Enter') {
				performSearch();
			}
		});
		
		// Live search while typing (with debounce)
		let searchTimeout;
		searchInput.addEventListener('input', function(e) {
			clearTimeout(searchTimeout);
			searchTimeout = setTimeout(() => {
				performSearch();
			}, 300); // Wait 300ms after user stops typing
		});
	}
	
	// Close modal with ESC key
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && !document.getElementById('searchModal').classList.contains('hidden')) {
			closeSearchModal();
		}
	});
});
