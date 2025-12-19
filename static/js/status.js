$(document).ready(function()
{
	var loader_beendet = false;
	var www_beendet = false;
	var refTimer;
	var lastprozent = 0;
	
	function b2h(bytes, precision)
	{
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
	
	function loadData()
	{
		$.getJSON("status.json", function(data)
		{
			var version = data.data[0].version;
			var status = data.data[0].status;
			var date = data.data[0].date;
			var datetime = data.data[0].datetime;
			var sfdl = data.data[0].sfdl;
			var action = data.data[0].action;
			var media_type = data.data[0].media_type || 'unknown';
			var loading_mt_files = data.data[0].loading_mt_files;
			var loading_total_files = data.data[0].loading_total_files;
			var loading = data.data[0].loading;
			var loading_file_array = data.data[0].loading_file_array;
			
			if(www_beendet == false)
			{
				$(".button_sfdl_link").prop("disabled", false);
				$(".button_ftp").prop("disabled", false);
				$(".button_upload").prop("disabled", false);
				$(".button_kill").prop("disabled", false);
			}
			
			if(loader_beendet == false)
			{
				if(status == "done")
				{
					$(".button_start").prop("disabled", false);
					$(".button_stop").prop("disabled", true);
				}
				else
				{
					$(".button_start").prop("disabled", true);
					$(".button_stop").prop("disabled", false);
				}
			}
			else
			{
				$(".button_start").prop("disabled", false);
				$(".button_stop").prop("disabled", true);
			}
			
			$('.title').html("SFDL-Medialoader v" + version);
			if(action == "NULL")
			{
				action = "done"
			}
			
			// Format datetime to German locale
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
			} catch(e) {
				// Keep original if parsing fails
			}
			
			$('.info').html("Status: <b>" + status + "</b> | Letzte Aktivit&auml;t: <b>" + formattedDate + "</b>");
			
			// Add media type badge
			var mediaTypeBadge = '';
			if(media_type == 'movie') {
				var yearInfo = data.data[0].media_year ? ' (' + data.data[0].media_year + ')' : '';
				mediaTypeBadge = '<span class="ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500 text-white">🎬 Film' + yearInfo + '</span>';
			} else if(media_type == 'tv') {
				var seriesInfo = '';
				if(data.data[0].media_seasons || data.data[0].media_episodes) {
					var seasons = data.data[0].media_seasons || '?';
					var episodes = data.data[0].media_episodes || '?';
					seriesInfo = ' (' + seasons + ' Staffeln, ' + episodes + ' Episoden)';
				}
				mediaTypeBadge = '<span class="ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500 text-white">📺 Serie' + seriesInfo + '</span>';
			}
			
			if(action == "loading")
			{
				// Show loader section when loading starts
				$('#loaderSection').removeClass('hidden');
				
				if(sfdl.length > 75)
				{
					sfdl = sfdl.substring(0,75);
					sfdl += "...";
				}
			
				$('.loader_head h2').html('Download Status: <span class="text-green-400">' + sfdl + '</span>' + mediaTypeBadge);
				
				// Update files info line (replace, don't append!)
				var filesInfoHtml = '<p class="text-sm text-gray-300 mt-2">Insgesamt werden <b>' + loading_total_files + '</b> Dateien geladen und davon immer <b>' + loading_mt_files + '</b> gleichzeitig.</p>';
				// Remove old info line if exists
				$('.loader_head p').remove();
				// Add new one
				$('.loader_head').append(filesInfoHtml);
				
				var load_arr = loading.split("|");
				var progproz = load_arr[3];
				if(!progproz)
				{
					progproz = 0;
				}
				
				// Update progress bar
				$('.progress-bar').css('width', progproz + '%');
				$('.progress-percent').text(progproz + '%');
				
				// Update stats
				$('.download-size').text(b2h(load_arr[1] * 1024, 2) + ' / ' + b2h(load_arr[2] * 1024, 2));
				$('.download-speed').text(load_arr[4] + ' MB/s');
				$('.download-time').text(load_arr[5] || '00:00:00');
				
				// Calculate ETA
				var remaining = (load_arr[2] - load_arr[1]) * 1024; // KB to bytes
				var speed_bytes = parseFloat(load_arr[4]) * 1024 * 1024; // MB/s to bytes/s
				var eta_seconds = speed_bytes > 0 ? Math.round(remaining / speed_bytes) : 0;
				var eta_hours = Math.floor(eta_seconds / 3600);
				var eta_mins = Math.floor((eta_seconds % 3600) / 60);
				var eta_secs = eta_seconds % 60;
				var eta_str = String(eta_hours).padStart(2, '0') + ':' + String(eta_mins).padStart(2, '0') + ':' + String(eta_secs).padStart(2, '0');
				$('.download-eta').text(eta_str);
				
				// Update files list
				$('.files-container').html("");
				var files_arr = loading_file_array.split(";");
				for(var i = 0; i < files_arr.length; i++)
				{
					var files_split = files_arr[i].split("|");
					var filename = files_split[0];
					var filesize = parseInt(files_split[1]) || 0;
					var downloaded = files_split[2] == "NULL" ? 0 : parseInt(files_split[2]) || 0;
					var prozent = filesize > 0 ? Math.round((downloaded / filesize) * 100) : 0;
					
					if(filename.length > 60)
					{
						filename = filename.substring(0,57) + "...";
					}
					
					var fileHtml = '<div class="bg-gray-800/50 rounded-lg p-3 border border-gray-700">';
					fileHtml += '<div class="flex items-center justify-between mb-2">';
					fileHtml += '<div class="flex-1 min-w-0">';
					fileHtml += '<div class="text-sm font-medium text-white truncate">' + filename + '</div>';
					fileHtml += '<div class="text-xs text-gray-400 mt-1">' + b2h(downloaded, 2) + ' / ' + b2h(filesize, 2) + '</div>';
					fileHtml += '</div>';
					fileHtml += '<div class="text-sm font-semibold text-green-400 ml-4">' + prozent + '%</div>';
					fileHtml += '</div>';
					fileHtml += '<div class="w-full bg-gray-700 rounded-full h-2 overflow-hidden">';
					fileHtml += '<div class="h-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all duration-300" style="width: ' + prozent + '%"></div>';
					fileHtml += '</div>';
					fileHtml += '</div>';
					
					$('.files-container').append(fileHtml);
				}
			}
			else if(action.startsWith("Entpacke Archive"))
			{
				// Show extracting status
				$('#loaderSection').removeClass('hidden');
				
				if(sfdl.length > 75)
				{
					sfdl = sfdl.substring(0,75);
					sfdl += "...";
				}
			
				$('.loader_head h2').html('Entpacke: <span class="text-yellow-400">' + sfdl + '</span>' + mediaTypeBadge);
				
				// Update action message
				var extractInfoHtml = '<p class="text-sm text-gray-300 mt-2">' + action + '</p>';
				$('.loader_head p').remove();
				$('.loader_head').append(extractInfoHtml);
				
				// Show pulsing progress bar for extraction
				$('.progress-bar').css('width', '100%');
				$('.progress-bar').addClass('animate-pulse');
				$('.progress-percent').text('Entpacken...');
				
				// Hide download stats, show extraction message
				$('.download-size').text('-');
				$('.download-speed').text('-');
				$('.download-time').text('-');
				$('.download-eta').text('-');
				
				// Clear files list during extraction
				$('.files-container').html('<div class="bg-gray-800/50 rounded-lg p-6 text-center border border-yellow-500/30"><div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400 mb-3"></div><div class="text-yellow-400 font-medium">' + action + '</div></div>');
			}
			else
			{
				if(action == "done")
				{
					// Hide loader section when done
					$('#loaderSection').addClass('hidden');
					$('.info').html("Status: <b>BEREIT</b>");
				}
				else
				{
					$('.loader_head h2').html(action);
				}
			}
		});
	
		refTimer = setTimeout(loadData, 1000);
	}
	
	$(".button_start").click(function() {
		var usrpass = prompt("Bitte Passwort zum Starten des SFDL-Loaders v1 eingeben", "");
		if(usrpass)
		{
			$.get("/start/" + usrpass, function(data) {
				var command = data.data[0].start
				if(command == "ok")
				{
					loader_beendet = false;
					
					console.log("SFDL-Loader v1 erfolgreich gestartet!");
				}
				else
				{
					alert("Fehler: " + command);
				}
			});
		}
	});
	
	$(".button_stop").click(function() {
		var usrpass = prompt("Bitte Passwort zum Beenden des SFDL-Loaders v1 eingeben", "");
		if(usrpass)
		{
			$.get("/stop/" + usrpass, function(data) {
				var command = data.data[0].stop
				if(command == "ok")
				{
					loader_beendet = true;
					
					$(".button_start").prop("disabled", false);
					$(".button_stop").prop("disabled", true);
				
					console.log("SFDL-Loader v1 erfolgreich beendet!");
				}
				else
				{
					console.error("Fehler: " + command);
				}
			});
		}
	});
	
	$(".button_kill").click(function() {
		var usrpass = prompt("Bitte Passwort zum Beenden des Webservers eingeben", "");
		if(usrpass)
		{
			$.get("/kill/" + usrpass, function(data) {
				var command = data.data[0].kill
				if(command == "ok")
				{	
					www_beendet = true;
					
					$(".button_start").prop("disabled", true);
					$(".button_stop").prop("disabled", true);
					$(".button_kill").prop("disabled", true);
					$(".button_sfdl_link").prop("disabled", true);
					$(".button_ftp").prop("disabled", true);
					$(".button_upload").prop("disabled", true);
				
					alert("SFDL-Loader v1 Webserver beendet!");
					
					clearTimeout(refTimer);
				}
				else
				{
					console.error("Fehler: " + command);
				}
			});
		}
	});
	
	$(".button_sfdl_link").click(function() {
		var command = prompt("Bitte Link zur SFDL Datei eingeben", "");
		if(command)
		{
			$.get("/upload/" + command, function(data) {
				var command = data.data[0].upload
				if(command == "ok")
				{
					console.log("SFDL Datei (" + data.data[0].sfdl + ") erfolgreich hochgeladen!");
				}
				else
				{
					console.error("Fehler: " + data.data[0].sfdl);
				}
			});
		}
	});
	
	$(".button_ftp").click(function() {
		var command = prompt("Bitte FTP URL eingeben", "");
		if(command)
		{
			$.get("/addftp/" + command, function(data) {
				var command = data.data[0].status
				if(command == "ok")
				{
					console.log("SFDL Datei (" + data.data[0].msg + ") erfolgreich hochgeladen!");
				}
				else
				{
					console.error("Fehler: " + data.data[0].msg);
				}
			});
		}
	});
	
	$(".button_upload").click(function() {
		$('input[type=file]').trigger('click');
	});

	$('input[type=file]').change(function() {
		var fileup = $(this).val(), fileup = fileup.length ? fileup.split('\\').pop() : '';
		
		// console.log("SFDL Upload: " + fileup);
		
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
				if(status == "ok")
				{
					alert("SFDL Datei (" + data.data[0].sfdl + ") erfolgreich hochgeladen!");
				}
				else
				{
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
// Global function for start button
function startLoader() {
	var usrpass = prompt("Bitte Passwort zum Starten des SFDL-Loaders v1 eingeben", "");
	if(usrpass)
	{
		$.get("/start/" + usrpass, function(data) {
			var command = data.data[0].start
			if(command == "ok")
			{
				alert("SFDL-Loader v1 erfolgreich gestartet!");
				// Show loader section
				$('#loaderSection').removeClass('hidden');
			}
			else
			{
				alert("Fehler: " + command);
			}
		});
	}
}

// Global function to shutdown server
function shutdownServer() {
	if(!confirm("Möchten Sie den Webserver wirklich beenden?")) {
		return;
	}
	
	var usrpass = prompt("Bitte Passwort zum Beenden des Webservers eingeben", "");
	if(usrpass)
	{
		$.get("/shutdown/" + usrpass, function(data) {
			var command = data.data[0].shutdown
			if(command == "ok")
			{
				alert("Webserver wird beendet!");
				// Redirect to a goodbye page or close
				setTimeout(function() {
					document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#1f2937;color:white;font-family:sans-serif;"><div style="text-align:center;"><h1>Webserver beendet</h1><p>Der Webserver wurde erfolgreich heruntergefahren.</p></div></div>';
				}, 1000);
			}
			else
			{
				alert("Fehler: " + command);
			}
		}).fail(function() {
			alert("Fehler beim Beenden des Webservers");
		});
	}
}

// Global function to load SFDL files list
function loadSFDLFiles()
{
	$.getJSON("files.json", function(data)
	{
		if(data.success && data.count > 0)
		{
			// Show SFDL files section if files exist
			$('#sfdlFilesSection').removeClass('hidden');
			
			var html = '<div class="space-y-2">';
			for(var i = 0; i < data.files.length; i++)
			{
				var file = data.files[i];
				var fileDate = new Date(file.modified * 1000);
				var dateStr = fileDate.toLocaleString('de-DE');
				
				// Media type badge
				var mediaTypeBadge = '';
				if(file.media_type == 'movie') {
					var yearInfo = file.year ? ' (' + file.year + ')' : '';
					mediaTypeBadge = '<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-500 text-white">🎬 Film' + yearInfo + '</span>';
				} else if(file.media_type == 'tv') {
					var seriesInfo = '';
					if(file.seasons || file.episodes) {
						var seasons = file.seasons || '?';
						var episodes = file.episodes || '?';
						seriesInfo = ' (' + seasons + ' Staffeln, ' + episodes + ' Episoden)';
					}
					mediaTypeBadge = '<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-500 text-white">📺 Serie' + seriesInfo + '</span>';
				} else if(file.media_type == 'unknown') {
					// Show selection buttons for unknown type
					mediaTypeBadge = '<div class="inline-flex gap-1">';
					mediaTypeBadge += '<button onclick="setMediaType(\'' + file.name + '\', \'movie\')" class="px-2 py-1 rounded text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors">🎬 Film</button>';
					mediaTypeBadge += '<button onclick="setMediaType(\'' + file.name + '\', \'tv\')" class="px-2 py-1 rounded text-xs font-medium bg-purple-600 hover:bg-purple-700 text-white transition-colors">📺 Serie</button>';
					mediaTypeBadge += '</div>';
				}
				
				html += '<div class="bg-gray-700/50 rounded-lg p-3 flex items-center justify-between">';
				html += '<div class="flex items-center space-x-3 flex-1">';
				html += '<svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">';
				html += '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>';
				html += '</svg>';
				html += '<div class="flex-1">';
				html += '<div class="font-medium text-white">' + file.name + '</div>';
				html += '<div class="text-xs text-gray-400">' + b2h(file.size, 2) + ' • ' + dateStr + '</div>';
				html += '</div>';
				if(mediaTypeBadge) {
					html += '<div class="ml-2">' + mediaTypeBadge + '</div>';
				}
				html += '</div>';
				html += '</div>';
			}
			html += '</div>';
			html += '<div class="mt-3 text-sm text-gray-400">Gesamt: ' + data.count + ' Datei(en)</div>';
			
			$('#sfdlFilesList').html(html);
		}
		else
		{
			// Hide section if no files
			$('#sfdlFilesSection').addClass('hidden');
		}
	}).fail(function() {
		$('#sfdlFilesSection').addClass('hidden');
	});
}

// Helper function for byte to human readable conversion (global)
function b2h(bytes, precision)
{
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
		return (bytes / terabyte).toFixed(precision) + ' GB';
 
	} else if (bytes >= terabyte) {
		return (bytes / terabyte).toFixed(precision) + ' TB';
 
	} else {
		return bytes + ' B';
	}
}

// Global function to set media type manually
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
				// Reload file list
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

