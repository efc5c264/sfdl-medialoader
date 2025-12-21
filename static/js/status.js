// Global variables
var downloadQueue = {}; // Track multiple downloads by SFDL name

$(document).ready(function() {
	var loader_beendet = false;
	var www_beendet = false;
	var refTimer;
	var mediaBarVisible = false;
	var mediaBarManuallyHidden = false; // Track if user manually hid the media bar
	
	// Play completion sound
	function playCompletionSound() {
		try {
			// Create audio context for a simple "bing" sound
			var audioContext = new (window.AudioContext || window.webkitAudioContext)();
			var oscillator = audioContext.createOscillator();
			var gainNode = audioContext.createGain();
			
			oscillator.connect(gainNode);
			gainNode.connect(audioContext.destination);
			
			// Bing sound: two quick tones
			oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
			oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.1);
			
			gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
			gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
			
			oscillator.start(audioContext.currentTime);
			oscillator.stop(audioContext.currentTime + 0.3);
		} catch(e) {
			console.log('Could not play completion sound:', e);
		}
	}
	
	// Check forum credentials status
	function checkForumStatus() {
		fetch('/forum_status')
			.then(response => response.json())
			.then(data => {
				const statusDot = document.getElementById('forumStatusDot');
				const statusText = document.getElementById('forumStatusText');
				
				if (data.configured) {
					statusDot.className = 'w-2 h-2 rounded-full mr-2 bg-green-400';
					statusText.innerHTML = 'Forum: <span class="font-medium text-green-400">Konfiguriert</span>';
				} else {
					statusDot.className = 'w-2 h-2 rounded-full mr-2 bg-red-400';
					statusText.innerHTML = 'Forum: <span class="font-medium text-red-400">Nicht konfiguriert</span>';
				}
			})
			.catch(err => {
				const statusDot = document.getElementById('forumStatusDot');
				const statusText = document.getElementById('forumStatusText');
				statusDot.className = 'w-2 h-2 rounded-full mr-2 bg-gray-400';
				statusText.innerHTML = 'Forum: <span class="font-medium text-gray-400">Unbekannt</span>';
			});
	}
	
	// Media Bar Functions
	window.hideMediaBar = function() {
		$('#mediaBar').addClass('hidden').removeClass('media-bar-enter');
		$('body').removeClass('media-bar-active');
		mediaBarVisible = false;
		mediaBarManuallyHidden = true; // User manually hid it
		
		// Show the "Show Media Bar" button if there are active downloads
		if(Object.keys(downloadQueue).length > 0) {
			$('#showMediaBarBtn').removeClass('hidden');
			updateShowMediaBarButton();
		}
	};
	
	window.showMediaBar = function() {
		$('#mediaBar').removeClass('hidden').addClass('media-bar-enter');
		$('body').addClass('media-bar-active');
		mediaBarVisible = true;
		mediaBarManuallyHidden = false; // User manually showed it
		$('#showMediaBarBtn').addClass('hidden');
	};
	
	function updateShowMediaBarButton() {
		var count = Object.keys(downloadQueue).length;
		if(count > 0) {
			var text = count === 1 ? '1 Download' : count + ' Downloads';
			$('#showMediaBarCount').text(text);
			if(!mediaBarVisible) {
				$('#showMediaBarBtn').removeClass('hidden');
			}
		} else {
			$('#showMediaBarBtn').addClass('hidden');
		}
	}
	
	function addToDownloadQueue(sfdlName, step, progress, speed, eta, fileCount, totalSize, fileList) {
		// Check if download just completed (reached 100%)
		var wasNotComplete = !downloadQueue[sfdlName] || downloadQueue[sfdlName].progress < 100;
		var isNowComplete = progress >= 100;
		
		if(wasNotComplete && isNowComplete) {
			// Download just completed - play sound and schedule removal
			playCompletionSound();
			console.log('Download completed:', sfdlName);
			
			// Add to queue briefly to show 100%
			downloadQueue[sfdlName] = {
				name: sfdlName,
				step: 'Abgeschlossen ✓',
				progress: progress,
				speed: '-',
				eta: '-',
				timestamp: Date.now(),
				fileCount: fileCount,
				totalSize: totalSize,
				fileList: fileList
			};
			renderDownloadQueue();
			
			// Remove after 2 seconds
			setTimeout(function() {
				if(downloadQueue[sfdlName] && downloadQueue[sfdlName].progress >= 100) {
					delete downloadQueue[sfdlName];
					renderDownloadQueue();
					updateShowMediaBarButton();
					
					// Hide media bar if queue is now empty
					if(Object.keys(downloadQueue).length === 0 && !mediaBarManuallyHidden) {
						setTimeout(function() {
							hideMediaBar();
							$('#showMediaBarBtn').addClass('hidden');
							mediaBarManuallyHidden = false;
						}, 1000);
					}
				}
			}, 2000);
		} else if(!isNowComplete) {
			// Normal update for incomplete downloads
			downloadQueue[sfdlName] = {
				name: sfdlName,
				step: step,
				progress: progress,
				speed: speed,
				eta: eta || '-',
				timestamp: Date.now()
			};
			
			// Add optional fileCount and totalSize if provided
			if(fileCount !== undefined) {
				downloadQueue[sfdlName].fileCount = fileCount;
			}
			if(totalSize !== undefined) {
				downloadQueue[sfdlName].totalSize = totalSize;
			}
			if(fileList !== undefined) {
				downloadQueue[sfdlName].fileList = fileList;
			}
			
			renderDownloadQueue();
		}
		
		updateShowMediaBarButton();
	}
	
	function removeFromDownloadQueue(sfdlName) {
		delete downloadQueue[sfdlName];
		renderDownloadQueue();
		updateShowMediaBarButton();
		
		// Don't auto-hide during removal, let the done handler do it once
	}
	
	function renderDownloadQueue() {
		var queueContainer = $('#mediaBarQueue');
		var queueCount = Object.keys(downloadQueue).length;
		
		$('#mediaBarQueueCount').text(queueCount + ' aktive Download' + (queueCount !== 1 ? 's' : ''));
		
		if(queueCount === 0) {
			queueContainer.html('<div class=\"text-center text-gray-400 py-4\">Keine aktiven Downloads</div>');
			return;
		}
		
		queueContainer.html('');
		
		for(var key in downloadQueue) {
			var item = downloadQueue[key];
			var displayName = item.name;
			
			var itemHtml = '<div class="bg-gray-900/50 rounded-lg p-3 border border-gray-700">';
			itemHtml += '<div class="flex items-center justify-between mb-2">';
			itemHtml += '<div class="flex-1 min-w-0">';
			itemHtml += '<div class="text-sm font-medium text-white break-words">' + displayName + '</div>';
			
			// Show file count and size info if available
			var stepInfo = item.step;
			if(item.fileCount && item.totalSize) {
				var sizeStr = (item.totalSize / 1024 / 1024 / 1024).toFixed(2) + ' GB';
				if(item.totalSize < 1024 * 1024 * 1024) {
					sizeStr = (item.totalSize / 1024 / 1024).toFixed(2) + ' MB';
				}
				stepInfo = item.step + ' • ' + sizeStr;
			}
			
			itemHtml += '<div class="text-xs text-gray-400 mt-0.5">' + stepInfo + '</div>';
			itemHtml += '</div>';
			itemHtml += '<div class="flex items-center gap-4 ml-4 text-xs">';
			
			// Speed indicator
			if(item.speed !== '-') {
				itemHtml += '<div class="text-right min-w-[80px]">';
				itemHtml += '<div class="text-emerald-400 font-medium">↓ ' + item.speed + ' MB/s</div>';
				itemHtml += '</div>';
			}
			
			// Progress & ETA
			itemHtml += '<div class="text-right min-w-[100px]">';
			itemHtml += '<div class="font-medium text-gray-200">' + item.progress + '%</div>';
			if(item.eta && item.eta !== '-') {
				itemHtml += '<div class="text-gray-400 text-[10px] mt-0.5">⏱ ' + item.eta + '</div>';
			}
			itemHtml += '</div>';
			
			itemHtml += '</div>';
			itemHtml += '</div>';
			itemHtml += '<div class="w-full bg-gray-700 rounded-full h-1.5 overflow-hidden">';
			
			var pulseClass = item.speed === '-' ? ' animate-pulse' : '';
			itemHtml += '<div class="h-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-300' + pulseClass + '" style="width: ' + item.progress + '%"></div>';
			itemHtml += '</div>';
			
			// Show file list if available
			if(item.fileList && item.fileList.length > 0) {
				itemHtml += '<div class="mt-2 pt-2 border-t border-gray-700/50">';
				itemHtml += '<div class="text-xs text-gray-400 mb-1.5">Dateien:</div>';
				itemHtml += '<div class="space-y-1 max-h-32 overflow-y-auto">';
				
				for(var i = 0; i < item.fileList.length; i++) {
					var file = item.fileList[i];
					var fileName = file.name;
					
					// Calculate file size display
					var fileSizeStr = '';
					if(file.size > 0) {
						if(file.size >= 1024 * 1024 * 1024) {
							fileSizeStr = (file.size / 1024 / 1024 / 1024).toFixed(2) + ' GB';
						} else if(file.size >= 1024 * 1024) {
							fileSizeStr = (file.size / 1024 / 1024).toFixed(2) + ' MB';
						} else if(file.size >= 1024) {
							fileSizeStr = (file.size / 1024).toFixed(2) + ' KB';
						} else {
							fileSizeStr = file.size + ' B';
						}
					} else {
						fileSizeStr = 'Berechne...';
					}
					
					// Calculate downloaded display
					var downloadedStr = '';
					if(file.downloaded > 0) {
						if(file.downloaded >= 1024 * 1024 * 1024) {
							downloadedStr = (file.downloaded / 1024 / 1024 / 1024).toFixed(2) + ' GB';
						} else if(file.downloaded >= 1024 * 1024) {
							downloadedStr = (file.downloaded / 1024 / 1024).toFixed(2) + ' MB';
						} else if(file.downloaded >= 1024) {
							downloadedStr = (file.downloaded / 1024).toFixed(2) + ' KB';
						} else {
							downloadedStr = file.downloaded + ' B';
						}
					} else {
						downloadedStr = '0 B';
					}
					
					var fileProgress = 0;
					if(file.size > 0 && file.downloaded > 0) {
						fileProgress = Math.round((file.downloaded / file.size) * 100);
					}
					
					itemHtml += '<div class="flex items-center justify-between text-xs gap-2 py-1">';
					itemHtml += '<div class="flex-1 min-w-0 text-gray-300 break-words">' + fileName + '</div>';
					itemHtml += '<div class="flex items-center gap-2 ml-2 shrink-0">';
					itemHtml += '<span class="text-gray-500 text-[11px]">' + downloadedStr + ' / ' + fileSizeStr + '</span>';
					itemHtml += '<span class="text-emerald-400 font-medium min-w-[40px] text-right">' + fileProgress + '%</span>';
					itemHtml += '</div>';
					itemHtml += '</div>';
				}
				
				itemHtml += '</div>';
				itemHtml += '</div>';
			}
			
			itemHtml += '</div>';
			
			queueContainer.append(itemHtml);
		}
	}
	
	function updateMediaBar(data) {
		var action = data.data[0].action;
		var sfdl = data.data[0].sfdl;
		var loading = data.data[0].loading;
		var loading_file_array = data.data[0].loading_file_array || '';
		var status = data.data[0].status;
		
		// Debug: Log current action
		if(action != "done" && action != "") {
			console.log('Media Bar - Action:', action, 'Status:', status, 'SFDL:', sfdl);
		}
		
		// Show media bar when loading or extracting (but only if user hasn't manually hidden it)
		if(action == "loading" || action.startsWith("Entpacke Archive") || action.includes('Forum') || action.includes('SFDL')) {
			if(!mediaBarVisible && !mediaBarManuallyHidden) {
				console.log('Showing media bar for action:', action);
				$('#mediaBar').removeClass('hidden').addClass('media-bar-enter');
				$('body').addClass('media-bar-active');
				mediaBarVisible = true;
			} else if(mediaBarManuallyHidden) {
				// Update the show button count even if manually hidden
				updateShowMediaBarButton();
			}
			
			var displayName = sfdl || 'Download';
			var step = 'Initialisierung...';
			var progress = 0;
			var speed = '-';
			
			// Update step and progress based on action
			if(action == "loading") {
				var load_arr = loading.split("|");
				speed = load_arr[4] || '0';
				
				// Calculate progress and ETA from individual files
				var totalBytes = 0;
				var downloadedBytes = 0;
				var fileCount = 0;
				var archiveCount = 0;
				var fileList = [];
				
				if(loading_file_array && loading_file_array.length > 0) {
					var files_arr = loading_file_array.split(";");
					for(var i = 0; i < files_arr.length; i++) {
						if(!files_arr[i]) continue;
						var files_split = files_arr[i].split("|");
						var filename = files_split[0] || '';
						var filesize = parseInt(files_split[1]) || 0;
						var downloaded = files_split[2] == "NULL" ? 0 : parseInt(files_split[2]) || 0;
						
						totalBytes += filesize;
						downloadedBytes += downloaded;
						fileCount++;
						
						// Count archive files (.rar, .r00, .r01, etc.)
						if(filename.match(/\.(rar|r\d{2,3})$/i)) {
							archiveCount++;
						}
						
						// Add to file list for detailed display
						fileList.push({
							name: filename,
							size: filesize,
							downloaded: downloaded
						});
					}
					
					// Calculate accurate progress from all files
					if(totalBytes > 0) {
						progress = Math.round((downloadedBytes / totalBytes) * 100);
						
						// Better step description
						if(archiveCount > 0) {
							step = archiveCount + ' Archiv' + (archiveCount !== 1 ? 'e' : '') + ' werden geladen...';
						} else if(fileCount > 1) {
							step = fileCount + ' Dateien werden geladen...';
						} else {
							step = 'Download läuft...';
						}
					} else {
						// No size info yet - show indeterminate progress
						progress = 0;
						step = 'Ermittle Dateigröße (' + fileCount + ' Dateien)...';
					}
				} else {
					// Fallback to old calculation if file array not available
					totalBytes = parseInt(load_arr[2]) * 1024 || 0;
					downloadedBytes = parseInt(load_arr[1]) * 1024 || 0;
					
					if(totalBytes > 0) {
						progress = Math.round((downloadedBytes / totalBytes) * 100);
					} else {
						progress = 0;
						step = 'Berechne Dateigröße...';
					}
				}
				
				// Calculate ETA based on actual bytes
				var remaining = totalBytes - downloadedBytes;
				var speed_bytes = parseFloat(speed) * 1024 * 1024; // Convert MB/s to bytes/s
				var eta = '-';
				if(speed_bytes > 0 && remaining > 0) {
					var eta_seconds = Math.round(remaining / speed_bytes);
					var eta_hours = Math.floor(eta_seconds / 3600);
					var eta_mins = Math.floor((eta_seconds % 3600) / 60);
					var eta_secs = eta_seconds % 60;
					eta = String(eta_hours).padStart(2, '0') + ':' + String(eta_mins).padStart(2, '0') + ':' + String(eta_secs).padStart(2, '0');
				}
				
				// Add to download queue with ETA and file list
				addToDownloadQueue(displayName, step, progress, speed, eta, fileCount, totalBytes, fileList);
			} else if(action.startsWith("Entpacke Archive")) {
				step = 'Entpacke Archive...';
				progress = 100;
				speed = '-';
				addToDownloadQueue(displayName, step, progress, speed);
			} else if(action.includes('Forum-Login')) {
				step = 'Forum-Login...';
				progress = 25;
				speed = '-';
				addToDownloadQueue(displayName, step, progress, speed);
			} else if(action.includes('SFDL-Link wird extrahiert')) {
				step = 'SFDL-Link extrahieren...';
				progress = 50;
				speed = '-';
				addToDownloadQueue(displayName, step, progress, speed);
			} else if(action.includes('SFDL-Datei wird heruntergeladen')) {
				step = 'SFDL-Download...';
				progress = 75;
				speed = '-';
				addToDownloadQueue(displayName, step, progress, speed);
			} else if(action.includes('SFDL wird analysiert')) {
				step = 'SFDL analysieren...';
				progress = 90;
				speed = '-';
				addToDownloadQueue(displayName, step, progress, speed);
			}
			
		} else if(action == "done" || status == "done") {
			// Remove from queue when done
			// Since done status has empty sfdl_name, we need to clear all completed downloads
			// that have reached 100% progress
			
			var removedCount = 0;
			for(var key in downloadQueue) {
				if(downloadQueue[key].progress >= 100) {
					removedCount++;
				}
			}
			
			// Also check if sfdl name needs to be removed
			if(sfdl && downloadQueue[sfdl]) {
				removedCount++;
			}
			
			// Only proceed if there's actually something to remove
			if(removedCount > 0) {
				console.log('Done status received, clearing', removedCount, '100% download(s)');
				
				for(var key in downloadQueue) {
					if(downloadQueue[key].progress >= 100) {
						console.log('Removing completed download:', key);
						delete downloadQueue[key];
					}
				}
				
				// Also try to remove by sfdl name if provided
				if(sfdl && downloadQueue[sfdl]) {
					delete downloadQueue[sfdl];
				}
				
				// Update UI once after all removals
				renderDownloadQueue();
				updateShowMediaBarButton();
				
				// Hide media bar if queue is now empty
				if(Object.keys(downloadQueue).length === 0) {
					setTimeout(function() {
						hideMediaBar();
						$('#showMediaBarBtn').addClass('hidden');
						mediaBarManuallyHidden = false; // Reset flag when queue is empty
					}, 2000);
				}
			}
		}
	}
	
	// Check TMDB API status
	function checkTmdbStatus() {
		fetch('/tmdb_status')
			.then(response => response.json())
			.then(data => {
				const statusDot = document.getElementById('tmdbStatusDot');
				const statusText = document.getElementById('tmdbStatusText');
				
				if (data.configured) {
					statusDot.className = 'w-2 h-2 rounded-full mr-2 bg-green-400';
					statusText.innerHTML = 'TMDB: <span class="font-medium text-green-400">Konfiguriert</span>';
				} else {
					statusDot.className = 'w-2 h-2 rounded-full mr-2 bg-red-400';
					statusText.innerHTML = 'TMDB: <span class="font-medium text-red-400">Nicht konfiguriert</span>';
				}
			})
			.catch(err => {
				const statusDot = document.getElementById('tmdbStatusDot');
				const statusText = document.getElementById('tmdbStatusText');
				statusDot.className = 'w-2 h-2 rounded-full mr-2 bg-gray-400';
				statusText.innerHTML = 'TMDB: <span class="font-medium text-gray-400">Unbekannt</span>';
			});
	}
	
	// Check forum status on page load
	checkForumStatus();
	checkTmdbStatus();
	
	function loadData() {
		$.getJSON("status.json", function(data) {
			var version = data.data[0].version;
			var status = data.data[0].status;
			var datetime = data.data[0].datetime;
			var action = data.data[0].action;
			
			if(!www_beendet) {
				$(".button_sfdl_link, .button_ftp, .button_upload, .button_kill").prop("disabled", false);
			}
			
			if(!loader_beendet) {
				var isDone = (status == "done");
				$(".button_start").prop("disabled", !isDone);
				$(".button_stop").prop("disabled", isDone);
			} else {
				$(".button_start").prop("disabled", false);
				$(".button_stop").prop("disabled", true);
			}
			
			$('.title').html("SFDL-Medialoader v" + version);
			if(action == "NULL" || action == "NULL" || action == "") {
				action = "done";
			}
			
			// Update media bar
			updateMediaBar(data);
			
			var formattedDate = datetime;
			try {
				var dateObj = new Date(datetime);
				if(!isNaN(dateObj.getTime())) {
					formattedDate = dateObj.toLocaleString('de-DE', {
						day: '2-digit',
						month: '2-digit',
						year: 'numeric',
						hour: '2-digit',
						minute: '2-digit',
						second: '2-digit'
					});
				}
			} catch(e) {}
			
			$('.info').html("Status: <b>" + status + "</b> | Letzte Aktivität: <b>" + formattedDate + "</b>");
			
			if(action == "done") {
				$('.info').html("Status: <b>BEREIT</b>");
			}
		});
	
		refTimer = setTimeout(loadData, 250);  // Poll every 250ms for faster updates
	}
	
	$(".button_start").click(function() {
		var usrpass = prompt("Bitte Passwort zum Starten eingeben", "");
		if(usrpass) {
			$.ajax({
				url: "/start/" + usrpass,
				type: "GET",
				success: function(data) {
					var command = data.data[0].start;
					if(command == "ok") {
						loader_beendet = false;
						console.log("Erfolgreich gestartet!");
					} else {
						alert("Fehler: " + command);
					}
				},
				error: function(xhr) {
					if(xhr.status == 403) {
						alert("Fehler: Falsches Passwort");
					} else {
						alert("Fehler: " + xhr.status + " - " + xhr.statusText);
					}
				}
			});
		}
	});
	
	$(".button_stop").click(function() {
		var usrpass = prompt("Bitte Passwort zum Beenden eingeben", "");
		if(usrpass) {
			$.ajax({
				url: "/stop/" + usrpass,
				type: "GET",
				success: function(data) {
					var command = data.data[0].stop;
					if(command == "ok") {
						loader_beendet = true;
						$(".button_start").prop("disabled", false);
						$(".button_stop").prop("disabled", true);
						console.log("Erfolgreich beendet!");
					} else {
						console.error("Fehler: " + command);
					}
				},
				error: function(xhr) {
					if(xhr.status == 403) {
						alert("Fehler: Falsches Passwort");
					} else {
						alert("Fehler: " + xhr.status + " - " + xhr.statusText);
					}
				}
			});
		}
	});
	
	$(".button_kill").click(function() {
		var usrpass = prompt("Bitte Passwort zum Beenden des Webservers eingeben", "");
		if(usrpass) {
			$.ajax({
				url: "/kill/" + usrpass,
				type: "GET",
				success: function(data) {
					var command = data.data[0].kill;
					if(command == "ok") {
						www_beendet = true;
						$(".button_start, .button_stop, .button_kill, .button_sfdl_link, .button_ftp, .button_upload").prop("disabled", true);
						alert("Webserver beendet!");
						clearTimeout(refTimer);
					} else {
						alert("Fehler: " + command);
					}
				},
				error: function(xhr) {
					if(xhr.status == 403) {
						alert("Fehler: Falsches Passwort");
					} else {
						alert("Fehler: " + xhr.status + " - " + xhr.statusText);
					}
				}
			});
		}
	});
	
	$(".button_sfdl_link").click(function() {
		var command = prompt("Bitte Link zur SFDL Datei eingeben", "");
		if(command) {
			$.get("/upload/" + command, function(data) {
				var command = data.data[0].upload;
				if(command == "ok") {
					console.log("SFDL Datei (" + data.data[0].sfdl + ") erfolgreich hochgeladen!");
				} else {
					console.error("Fehler: " + data.data[0].sfdl);
				}
			});
		}
	});
	
	$(".button_ftp").click(function() {
		var command = prompt("Bitte FTP URL eingeben", "");
		if(command) {
			$.get("/addftp/" + command, function(data) {
				var command = data.data[0].status;
				if(command == "ok") {
					console.log("SFDL Datei (" + data.data[0].msg + ") erfolgreich hochgeladen!");
				} else {
					console.error("Fehler: " + data.data[0].msg);
				}
			});
		}
	});
	
	$(".button_upload").click(function() {
		$('input[type=file]').trigger('click');
	});

	$('input[type=file]').change(function() {
		var fileup = $(this).val();
		fileup = fileup.length ? fileup.split('\\').pop() : '';
		
		var data = new FormData();
		data.append("sfdl", this.files[0], fileup);
		
		$.ajax({
			url: '/file',
			data: data,
			cache: false,
			contentType: false,
			processData: false,
			type: 'POST',
			success: function(data) {
				var status = data.data[0].upload;
				if(status == "ok") {
					alert("SFDL Datei (" + data.data[0].sfdl + ") erfolgreich hochgeladen!");
				} else {
					alert("Fehler: " + data.data[0].sfdl);
				}
			}
		});
	});
	
	loadData();
	loadSFDLFiles();
	
	// Reload SFDL files list every 5 seconds
	setInterval(loadSFDLFiles, 5000);
});
function startLoader() {
	var usrpass = prompt("Bitte Passwort zum Starten eingeben", "");
	if(usrpass) {
		$.ajax({
			url: "/start/" + usrpass,
			type: "GET",
			success: function(data) {
				var command = data.data[0].start;
				if(command == "ok") {
					console.log("Erfolgreich gestartet!");
				} else {
					alert("Fehler: " + command);
				}
			},
			error: function(xhr) {
				alert(xhr.status == 403 ? "Fehler: Falsches Passwort" : "Fehler: " + xhr.status + " - " + xhr.statusText);
			}
		});
	}
}

