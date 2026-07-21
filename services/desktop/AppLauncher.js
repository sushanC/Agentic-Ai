import { getPlatformAdapter } from './PlatformAdapter.js';

export class AppLauncher {
    constructor() {
        this.adapter = getPlatformAdapter();
        this.ALIASES = {
            'vscode': 'code',
            'vs code': 'code',
            'visual studio code': 'code',
            'chrome': 'google-chrome',
            'google chrome': 'google-chrome',
            'firefox': 'firefox',
            'terminal': 'gnome-terminal',  
            'spotify': 'spotify',
            'discord': 'discord',
            'slack': 'slack',
            'calculator': 'gnome-calculator',
            'file manager': 'nautilus',
            'nautilus': 'nautilus',
            'notepad': 'gedit',
            'text editor': 'gedit',
            'vlc': 'vlc',
            'gimp': 'gimp',
            'obs': 'obs',
            'zoom': 'zoom',
            'teams': 'teams',
            'brave': 'brave-browser',
            'thunderbird': 'thunderbird',
            'steam': 'steam',
            'blender': 'blender',
            'idea': 'idea.sh',
            'intellij': 'idea.sh',
            'pycharm': 'pycharm.sh',
            'android studio': 'studio.sh',
            'postman': 'postman'
        };
    }

    async launch(appName) {
        const normalized = appName.toLowerCase().trim();
        const resolved = this.ALIASES[normalized] || normalized;
        const appPath = await this.adapter.findAppPath(resolved);
        if (appPath) {
            const res = await this.adapter.openApp(appPath);
            if (res.success) {
                return { success: true, message: `Launched ${appName}`, resolvedPath: appPath };
            }
            return { success: false, error: res.error || `Failed to launch ${appName}` };
        }
        return { success: false, error: `Could not find application: ${appName}` };
    }

    async search(query) {
        return [];
    }

    async isInstalled(appName) {
        const normalized = appName.toLowerCase().trim();
        const resolved = this.ALIASES[normalized] || normalized;
        const appPath = await this.adapter.findAppPath(resolved);
        return !!appPath;
    }
}
