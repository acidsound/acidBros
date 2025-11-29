import { Data } from '../data/Data.js';

export const FileManager = {
    STORAGE_KEY: 'acidbros_files',
    CURRENT_FILE_KEY: 'acidbros_current_file',
    currentFileId: null,

    init() {
        // Load file list from localStorage
        const files = this.getFileList();

        if (files.length > 0) {
            // Try to restore the last working file
            const lastFileId = localStorage.getItem(this.CURRENT_FILE_KEY);
            const lastFile = files.find(f => f.id === lastFileId) || files[0];

            if (lastFile) {
                // Restore state from last file but start as NEW session
                Data.importState(lastFile.data);
                this.currentFileId = null;
                // Do NOT save automatically. User must click Save.
            }
        }
    },

    getFileList() {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    },

    saveFileList(files) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(files));
    },

    generateFileName() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day}${hours}${minutes}${seconds}`;
    },

    save() {
        try {
            const state = Data.exportState();
            const files = this.getFileList();

            if (this.currentFileId) {
                // Update existing file
                const index = files.findIndex(f => f.id === this.currentFileId);
                if (index !== -1) {
                    files[index].data = state;
                    files[index].modified = Date.now();
                } else {
                    // Critical fallback: File ID exists in memory but not in storage list.
                    // This can happen if storage was cleared or out of sync.
                    // Re-create the file entry to prevent data loss.
                    console.warn('FileManager: Current file not found in list, recovering...');
                    const recoveredFile = {
                        id: this.currentFileId,
                        name: this.generateFileName() + ' (recovered)',
                        data: state,
                        created: Date.now(),
                        modified: Date.now()
                    };
                    files.unshift(recoveredFile);
                }
            } else {
                // Create new file
                const newFile = {
                    id: Date.now().toString(),
                    name: this.generateFileName(),
                    data: state,
                    created: Date.now(),
                    modified: Date.now()
                };
                files.unshift(newFile);
                this.currentFileId = newFile.id;
            }

            this.saveFileList(files);
            localStorage.setItem(this.CURRENT_FILE_KEY, this.currentFileId);
            return this.currentFileId;
        } catch (e) {
            console.error('FileManager: Auto-save failed', e);
            return null;
        }
    },

    newFile() {
        this.currentFileId = null;
        Data.init();
        this.save();
        // save will set the CURRENT_FILE_KEY
    },

    loadFile(fileId) {
        const files = this.getFileList();
        const file = files.find(f => f.id === fileId);
        if (file) {
            this.currentFileId = fileId;
            localStorage.setItem(this.CURRENT_FILE_KEY, fileId);
            Data.importState(file.data);
            return true;
        }
        return false;
    },

    duplicateFile(fileId) {
        const files = this.getFileList();
        const file = files.find(f => f.id === fileId);
        if (file) {
            const newFile = {
                id: Date.now().toString(),
                name: file.name + ' (copy)',
                data: file.data,
                created: Date.now(),
                modified: Date.now()
            };
            files.unshift(newFile);
            this.saveFileList(files);
            return newFile.id;
        }
        return null;
    },

    deleteFile(fileId) {
        let files = this.getFileList();
        files = files.filter(f => f.id !== fileId);
        this.saveFileList(files);

        if (this.currentFileId === fileId) {
            this.currentFileId = null;
            if (files.length > 0) {
                this.loadFile(files[0].id);
            } else {
                this.newFile();
            }
        }
    },

    renameFile(fileId, newName) {
        const files = this.getFileList();
        const file = files.find(f => f.id === fileId);
        if (file) {
            file.name = newName;
            file.modified = Date.now();
            this.saveFileList(files);
            return true;
        }
        return false;
    },

    deleteAll() {
        if (confirm('Delete all files? This cannot be undone.')) {
            localStorage.removeItem(this.STORAGE_KEY);
            this.currentFileId = null;
            Data.init();
            // Do not save automatically on delete all
            return true;
        }
        return false;
    },

    exportAll() {
        const files = this.getFileList();
        const exportData = {
            version: 1,
            exported: Date.now(),
            files: files
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `acidbros-backup-${this.generateFileName()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    importAll(fileContent) {
        try {
            const importData = JSON.parse(fileContent);
            if (importData.version === 1 && Array.isArray(importData.files)) {
                const existingFiles = this.getFileList();
                const mergedFiles = [...importData.files, ...existingFiles];
                this.saveFileList(mergedFiles);
                return true;
            }
        } catch (e) {
            console.error('Import failed:', e);
        }
        return false;
    }
};