function shutdownServer() {
	if(!confirm("Möchten Sie den Webserver wirklich beenden?")) {
		return;
	}
	
	var usrpass = prompt("Bitte Passwort zum Beenden des Webservers eingeben", "");
	if(usrpass) {
		$.ajax({
			url: "/shutdown/" + usrpass,
			type: "GET",
			success: function(data) {
				var command = data.data[0].shutdown;
				if(command == "ok") {
					alert("Webserver wird beendet!");
					setTimeout(function() {
						document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#1f2937;color:white;font-family:sans-serif;"><div style="text-align:center;"><h1>Webserver beendet</h1><p>Der Webserver wurde erfolgreich heruntergefahren.</p></div></div>';
					}, 1000);
				} else {
					alert("Fehler: " + command);
				}
			},
			error: function(xhr) {
				alert(xhr.status == 403 ? "Fehler: Falsches Passwort" : "Fehler beim Beenden des Webservers");
			}
		});
	}
}

function loadSFDLFiles() {
	$.getJSON("files.json", function(data) {
		if(data.success && data.count > 0) {
			$('#sfdlFilesSection').removeClass('hidden');
			
			var html = '<div class="space-y-4">';
			var displayedCount = 0;
			
			for(var i = 0; i < data.files.length; i++) {
				var file = data.files[i];
				
				// Skip files that are currently being downloaded
				// Remove .sfdl extension from filename for comparison
				var fileNameWithoutExt = file.name.replace(/\.sfdl$/i, '');
				var isCurrentlyDownloading = false;
				
				// Check if this file is in the download queue
				for(var queueKey in downloadQueue) {
					if(queueKey === fileNameWithoutExt || queueKey === file.name) {
						isCurrentlyDownloading = true;
						break;
					}
				}
				
				// Skip this file if it's being downloaded
				if(isCurrentlyDownloading) {
					continue;
				}
				
				displayedCount++;
				
				var fileDate = new Date(file.modified * 1000);
				var dateStr = fileDate.toLocaleString('de-DE');
				
				// Create display name
				var displayName = file.name;
				
				// Extract tags from filename
				var tags = extractReleaseTags(file.name);
				
				// Calculate quality score (only for video content)
				var qualityScore = 0;
				var qualityBadge = '';
				if(file.media_type === 'movie' || file.media_type === 'tv' || file.media_type === 'doku' || file.media_type === 'unknown') {
					qualityScore = calculateQualityScore(file.name);
					if(qualityScore > 0) {
						var qualityColor = '';
						if(qualityScore >= 9) qualityColor = 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
						else if(qualityScore >= 7) qualityColor = 'bg-green-500/20 text-green-400 border-green-500/30';
						else if(qualityScore >= 5) qualityColor = 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
						else if(qualityScore >= 3) qualityColor = 'bg-orange-500/20 text-orange-400 border-orange-500/30';
						else qualityColor = 'bg-red-500/20 text-red-400 border-red-500/30';
						
						qualityBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ' + qualityColor + '" title="Qualit\u00e4tsindex basierend auf Aufl\u00f6sung, Quelle, Codec">Q: ' + qualityScore + '/10</span>';
					}
				}
			
				// Build media type badge
				var mediaTypeBadge = '';
				var tmdbLink = '';
				
				if(file.media_type == 'movie') {
					var yearInfo = file.year ? ' (' + file.year + ')' : '';
				var ratingInfo = (file.rating && file.rating > 0) ? ' • ⭐ ' + file.rating.toFixed(1) : '';
					// TMDB link for movies
					if(file.tmdb_id) {
						tmdbLink = '<a href="https://www.themoviedb.org/movie/' + file.tmdb_id + '?language=de" target="_blank" rel="noopener noreferrer" class="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md bg-[#01b4e4] hover:bg-[#0299c7] text-white transition-colors shadow-sm" title="Auf TMDB ansehen">';
						tmdbLink += 'TMDB';
						tmdbLink += '</a>';
					}
				} else if(file.media_type == 'tv') {
				var yearInfo = file.year ? ' (' + file.year + ')' : '';
				var ratingInfo = (file.rating && file.rating > 0) ? ' • ⭐ ' + file.rating.toFixed(1) : '';
				mediaTypeBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30">📺 Serie' + yearInfo + ratingInfo + '</span>';
					// TMDB link for TV series
					if(file.tmdb_id) {
						tmdbLink = '<a href="https://www.themoviedb.org/tv/' + file.tmdb_id + '?language=de" target="_blank" rel="noopener noreferrer" class="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md bg-[#01b4e4] hover:bg-[#0299c7] text-white transition-colors shadow-sm" title="Auf TMDB ansehen">';
						tmdbLink += 'TMDB';
						tmdbLink += '</a>';
					}
				} else if(file.media_type == 'doku') {
					// Documentary content
					var yearInfo = file.year ? ' (' + file.year + ')' : '';
				var ratingInfo = (file.rating && file.rating > 0) ? ' • ⭐ ' + file.rating.toFixed(1) : '';
				mediaTypeBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30">📚 Dokumentation' + yearInfo + ratingInfo + '</span>';
				
				// TMDB link for documentaries (treated as movies in TMDB)
					if(file.tmdb_id) {
						tmdbLink = '<a href="https://www.themoviedb.org/movie/' + file.tmdb_id + '?language=de" target="_blank" rel="noopener noreferrer" class="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md bg-[#01b4e4] hover:bg-[#0299c7] text-white transition-colors shadow-sm" title="Auf TMDB ansehen">';
						tmdbLink += 'TMDB';
						tmdbLink += '</a>';
					}
				} else if(file.media_type == 'other') {
					// Non-video content (Software, Games, etc.)
					mediaTypeBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-500/20 text-gray-400 border border-gray-500/30">📦 Sonstiges</span>';
				} else if(file.media_type == 'unknown') {
					// Show selection buttons for unknown type
					mediaTypeBadge = '<div class="inline-flex gap-1">';
					mediaTypeBadge += '<button onclick="setMediaType(\'' + escapeHtml(file.name) + '\', \'movie\')" class="px-2 py-1 rounded text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors">🎬 Film</button>';
					mediaTypeBadge += '<button onclick="setMediaType(\'' + escapeHtml(file.name) + '\', \'tv\')" class="px-2 py-1 rounded text-xs font-medium bg-purple-600 hover:bg-purple-700 text-white transition-colors">📺 Serie</button>';
					mediaTypeBadge += '<button onclick="setMediaType(\'' + escapeHtml(file.name) + '\', \'doku\')" class="px-2 py-1 rounded text-xs font-medium bg-green-600 hover:bg-green-700 text-white transition-colors">📚 Doku</button>';
					mediaTypeBadge += '</div>';
				}
				
				// Build card
				html += '<div class="bg-gradient-to-br from-gray-800/50 to-gray-800/30 backdrop-blur-sm rounded-xl p-5 border border-gray-700/50 hover:border-gray-600/50 transition-all duration-300 shadow-lg hover:shadow-xl">';
				html += '<div class="flex items-start justify-between gap-4">';
				
                // Poster image (if available)
                if(file.poster_path && (file.media_type === 'movie' || file.media_type === 'tv' || file.media_type === 'doku')) {
                    html += '<div class="flex-shrink-0">';
                    html += '<img src="https://image.tmdb.org/t/p/w185' + file.poster_path + '" alt="Cover" class="w-16 h-24 object-cover rounded-lg shadow-md" onerror="this.style.display=\'none\'">';
                    html += '</div>';
                }
                
                // Left side - Content
                html += '<div class="flex-1 min-w-0 space-y-3">';
				
				// Title row
				html += '<div class="flex items-center gap-3 flex-wrap">';
				html += '<h3 class="text-base font-semibold text-white truncate">' + escapeHtml(displayName) + '</h3>';
				if(mediaTypeBadge) {
					html += mediaTypeBadge;
				}
				if(qualityBadge) {
					html += qualityBadge;
				}
				html += '</div>';
				
				// Release tags
				if(tags.length > 0) {
					html += '<div class="flex flex-wrap gap-1.5">';
					tags.forEach(function(tag) {
						html += '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ' + tag.color + '">';
						html += tag.text;
						html += '</span>';
					});
					html += '</div>';
				}
				
				// File metadata
				html += '<div class="flex items-center gap-3 text-xs text-gray-400">';
				html += '<span class="flex items-center gap-1">';
				html += '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>';
				html += b2h(file.size, 2);
				html += '</span>';
				html += '<span class="flex items-center gap-1">';
				html += '<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
				html += dateStr;
				html += '</span>';
				html += '</div>';
				
				html += '</div>';
				
				// Right side - Action buttons
				html += '<div class="flex-shrink-0 flex gap-2">';
				if(tmdbLink) {
					html += tmdbLink;
				}
				html += '<button onclick="deleteSFDLFile(\'' + file.name.replace(/'/g, "\\'") + '\')" class="group px-3 py-2 rounded-lg text-xs font-medium bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30 hover:border-red-600/50 transition-all duration-200" title="Datei löschen">';
				html += '<svg class="w-4 h-4 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>';
				html += '</button>';
				html += '</div>';
				
				html += '</div>';
				html += '</div>';
			}
			html += '</div>';
			
			// Update count to show only displayed files
			if(displayedCount > 0) {
				html += '<div class="mt-6 text-sm text-gray-400 text-center">Gesamt: ' + displayedCount + ' Datei(en)';
				if(displayedCount < data.count) {
					html += ' (' + (data.count - displayedCount) + ' im Download)';
				}
				html += '</div>';
			}
			
			$('#sfdlFilesList').html(html);
			
			// Hide section if no files are displayed
			if(displayedCount === 0) {
				$('#sfdlFilesSection').addClass('hidden');
			}
		} else {
			$('#sfdlFilesSection').addClass('hidden');
		}
	}).fail(function() {
		$('#sfdlFilesSection').addClass('hidden');
	});
}

function b2h(bytes, precision) {
	var kilobyte = 1024;
	var megabyte = kilobyte * 1024;
	var gigabyte = megabyte * 1024;
	var terabyte = gigabyte * 1024;
	
	if ((bytes >= 0) && (bytes < kilobyte)) {
		return bytes + ' B';
 
	} else if ((bytes >= kilobyte) && (bytes < megabyte)) {
		return (bytes / kilobyte).toFixed(precision) + ' KB';
 
	} else if ((bytes >= megabyte) && (bytes < gigabyte)) {
		return (bytes / megabyte).toFixed(precision) + ' MB';
 
	} else if ((bytes >= gigabyte) && (bytes < terabyte)) {
		return (bytes / gigabyte).toFixed(precision) + ' GB';
	} else if (bytes >= terabyte) {
		return (bytes / terabyte).toFixed(precision) + ' TB';
 
	} else {
		return bytes + ' B';
	}
}

function setMediaType(filename, mediaType) {
	if(!confirm('Media Type auf "' + (mediaType === 'movie' ? 'Film' : 'Serie') + '" setzen?')) {
		return;
	}
	
	$.ajax({
		url: '/update_media_type',
		type: 'POST',
		contentType: 'application/json',
		data: JSON.stringify({
			filename: filename,
			media_type: mediaType
		}),
		success: function(data) {
			if(data.success) {
				loadSFDLFiles();
			} else {
				alert('Fehler beim Aktualisieren: ' + (data.error || 'Unbekannter Fehler'));
			}
		},
		error: function() {
			alert('Fehler beim Aktualisieren des Media Types');
		}
	});
}

function deleteSFDLFile(filename) {
	if(!confirm('M\u00f6chten Sie die Datei "' + filename + '" wirklich l\u00f6schen?')) {
		return;
	}
	
	$.ajax({
		url: '/delete_sfdl',
		type: 'POST',
		contentType: 'application/json',
		data: JSON.stringify({
			filename: filename
		}),
		success: function(data) {
			if(data.success) {
				console.log('Datei erfolgreich gel\u00f6scht: ' + filename);
				loadSFDLFiles();
			} else {
				alert('Fehler beim L\u00f6schen: ' + (data.error || 'Unbekannter Fehler'));
			}
		},
		error: function() {
			alert('Fehler beim L\u00f6schen der Datei');
		}
	});
}
function escapeHtml(text) {
	if (!text) return '';
	var div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

// Extract release tags from filename
function extractReleaseTags(filename) {
	if (!filename) return [];
	
	var tags = [];
	var name = filename.toUpperCase();
	
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
	
	var name = filename.toUpperCase();
	var score = 5; // Basis-Score
	
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
	else if (name.includes('WEBRIP') || name.includes('.WEB.')) score += 0.75;
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
