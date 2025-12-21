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

// Search data via API
async function loadSearchData() {
	// No longer needed - search is now performed via API
	console.log('Search will be performed via API on-demand');
}

// Search function
async function performSearch() {
	const searchTerm = document.getElementById('search-input').value.trim();
	
	if (searchTerm.length < 2) {
		document.getElementById('search-results').innerHTML = '<div class="text-center text-gray-400 py-8">Bitte mindestens 2 Zeichen eingeben</div>';
		return;
	}
	
	// Show loading indicator
	document.getElementById('search-results').innerHTML = '<div class="text-center text-gray-400 py-8"><div class="animate-spin inline-block w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full"></div><p class="mt-4">Suche...</p></div>';
	
	try {
		// Perform search via new API
		const apiUrl = `https://searchapi.mlc.to/search?&q=${encodeURIComponent(searchTerm)}`;
		const response = await fetch(apiUrl);
		
		if (!response.ok) {
			throw new Error(`API returned status ${response.status}`);
		}
		
		const data = await response.json();
		
		// Transform API response to our format
		searchResults = [];
		
		if (data && data.results && Array.isArray(data.results)) {
			data.results.forEach(item => {
				const title = item.title || '';
				const link = `http://mlcboard.com/forum/showthread.php?t=${item.id}`;
				
				// Check if it's a series (contains S01, S02, etc. or S01E01 patterns)
				const seasonMatch = title.match(/S(\d{1,2})(E(\d{1,2}))?/i);
				const yearMatch = title.match(/\b(19|20)\d{2}\b/);
				
				// Check for software/non-video indicators
				const titleUpper = title.toUpperCase();
				const softwarePatterns = [
					/\b(WISO|ADOBE|MICROSOFT|OFFICE|WINDOWS|MACOS|LINUX)\b/,
					/\b(PHOTOSHOP|ILLUSTRATOR|PREMIERE|INDESIGN|SPARBUCH|STEUER)\b/,
					/\b(ANTIVIRUS|KASPERSKY|NORTON|MCAFEE|VMWARE|DOCKER)\b/,
					/\b(AUTOCAD|SOLIDWORKS|CATIA|REVIT|SKETCHUP)\b/,
					/\b(V\d+\.\d+|BUILD\.\d+|VERSION\.\d+)\b/,
					/\b(REPACK|CODEX|SKIDROW|PLAZA|GOG|STEAM|CRACK|KEYGEN)\b/,
					/\b(AUDIOBOOK|HOERBUCH|EBOOK|EPUB|MOBI|PDF)\b/,
					/\b(ALBUM|DISCOGRAPHY|FLAC|320KBPS|MP3)\b/
				];
				
				const isSoftware = softwarePatterns.some(pattern => pattern.test(titleUpper));
				
				if (isSoftware) {
					// Skip software, games, ebooks, music
					return;
				} else if (seasonMatch) {
					// It's a series
					const season = seasonMatch[1].padStart(2, '0');
					const episode = seasonMatch[3] ? seasonMatch[3].padStart(2, '0') : null;
					
					// Extract series name (everything before season marker)
					const seriesName = title.split(/\.S\d{1,2}/i)[0].replace(/\./g, ' ').trim();
					
					searchResults.push({
						type: 'Serie',
						name: title,
						link: link,
						series: seriesName,
						season: season,
						episode: episode,
						year: yearMatch ? yearMatch[0] : null,
						quality: null,
						uploadTitle: title
					});
				} else {
					// It's a movie
					// Extract movie name (remove quality indicators, year, etc.)
					const cleanName = title.split(/\.(19|20)\d{2}\./)[0].replace(/\./g, ' ').trim();
					
					searchResults.push({
						type: 'Film',
						name: cleanName,
						link: link,
						series: null,
						season: null,
						episode: null,
						year: yearMatch ? yearMatch[0] : null,
						quality: 'N/A',
						uploadTitle: title
					});
				}
			});
		}
		
		console.log(`Search returned ${searchResults.length} results`);
		displaySearchResults();
		
	} catch (error) {
		console.error('Search error:', error);
		showSearchError(`Fehler bei der Suche: ${error.message}`);
	}
}

