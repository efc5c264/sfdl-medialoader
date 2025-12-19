// Modal control functions
function openUploadModal() {
	document.getElementById('uploadModal').classList.remove('hidden');
	// Reset to URL tab
	switchModalTab('url');
}

function closeUploadModal() {
	document.getElementById('uploadModal').classList.add('hidden');
	// Clear inputs
	document.getElementById('modal-sfdl-url').value = '';
	clearModalFileSelection();
	document.getElementById('modal-text-filename').value = '';
	document.getElementById('modal-text-content').value = '';
}

// Tab switching for modal
function switchModalTab(tabName) {
	// Hide all tab contents
	document.querySelectorAll('.modal-tab-content').forEach(content => {
		content.classList.add('hidden');
	});
	
	// Remove active state from all buttons
	document.querySelectorAll('.modal-tab-button').forEach(button => {
		button.classList.remove('bg-gradient-to-r', 'from-gray-700', 'to-gray-600', 'text-white', 'border-b-2', 'border-purple-500', 'border-blue-500', 'border-green-500');
		button.classList.add('bg-gray-800/50', 'text-gray-400', 'hover:bg-gray-700/50');
	});
	
	// Show selected tab
	const selectedContent = document.getElementById(`modal-${tabName}-tab`);
	const buttons = document.querySelectorAll('.modal-tab-button');
	
	if (selectedContent) {
		selectedContent.classList.remove('hidden');
		
		// Activate corresponding button
		let buttonIndex = 0;
		let borderColor = 'border-purple-500';
		
		if (tabName === 'url') {
			buttonIndex = 0;
			borderColor = 'border-purple-500';
		} else if (tabName === 'file') {
			buttonIndex = 1;
			borderColor = 'border-blue-500';
		} else if (tabName === 'text') {
			buttonIndex = 2;
			borderColor = 'border-green-500';
		}
		
		if (buttons[buttonIndex]) {
			buttons[buttonIndex].classList.remove('bg-gray-800/50', 'text-gray-400', 'hover:bg-gray-700/50');
			buttons[buttonIndex].classList.add('bg-gradient-to-r', 'from-gray-700', 'to-gray-600', 'text-white', 'border-b-2', borderColor);
		}
	}
}

// URL Download
function uploadFromUrl() {
	const url = document.getElementById('modal-sfdl-url').value.trim();
	const button = document.getElementById('modal-url-button-text');
	
	if (!url) {
		console.log('Bitte geben Sie eine URL ein');
		return;
	}
	
	button.textContent = 'Lädt...';
	
	fetch('/download_sfdl_url', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ url: url })
	})
	.then(response => response.json())
	.then(data => {
		if (data.success) {
			console.log('SFDL erfolgreich heruntergeladen: ' + data.filename);
			document.getElementById('modal-sfdl-url').value = '';
			loadSFDLFiles(); // Reload file list
			closeUploadModal();
		} else {
			console.error('Fehler: ' + (data.error || 'Unbekannter Fehler'));
		}
	})
	.catch(error => {
		console.error('Fehler beim Herunterladen: ' + error);
	})
	.finally(() => {
		button.textContent = 'SFDL herunterladen';
	});
}

// File Upload
let modalSelectedFile = null;

const modalDropZone = document.getElementById('modal-drop-zone');
const modalFileInput = document.getElementById('modal-file-input');

// Click to select file
modalDropZone.addEventListener('click', () => {
	modalFileInput.click();
});

// File input change
modalFileInput.addEventListener('change', (e) => {
	if (e.target.files.length > 0) {
		handleModalFile(e.target.files[0]);
	}
});

// Drag and drop
modalDropZone.addEventListener('dragover', (e) => {
	e.preventDefault();
	modalDropZone.classList.add('border-blue-500', 'bg-blue-500/10');
});

modalDropZone.addEventListener('dragleave', (e) => {
	e.preventDefault();
	modalDropZone.classList.remove('border-blue-500', 'bg-blue-500/10');
});

modalDropZone.addEventListener('drop', (e) => {
	e.preventDefault();
	modalDropZone.classList.remove('border-blue-500', 'bg-blue-500/10');
	
	if (e.dataTransfer.files.length > 0) {
		handleModalFile(e.dataTransfer.files[0]);
	}
});

function handleModalFile(file) {
	if (!file.name.endsWith('.sfdl')) {
		console.log('Bitte nur .sfdl Dateien hochladen');
		return;
	}
	
	modalSelectedFile = file;
	
	// Show file info
	document.getElementById('modal-file-info').classList.remove('hidden');
	document.getElementById('modal-selected-filename').textContent = file.name;
	document.getElementById('modal-selected-filesize').textContent = formatFileSize(file.size);
	
	// Enable upload button
	document.getElementById('modal-upload-button').disabled = false;
}

function clearModalFileSelection() {
	modalSelectedFile = null;
	modalFileInput.value = '';
	document.getElementById('modal-file-info').classList.add('hidden');
	document.getElementById('modal-upload-button').disabled = true;
}

function uploadModalFile() {
	if (!modalSelectedFile) {
		console.log('Bitte wählen Sie eine Datei aus');
		return;
	}
	
	const buttonText = document.getElementById('modal-file-button-text');
	buttonText.textContent = 'Lädt hoch...';
	
	const formData = new FormData();
	formData.append('file', modalSelectedFile);
	
	fetch('/upload', {
		method: 'POST',
		body: formData
	})
	.then(response => response.json())
	.then(data => {
		if (data.success) {
			console.log('Datei erfolgreich hochgeladen: ' + data.filename);
			clearModalFileSelection();
			loadSFDLFiles(); // Reload file list
			closeUploadModal();
		} else {
			console.error('Fehler: ' + (data.error || 'Unbekannter Fehler'));
		}
	})
	.catch(error => {
		console.error('Fehler beim Hochladen: ' + error);
	})
	.finally(() => {
		buttonText.textContent = 'Hochladen';
	});
}

// Text Upload
function uploadModalText() {
	const filename = document.getElementById('modal-text-filename').value.trim();
	const content = document.getElementById('modal-text-content').value.trim();
	const buttonText = document.getElementById('modal-text-button-text');
	
	if (!filename) {
		console.log('Bitte geben Sie einen Dateinamen ein');
		return;
	}
	
	if (!content) {
		console.log('Bitte geben Sie SFDL Inhalt ein');
		return;
	}
	
	buttonText.textContent = 'Speichert...';
	
	// Create a blob and upload as multipart form
	const blob = new Blob([content], { type: 'text/plain' });
	const formData = new FormData();
	formData.append('file', blob, filename.endsWith('.sfdl') ? filename : filename + '.sfdl');
	
	fetch('/upload', {
		method: 'POST',
		body: formData
	})
	.then(response => response.json())
	.then(data => {
		if (data.success) {
			console.log('SFDL erfolgreich gespeichert: ' + data.filename);
			document.getElementById('modal-text-filename').value = '';
			document.getElementById('modal-text-content').value = '';
			loadSFDLFiles(); // Reload file list
			closeUploadModal();
		} else {
			console.error('Fehler: ' + (data.error || 'Unbekannter Fehler'));
		}
	})
	.catch(error => {
		console.error('Fehler beim Speichern: ' + error);
	})
	.finally(() => {
		buttonText.textContent = 'Speichern';
	});
}

// Helper function
function formatFileSize(bytes) {
	if (bytes === 0) return '0 Bytes';
	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Close modal with ESC key
document.addEventListener('keydown', (e) => {
	if (e.key === 'Escape') {
		closeUploadModal();
	}
});
