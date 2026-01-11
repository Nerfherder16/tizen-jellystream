/**
 * JellyStream - Configuration Manager
 * Handles storage and retrieval of JellyStream settings
 */
(function (window) {
    'use strict';

    var STORAGE_KEY = 'jellystream_config';
    var DEFAULT_CONFIG = {
        jellyseerr: {
            serverUrl: 'http://192.168.50.19:5055',
            apiKey: 'MTc2NjQxMjM1MzQ3OGZlOTk3NTFhLTgxYjItNGQ4ZC05MzlhLTRmNWU5NjNhZjU2Mw==',
            enabled: true
        },
        jellyfin: {
            // Jellyfin config is managed by jellyfin-web, we just track if it's connected
            connected: false
        },
        ui: {
            showJellyseerrOnHome: true,
            homeLayout: 'unified', // 'unified', 'jellyfin-first', 'jellyseerr-first'
            rowsToShow: {
                continueWatching: true,
                recentlyAdded: true,
                trendingMovies: true,
                trendingTv: true,
                myRequests: true
            }
        },
        lastUpdated: null
    };

    var JellyStreamConfig = {
        _config: null,

        /**
         * Initialize configuration from localStorage
         */
        init: function () {
            // Force use of hardcoded defaults (remove this after testing)
            localStorage.removeItem(STORAGE_KEY);

            this._config = this._load();
            console.log('JellyStreamConfig initialized:', this._config);
            console.log('Jellyseerr URL:', this._config.jellyseerr.serverUrl);
            console.log('Jellyseerr enabled:', this._config.jellyseerr.enabled);
            return this._config;
        },

        /**
         * Load configuration from localStorage
         */
        _load: function () {
            try {
                var stored = localStorage.getItem(STORAGE_KEY);
                if (stored) {
                    var parsed = JSON.parse(stored);
                    // Merge with defaults to ensure all keys exist
                    return this._mergeDeep(DEFAULT_CONFIG, parsed);
                }
            } catch (e) {
                console.error('Failed to load JellyStream config:', e);
            }
            return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
        },

        /**
         * Save configuration to localStorage
         */
        _save: function () {
            try {
                this._config.lastUpdated = new Date().toISOString();
                localStorage.setItem(STORAGE_KEY, JSON.stringify(this._config));
                return true;
            } catch (e) {
                console.error('Failed to save JellyStream config:', e);
                return false;
            }
        },

        /**
         * Deep merge two objects
         */
        _mergeDeep: function (target, source) {
            var output = Object.assign({}, target);
            if (this._isObject(target) && this._isObject(source)) {
                var self = this;
                Object.keys(source).forEach(function (key) {
                    if (self._isObject(source[key])) {
                        if (!(key in target)) {
                            output[key] = source[key];
                        } else {
                            output[key] = self._mergeDeep(target[key], source[key]);
                        }
                    } else {
                        output[key] = source[key];
                    }
                });
            }
            return output;
        },

        _isObject: function (item) {
            return item && typeof item === 'object' && !Array.isArray(item);
        },

        /**
         * Get the full configuration
         */
        getConfig: function () {
            if (!this._config) {
                this.init();
            }
            return this._config;
        },

        /**
         * Get Jellyseerr configuration
         */
        getJellyseerrConfig: function () {
            return this.getConfig().jellyseerr;
        },

        /**
         * Set Jellyseerr configuration
         */
        setJellyseerrConfig: function (serverUrl, apiKey) {
            this._config.jellyseerr.serverUrl = serverUrl || '';
            this._config.jellyseerr.apiKey = apiKey || '';
            this._config.jellyseerr.enabled = !!(serverUrl && apiKey);
            this._save();

            // Initialize the API with new config
            if (window.JellyseerrAPI) {
                window.JellyseerrAPI.init(serverUrl, apiKey);
            }

            return this._config.jellyseerr;
        },

        /**
         * Check if Jellyseerr is configured
         */
        isJellyseerrConfigured: function () {
            var config = this.getJellyseerrConfig();
            return !!(config.serverUrl && config.apiKey && config.enabled);
        },

        /**
         * Get UI configuration
         */
        getUIConfig: function () {
            return this.getConfig().ui;
        },

        /**
         * Set UI configuration
         */
        setUIConfig: function (uiConfig) {
            this._config.ui = Object.assign({}, this._config.ui, uiConfig);
            this._save();
            return this._config.ui;
        },

        /**
         * Set Jellyfin connection status
         */
        setJellyfinConnected: function (connected) {
            this._config.jellyfin.connected = connected;
            this._save();
        },

        /**
         * Check if Jellyfin is connected
         */
        isJellyfinConnected: function () {
            return this.getConfig().jellyfin.connected;
        },

        /**
         * Reset configuration to defaults
         */
        reset: function () {
            this._config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
            this._save();
            return this._config;
        },

        /**
         * Export configuration (for backup)
         */
        exportConfig: function () {
            return JSON.stringify(this._config, null, 2);
        },

        /**
         * Import configuration (from backup)
         */
        importConfig: function (configJson) {
            try {
                var imported = JSON.parse(configJson);
                this._config = this._mergeDeep(DEFAULT_CONFIG, imported);
                this._save();
                return { success: true };
            } catch (e) {
                return { success: false, error: e.message };
            }
        }
    };

    // Settings UI Helper - generates the settings form HTML
    var JellyStreamSettingsUI = {
        /**
         * Create the settings modal HTML
         */
        createSettingsModal: function () {
            var config = JellyStreamConfig.getConfig();
            var html = '\
                <div id="jellystream-settings-overlay" class="jellystream-overlay">\
                    <div class="jellystream-settings-modal">\
                        <div class="jellystream-settings-header">\
                            <h2>JellyStream Settings</h2>\
                            <button class="jellystream-close-btn" data-action="close">X</button>\
                        </div>\
                        <div class="jellystream-settings-content">\
                            <div class="jellystream-settings-section">\
                                <h3>Jellyseerr Configuration</h3>\
                                <div class="jellystream-form-group">\
                                    <label for="jellyseerr-url">Server URL</label>\
                                    <input type="url" id="jellyseerr-url" \
                                        placeholder="https://jellyseerr.example.com" \
                                        value="' + (config.jellyseerr.serverUrl || '') + '">\
                                </div>\
                                <div class="jellystream-form-group">\
                                    <label for="jellyseerr-apikey">API Key</label>\
                                    <input type="password" id="jellyseerr-apikey" \
                                        placeholder="Your Jellyseerr API Key" \
                                        value="' + (config.jellyseerr.apiKey || '') + '">\
                                </div>\
                                <button id="jellyseerr-test-btn" class="jellystream-btn">Test Connection</button>\
                                <span id="jellyseerr-test-result"></span>\
                            </div>\
                            <div class="jellystream-settings-section">\
                                <h3>Home Screen Layout</h3>\
                                <div class="jellystream-form-group">\
                                    <label>\
                                        <input type="checkbox" id="show-trending-movies" \
                                            ' + (config.ui.rowsToShow.trendingMovies ? 'checked' : '') + '>\
                                        Show Trending Movies\
                                    </label>\
                                </div>\
                                <div class="jellystream-form-group">\
                                    <label>\
                                        <input type="checkbox" id="show-trending-tv" \
                                            ' + (config.ui.rowsToShow.trendingTv ? 'checked' : '') + '>\
                                        Show Trending TV Shows\
                                    </label>\
                                </div>\
                                <div class="jellystream-form-group">\
                                    <label>\
                                        <input type="checkbox" id="show-my-requests" \
                                            ' + (config.ui.rowsToShow.myRequests ? 'checked' : '') + '>\
                                        Show My Requests\
                                    </label>\
                                </div>\
                            </div>\
                        </div>\
                        <div class="jellystream-settings-footer">\
                            <button class="jellystream-btn jellystream-btn-secondary" data-action="close">Cancel</button>\
                            <button class="jellystream-btn jellystream-btn-primary" data-action="save">Save</button>\
                        </div>\
                    </div>\
                </div>';
            return html;
        },

        /**
         * Show the settings modal
         */
        show: function () {
            // Remove existing modal if any
            this.hide();

            // Create and insert modal
            var modalHtml = this.createSettingsModal();
            document.body.insertAdjacentHTML('beforeend', modalHtml);

            var overlay = document.getElementById('jellystream-settings-overlay');
            var self = this;

            // Event handlers
            overlay.addEventListener('click', function (e) {
                var action = e.target.getAttribute('data-action');
                if (action === 'close') {
                    self.hide();
                } else if (action === 'save') {
                    self.save();
                }
            });

            // Test connection button
            var testBtn = document.getElementById('jellyseerr-test-btn');
            testBtn.addEventListener('click', function () {
                self.testJellyseerrConnection();
            });

            // Focus first input for TV navigation
            setTimeout(function () {
                var firstInput = overlay.querySelector('input');
                if (firstInput) firstInput.focus();
            }, 100);
        },

        /**
         * Hide the settings modal
         */
        hide: function () {
            var overlay = document.getElementById('jellystream-settings-overlay');
            if (overlay) {
                overlay.remove();
            }
        },

        /**
         * Save settings from the modal
         */
        save: function () {
            var serverUrl = document.getElementById('jellyseerr-url').value.trim();
            var apiKey = document.getElementById('jellyseerr-apikey').value.trim();

            JellyStreamConfig.setJellyseerrConfig(serverUrl, apiKey);

            var uiConfig = {
                rowsToShow: {
                    trendingMovies: document.getElementById('show-trending-movies').checked,
                    trendingTv: document.getElementById('show-trending-tv').checked,
                    myRequests: document.getElementById('show-my-requests').checked,
                    continueWatching: true,
                    recentlyAdded: true
                }
            };
            JellyStreamConfig.setUIConfig(uiConfig);

            this.hide();

            // Trigger refresh of home screen
            if (window.JellyStreamHome && window.JellyStreamHome.refresh) {
                window.JellyStreamHome.refresh();
            }
        },

        /**
         * Test Jellyseerr connection
         */
        testJellyseerrConnection: function () {
            var serverUrl = document.getElementById('jellyseerr-url').value.trim();
            var apiKey = document.getElementById('jellyseerr-apikey').value.trim();
            var resultSpan = document.getElementById('jellyseerr-test-result');

            if (!serverUrl || !apiKey) {
                resultSpan.textContent = 'Please enter URL and API Key';
                resultSpan.className = 'test-error';
                return;
            }

            resultSpan.textContent = 'Testing...';
            resultSpan.className = 'test-pending';

            // Temporarily init API with these values
            var tempApi = Object.create(window.JellyseerrAPI);
            tempApi.init(serverUrl, apiKey);
            tempApi.testConnection().then(function (result) {
                if (result.success) {
                    resultSpan.textContent = 'Connected! (v' + result.version + ')';
                    resultSpan.className = 'test-success';
                } else {
                    resultSpan.textContent = 'Failed: ' + result.error;
                    resultSpan.className = 'test-error';
                }
            });
        }
    };

    // Export to window
    window.JellyStreamConfig = JellyStreamConfig;
    window.JellyStreamSettingsUI = JellyStreamSettingsUI;

})(window);
