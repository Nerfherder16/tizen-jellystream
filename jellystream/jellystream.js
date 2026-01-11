/**
 * JellyStream - Main Entry Point
 * Unified Jellyfin + Jellyseerr experience for Samsung Tizen TVs
 *
 * This script coordinates the initialization of all JellyStream modules
 * and provides the main window.JellyStream API.
 */
(function (window) {
    'use strict';

    // Wrap everything in try-catch for debugging on TV
    try {
        console.log('JellyStream loading...');

    var JellyStream = {
        version: '1.0.0',
        _initialized: false,

        /**
         * Initialize JellyStream
         */
        init: function () {
            if (this._initialized) {
                console.log('JellyStream already initialized');
                return;
            }

            console.log('JellyStream v' + this.version + ' initializing...');

            // Initialize configuration
            if (window.JellyStreamConfig) {
                window.JellyStreamConfig.init();
            }

            // Initialize Jellyseerr API with stored config
            if (window.JellyStreamConfig && window.JellyseerrAPI) {
                var config = window.JellyStreamConfig.getJellyseerrConfig();
                if (config.serverUrl && config.apiKey) {
                    window.JellyseerrAPI.init(config.serverUrl, config.apiKey);
                    console.log('JellyStream: Jellyseerr API initialized');
                } else {
                    console.log('JellyStream: Jellyseerr not configured');
                }
            }

            // Initialize home screen integration
            if (window.JellyStreamHome) {
                window.JellyStreamHome.init();
            }

            // Register keyboard shortcut to open settings (for development)
            this._registerKeyboardShortcuts();

            this._initialized = true;
            console.log('JellyStream initialized successfully');

            // Show success indicator briefly (for debugging)
            this._showLoadIndicator();

            // Dispatch ready event
            try {
                window.dispatchEvent(new CustomEvent('jellystreamready', { detail: this }));
            } catch (e) {
                console.log('CustomEvent not supported, skipping event dispatch');
            }
        },

        /**
         * Show a brief indicator that JellyStream loaded
         */
        _showLoadIndicator: function () {
            var self = this;
            var indicator = document.createElement('div');
            indicator.id = 'jellystream-load-indicator';
            indicator.style.cssText = 'position:fixed;bottom:20px;right:20px;background:rgba(91,79,196,0.9);color:white;padding:12px 20px;border-radius:8px;z-index:99999;font-size:14px;font-family:sans-serif;';
            indicator.innerHTML = '<strong>JellyStream</strong> loaded';

            // Add config status
            if (window.JellyStreamConfig && window.JellyStreamConfig.isJellyseerrConfigured()) {
                indicator.innerHTML += ' <span style="color:#4caf50;">&#10003; Jellyseerr connected</span>';
                indicator.innerHTML += '<br><button id="jellystream-inject-btn" style="margin-top:8px;padding:5px 10px;background:#5b4fc4;border:none;color:white;border-radius:4px;cursor:pointer;">Load Content Now</button>';
            } else {
                indicator.innerHTML += ' <span style="color:#ff9800;">&#9888; Press RED to configure Jellyseerr</span>';
            }

            document.body.appendChild(indicator);

            // Add click handler for inject button
            var injectBtn = document.getElementById('jellystream-inject-btn');
            if (injectBtn) {
                injectBtn.addEventListener('click', function() {
                    console.log('JellyStream: Manual inject triggered');
                    if (window.JellyStreamHome) {
                        window.JellyStreamHome._rowsInjected = false;
                        window.JellyStreamHome._injectJellyseerrRows();
                    }
                    indicator.innerHTML = '<strong>JellyStream</strong> - Injecting content...';
                });
            }

            // Fade out and remove after 10 seconds (longer for manual trigger)
            setTimeout(function () {
                indicator.style.opacity = '0';
                indicator.style.transition = 'opacity 0.5s';
                setTimeout(function () {
                    if (indicator.parentNode) {
                        indicator.parentNode.removeChild(indicator);
                    }
                }, 500);
            }, 10000);
        },

        /**
         * Register keyboard shortcuts
         */
        _registerKeyboardShortcuts: function () {
            var self = this;

            document.addEventListener('keydown', function (e) {
                // Skip if already handled (following Jellyfin pattern)
                if (e.defaultPrevented) {
                    return;
                }

                // Ctrl/Cmd + Shift + S = Open settings
                if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.keyCode === 83) {
                    e.preventDefault();
                    self.openSettings();
                }

                // Note: Red button (403) is handled in jellystream-home.js
            });
        },

        /**
         * Open the JellyStream settings modal
         */
        openSettings: function () {
            if (window.JellyStreamSettingsUI) {
                window.JellyStreamSettingsUI.show();
            }
        },

        /**
         * Close any open modals
         */
        closeModals: function () {
            var modals = document.querySelectorAll('.jellystream-overlay');
            modals.forEach(function (modal) {
                modal.remove();
            });
        },

        /**
         * Refresh the home screen content
         */
        refresh: function () {
            if (window.JellyStreamHome) {
                window.JellyStreamHome.refresh();
            }
        },

        /**
         * Check if Jellyseerr is configured and connected
         */
        isJellyseerrConnected: function () {
            return window.JellyseerrAPI && window.JellyseerrAPI.isConfigured();
        },

        /**
         * Get the Jellyseerr API instance
         */
        getJellyseerrAPI: function () {
            return window.JellyseerrAPI;
        },

        /**
         * Get the configuration manager
         */
        getConfig: function () {
            return window.JellyStreamConfig;
        },

        /**
         * Quick setup helper for first-time configuration
         */
        quickSetup: function (jellyseerrUrl, apiKey) {
            if (window.JellyStreamConfig) {
                window.JellyStreamConfig.setJellyseerrConfig(jellyseerrUrl, apiKey);
            }
            if (window.JellyseerrAPI) {
                window.JellyseerrAPI.init(jellyseerrUrl, apiKey);
            }
            this.refresh();
        }
    };

    // Export to window
    window.JellyStream = JellyStream;

    // Auto-initialize when all scripts are loaded
    function checkDependencies() {
        var ready = window.JellyStreamConfig &&
                    window.JellyseerrAPI &&
                    window.JellyStreamHome;

        if (ready) {
            JellyStream.init();
        } else {
            // Retry after a short delay
            setTimeout(checkDependencies, 100);
        }
    }

    // Start checking when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkDependencies);
    } else {
        // Small delay to ensure other scripts have loaded
        setTimeout(checkDependencies, 100);
    }

    } catch (e) {
        console.error('JellyStream initialization error:', e);
        // Show visual error indicator for debugging
        setTimeout(function() {
            var errDiv = document.createElement('div');
            errDiv.style.cssText = 'position:fixed;top:10px;right:10px;background:red;color:white;padding:10px;z-index:99999;font-size:14px;';
            errDiv.textContent = 'JellyStream Error: ' + e.message;
            document.body.appendChild(errDiv);
        }, 2000);
    }

})(window);
