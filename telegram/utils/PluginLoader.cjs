const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');
const chalk = require('../utils/chalkShim.cjs');

/**
 * PluginLoader untuk Telegram Bot
 * Auto-detect dan load handler files (commands, actions, hears)
 * 
 * Pattern yang didukung:
 * module.exports = (bot) => {
 *     bot.command('nama_command', async (ctx) => { ... });
 *     bot.action('action_name', async (ctx) => { ... });
 *     bot.hears(/regex/, async (ctx) => { ... });
 * }
 */

const TELEGRAM_ROOT = path.join(__dirname, '..');

/**
 * Purge module cache untuk reload
 * @param {string} filePath - Path file yang akan di-purge
 */
function purgeCache(filePath) {
    let resolved;
    try {
        resolved = require.resolve(filePath);
    } catch {
        return;
    }

    const mod = require.cache[resolved];
    if (!mod) return;

    delete require.cache[resolved];

    // Purge child modules dalam telegram folder
    for (const child of mod.children || []) {
        if (child.id.startsWith(TELEGRAM_ROOT) && require.cache[child.id]) {
            purgeCache(child.id);
        }
    }
}

class TelegramPluginLoader {
    constructor() {
        this.files = {}; // Track loaded files
        this.folders = []; // Folders to scan
        this.bot = null; // Bot instance
        this.watcher = null; // File watcher
    }

    /**
     * Scan folder untuk file .js
     * @param {string} folder - Path folder
     * @returns {Array<string>} Array of file paths
     */
    _scanFiles(folder) {
        const files = [];
        
        if (!fs.existsSync(folder)) {
            console.warn(chalk.yellow(`[WARN] Folder tidak ditemukan: ${folder}`));
            return files;
        }

        const entries = fs.readdirSync(folder);
        
        for (const entry of entries) {
            const fullPath = path.join(folder, entry);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                // Recursive scan subdirectories
                files.push(...this._scanFiles(fullPath));
            } else if (stat.isFile() && (entry.endsWith('.js') || entry.endsWith('.cjs'))) {
                files.push(fullPath);
            }
        }