// Display search results
function displaySearchResults() {
	const resultsContainer = document.getElementById('search-results');
	
	// Filter out results without tags (likely not movies/series) and music files
	const filteredResults = searchResults.filter(result => {
		const nameForTags = result.uploadTitle || result.name;
		const upperTitle = nameForTags.toUpperCase();
		
		// Exclude music files (FLAC, MP3, AAC, etc.)
		if (upperTitle.includes('FLAC') || upperTitle.includes('.FLAC.') || 
		    upperTitle.includes('MP3') || upperTitle.includes('.MP3.') ||
		    upperTitle.includes('ALBUM') || upperTitle.includes('.ALBUM.')) {
			return false;
		}
		
		const tags = extractReleaseTags(nameForTags);
		return tags.length > 0; // Only include results with at least one tag
	});
	
	if (filteredResults.length === 0) {
		resultsContainer.innerHTML = '<div class="text-center text-gray-400 py-8">Keine Ergebnisse gefunden</div>';
		return;
	}
	
	let html = `<div class="text-sm text-gray-400 mb-4">${filteredResults.length} Ergebnis${filteredResults.length !== 1 ? 'se' : ''} gefunden</div>`;
	html += '<div class="space-y-3">';
	
	filteredResults.forEach((result, index) => {
		// For movies, use uploadTitle for tag extraction as it contains full release info
		const nameForTags = result.uploadTitle || result.name;
		const tags = extractReleaseTags(nameForTags);
		
		// For series, show series name + season/episode; for movies, show movie name
		const displayName = result.type === 'Serie' ? result.series : result.name;
		const seasonEpisode = result.type === 'Serie' && result.season && result.episode 
			? `S${String(result.season).padStart(2, '0')}E${String(result.episode).padStart(2, '0')}` 
			: '';
		
		// Berechne Qualitätsscore
		const qualityScore = calculateQualityScore(nameForTags);
		const qualityColorClass = qualityScore >= 9 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
									qualityScore >= 7 ? 'bg-green-500/20 text-green-400 border-green-500/30' :
									qualityScore >= 5 ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
									qualityScore >= 3 ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
									'bg-red-500/20 text-red-400 border-red-500/30';
		
		html += `
			<div class="bg-gray-700/50 rounded-lg p-4 hover:bg-gray-700 transition-all duration-200">
				<div class="flex items-start justify-between gap-4">
					<div class="flex-1 min-w-0">
						<div class="flex items-center gap-2 mb-2 flex-wrap">
							<h3 class="font-semibold text-white truncate">${escapeHtml(displayName)}</h3>
							${seasonEpisode ? `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-600/50 text-gray-200 border border-gray-500/30">${seasonEpisode}</span>` : ''}
							<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${qualityColorClass}">
								Q: ${qualityScore}/10
							</span>
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
						</div>
						
						${result.uploadTitle ? `<div class="text-xs text-gray-500 mt-1 truncate">${escapeHtml(result.uploadTitle)}</div>` : ''}
					</div>
					
					${result.link ? `
						<div class="flex-shrink-0 flex flex-col gap-2">
							<button onclick="downloadSFDLFromForum('${escapeHtml(result.link)}')" class="inline-flex items-center px-3 py-2 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white text-sm font-medium rounded-lg transition-all duration-200 shadow-lg hover:shadow-purple-500/50">
								<svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
								</svg>
								Download SFDL
							</button>
							<a href="${escapeHtml(result.link)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center px-3 py-2 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white text-sm font-medium rounded-lg transition-all duration-200 shadow-lg hover:shadow-green-500/50">
								<svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
								</svg>
								Forum
							</a>
						</div>
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
	if (name.includes('.CAM.')) tags.push({ text: 'CAM', category: 'source', color: 'bg-red-500/20 text-red-400 border-red-500/30' });
	if (name.includes('.MD.')) tags.push({ text: 'MD', category: 'source', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' });
	
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

// Calculate quality score from 1-10 based on release tags
function calculateQualityScore(filename) {
	if (!filename) return 0;
	
	const name = filename.toUpperCase();
	let score = 5; // Basis-Score
	
	// Auflösung (wichtigster Faktor)
	if (name.includes('2160P')) score += 2;
	else if (name.includes('1440P')) score += 1.75;
	else if (name.includes('1080P')) score += 2;
	else if (name.includes('720P')) score += 0.5;
	else if (name.includes('576P') || name.includes('480P')) score -= 1;
	
	// Quelle (zweitwichtigster Faktor)
	if (name.includes('REMUX')) score += 2;
	else if (name.includes('BLURAY') || name.includes('BDRIP')) score += 1.5;
	else if (name.includes('WEB-DL') || name.includes('WEBDL')) score += 1.5;
	else if (name.includes('WEBRIP') || name.includes('.WEB.')) score += 0.5;
	else if (name.includes('HDTV')) score += 0;
	else if (name.includes('DVDRIP')) score -= 1;
	else if (name.includes('.CAM.')) score -= 3;
	else if (name.includes('.MD.')) score -= 2;
	
	// HDR Bonus
	if (name.includes('DOLBYVISION') || name.includes('DV.')) score += 1.5;
	else if (name.includes('HDR10+')) score += 0.75;
	else if (name.includes('HDR')) score += 0.5;
	
	// Video Codec
	if (name.includes('AV1')) score += 0.5;
	else if (name.includes('H265') || name.includes('X265') || name.includes('HEVC')) score += 0.25;
	else if (name.includes('XVID')) score -= 0.5;
	
	// Audio Bonus/Penalty
	if (name.includes('ATMOS') || name.includes('DTS-X')) score += 0.5;
	else if (name.includes('TRUEHD') || name.includes('DTS-HD')) score += 0.25;
	if (name.includes('.LD.')) score -= 1.5; // Line Dubbed = schlechte Tonqualität
	
	// Begrenze auf 1-10 Skala
	score = Math.max(1, Math.min(10, score));
	return Math.round(score * 10) / 10; // Auf eine Dezimalstelle runden
}

// Download SFDL from forum link
function downloadSFDLFromForum(forumLink) {
	// Show loading state
	const button = event.target.closest('button');
	const originalText = button.innerHTML;
	button.disabled = true;
	button.innerHTML = '<svg class="animate-spin h-4 w-4 mr-1.5 inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Lädt...';
	
	fetch('/download_sfdl_url', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ url: forumLink })
	})
	.then(response => response.json())
	.then(data => {
		if (data.success) {
			// Success feedback
			button.innerHTML = '<svg class="w-4 h-4 mr-1.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>In Queue!';
			button.classList.remove('from-purple-500', 'to-purple-600', 'hover:from-purple-600', 'hover:to-purple-700');
			button.classList.add('from-green-500', 'to-green-600');
			
			// Show notification
			console.log('SFDL Download gestartet: ' + data.filename);
			
			// Keep modal open for continued searching - Media bar will show download progress
			// Note: Media bar is visible with higher z-index
			
			// Reload SFDL files list if function exists
			if (typeof loadSFDLFiles === 'function') {
				loadSFDLFiles();
			}
			
			// Reset button after 2 seconds
			setTimeout(() => {
				button.innerHTML = originalText;
				button.classList.remove('from-green-500', 'to-green-600');
				button.classList.add('from-purple-500', 'to-purple-600', 'hover:from-purple-600', 'hover:to-purple-700');
				button.disabled = false;
			}, 2000);
		} else {
			// Error feedback
			button.innerHTML = '<svg class="w-4 h-4 mr-1.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>Fehler!';
			button.classList.remove('from-purple-500', 'to-purple-600');
			button.classList.add('from-red-500', 'to-red-600');
			
			console.error('Fehler: ' + (data.error || 'Unbekannter Fehler'));
			alert('Fehler beim Download: ' + (data.error || 'Unbekannter Fehler'));
			
			// Reset button after 3 seconds
			setTimeout(() => {
				button.innerHTML = originalText;
				button.classList.remove('from-red-500', 'to-red-600');
				button.classList.add('from-purple-500', 'to-purple-600', 'hover:from-purple-600', 'hover:to-purple-700');
				button.disabled = false;
			}, 3000);
		}
	})
	.catch(error => {
		console.error('Fehler beim Herunterladen: ' + error);
		button.innerHTML = '<svg class="w-4 h-4 mr-1.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>Fehler!';
		button.classList.remove('from-purple-500', 'to-purple-600');
		button.classList.add('from-red-500', 'to-red-600');
		alert('Fehler beim Download: ' + error.message);
		
		// Reset button
		setTimeout(() => {
			button.innerHTML = originalText;
			button.classList.remove('from-red-500', 'to-red-600');
			button.classList.add('from-purple-500', 'to-purple-600', 'hover:from-purple-600', 'hover:to-purple-700');
			button.disabled = false;
		}, 3000);
	});
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