        return files;
    }

    /**
     * Load single file handler
     * @param {string} filePath - Path file handler
     */
    _loadFile(filePath) {
        purgeCache(filePath);

        // Unload dulu jika sudah pernah diload
        if (this.files[filePath]) {
            delete this.files[filePath];
        }

        try {
            const handler = require(filePath);

            // Validate handler format
            if (typeof handler !== 'function') {
                console.warn(
                    chalk.yellow(`[WARN] Skip `) +
                    chalk.cyan(path.basename(filePath)) +
                    chalk.yellow(` - Export harus berupa function(bot)`)
                );
                return;
            }

            // Execute handler untuk register ke bot
            handler(this.bot);

            // Mark as loaded
            this.files[filePath] = true;

            const fileName = path.basename(filePath);
            const folderName = path.basename(path.dirname(filePath));

            // console.log(
            //     chalk.green(`[✓] Loaded `) +
            //     chalk.cyan(`${folderName}/${fileName}`)
            // );

        } catch (err) {
            console.error(
                chalk.red(`[✗] Error loading `) +
                chalk.cyan(path.basename(filePath)) +
                chalk.red(`: ${err.message}`)
            );
            if (process.env.NODE_ENV === 'development') {
                console.error(chalk.gray(err.stack));
            }
        }
    }

    /**
     * Unload file handler
     * @param {string} filePath - Path file handler
     */
    _unloadFile(filePath) {
        if (this.files[filePath]) {
            delete this.files[filePath];
            
            console.log(
                chalk.gray(`[-] Unloaded `) +
                chalk.cyan(path.basename(filePath))
            );
        }
    }

    /**
     * Reload semua handlers
     * @param {string} changedFile - File yang berubah (untuk logging)
     */
    _reloadAll(changedFile) {
        const rel = path.relative(TELEGRAM_ROOT, changedFile);
        
        console.log(
            chalk.red(`\n[↻] Dependency changed: `) +
            chalk.cyan(rel) +
            chalk.yellow(` → reloading all handlers...`)
        );

        // Note: Untuk Telegraf, kita tidak bisa unregister handlers
        // Jadi kita hanya log peringatan bahwa perlu restart manual
        console.log(
            chalk.yellow(`[!] Telegram bot memerlukan restart manual untuk reload handlers.`)
        );
        console.log(
            chalk.yellow(`[!] Ketik 'rs' atau restart proses untuk apply changes.`)
        );
    }

    /**
     * Load handlers dari folder
     * @param {Telegraf} bot - Instance Telegraf bot
     * @param {string} folder - Folder path
     */
    loadHandlers(bot, folder) {
        this.bot = bot;
        
        if (!this.folders.includes(folder)) {
            this.folders.push(folder);
        }

        const files = this._scanFiles(folder);

        // console.log(chalk.blue(`\n[📂] Loading dari: ${path.relative(TELEGRAM_ROOT, folder)}`));

        if (files.length === 0) {
            // console.log(chalk.gray(`    Tidak ada file handler ditemukan`));
            return;
        }

        for (const file of files) {
            this._loadFile(file);
        }

        // console.log(
        //     chalk.green(`[✓] ${files.length} handler(s) loaded`) +
        //     chalk.gray(` dari ${path.basename(folder)}/`)
        // );
    }

    /**
     * Initialize file watcher untuk auto-reload
     */
    initWatcher() {
        if (this.watcher) {
            console.log(chalk.yellow('[WARN] Watcher sudah aktif'));
            return;
        }

        if (this.folders.length === 0) {
            console.log(chalk.yellow('[WARN] Tidak ada folder untuk di-watch'));
            return;
        }

        console.log(
            chalk.blue(`\n[👁️] Watching folders untuk auto-reload...`)
        );

        this.watcher = chokidar.watch(this.folders, {
            persistent: true,
            ignoreInitial: true,
            ignored: [
                /node_modules/,
                /\.json$/,
                /\.log$/,
            ],
            awaitWriteFinish: {
                stabilityThreshold: 500,
                pollInterval: 100
            },
        });

        this.watcher
            .on('change', (filePath) => {
                if (!filePath.endsWith('.js')) return;

                console.log(
                    chalk.yellow(`\n[⟳] File changed: `) +
                    chalk.cyan(path.basename(filePath))
                );

                // Check apakah file adalah handler yang kita load
                const isHandler = Object.keys(this.files).some(f => f === filePath);

                if (isHandler) {
                    // File handler langsung diubah
                    console.log(chalk.yellow('[!] Handler file changed. Restart required.'));
                    console.log(chalk.gray(`    Ketik 'rs' untuk restart nodemon`));
                } else {
                    // File dependency berubah
                    this._reloadAll(filePath);
                }
            })
            .on('add', (filePath) => {
                if (!filePath.endsWith('.js')) return;

                // Check apakah file baru di folder yang kita watch
                const isInWatchedFolder = this.folders.some(f => filePath.startsWith(f));

                if (isInWatchedFolder) {
                    console.log(
                        chalk.green(`\n[+] New handler: `) +
                        chalk.cyan(path.basename(filePath))
                    );
                    this._loadFile(filePath);
                }
            })
            .on('unlink', (filePath) => {
                if (!filePath.endsWith('.js')) return;

                console.log(
                    chalk.red(`\n[-] Handler deleted: `) +
                    chalk.cyan(path.basename(filePath))
                );
                this._unloadFile(filePath);
                console.log(chalk.yellow('[!] Handler removed. Restart untuk clean state.'));
            })
            .on('error', (error) => {
                console.error(chalk.red('[Watcher Error]:'), error);
            });

        console.log(chalk.green(`[✓] File watcher aktif\n`));
    }

    /**
     * Stop watcher
     */
    stopWatcher() {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
            console.log(chalk.gray('[✓] Watcher stopped'));
        }
    }

    /**
     * Get loaded files info
     */
    getLoadedFiles() {
        return Object.keys(this.files).map(f => path.relative(TELEGRAM_ROOT, f));
    }

    /**
     * Get loaded files count
     */
    getLoadedCount() {
        return Object.keys(this.files).length;
    }
}

module.exports = TelegramPluginLoader;
