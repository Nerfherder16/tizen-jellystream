/**
 * JellyStream - Splash Screen
 * Initial loading screen
 */
console.log('splash-screen.js: FILE LOADING');
(function(window) {
    'use strict';

    console.log('splash-screen.js: IIFE executing');

    var AppSplashScreen = {
        initialized: false,

        /**
         * Initialize splash screen
         */
        init: function() {
            if (this.initialized) return;

            console.log('AppSplashScreen: Initializing');
            this.initialized = true;

            // Auto-transition after checking auth
            setTimeout(this.checkAuthAndTransition.bind(this), 1500);
        },

        /**
         * Load splash screen
         */
        load: function() {
            this.updateMessage('Loading JellyStream...');
        },

        /**
         * Update splash message
         */
        updateMessage: function(message) {
            var msgElement = document.querySelector('.splash-message');
            if (msgElement) {
                msgElement.textContent = message;
            }
        },

        /**
         * Check authentication and transition to appropriate screen
         */
        checkAuthAndTransition: function() {
            console.log('AppSplashScreen: Checking authentication');
            this.updateMessage('Checking auth...');

            // Check if we have valid saved credentials
            var hasValidAuth = false;

            if (window.StateManager && window.StateManager.jellyfin.connected) {
                var token = window.StateManager.jellyfin.accessToken;
                var userId = window.StateManager.jellyfin.userId;

                if (token && userId) {
                    console.log('AppSplashScreen: Found saved credentials, validating...');
                    this.updateMessage('Validating credentials...');

                    // Initialize client with saved credentials
                    window.JellyfinClient.init(
                        window.StateManager.jellyfin.serverUrl,
                        userId,
                        token,
                        window.StateManager.jellyfin.deviceId,
                        window.StateManager.jellyfin.serverId
                    );

                    // Test if token is still valid
                    window.JellyfinClient._request('/Users/' + userId)
                        .then(function(user) {
                            console.log('AppSplashScreen: Token valid, user:', user.Name);
                            this.updateMessage('Welcome back, ' + user.Name + '!');

                            // Also initialize Jellyseerr if we have it
                            if (window.StateManager.jellyseerr.connected) {
                                window.JellyseerrClient.init(
                                    window.StateManager.jellyseerr.serverUrl,
                                    window.StateManager.jellyseerr.apiKey
                                );
                            }

                            setTimeout(function() {
                                if (window.Router) {
                                    window.Router.navigateTo('#/home');
                                }
                            }, 500);
                        }.bind(this))
                        .catch(function(error) {
                            console.log('AppSplashScreen: Token invalid or expired, redirecting to login');
                            this.goToLogin();
                        }.bind(this));

                    return; // Wait for async validation
                }
            }

            // No valid auth, go to login
            console.log('AppSplashScreen: No valid credentials found');
            this.updateMessage('No saved login, redirecting...');
            this.goToLogin();
        },

        /**
         * Navigate to login screen
         */
        goToLogin: function() {
            this.updateMessage('Redirecting to login...');
            setTimeout(function() {
                if (window.Router) {
                    console.log('AppSplashScreen: Navigating to login');
                    window.Router.navigateTo('#/login');
                } else {
                    console.error('AppSplashScreen: Router not available!');
                }
            }, 500);
        }
    };

    // Export to global scope
    console.log('splash-screen.js: AppSplashScreen before export has keys:', Object.keys(AppSplashScreen));
    console.log('splash-screen.js: window.AppSplashScreen exists before assignment?', 'AppSplashScreen' in window, window.AppSplashScreen);
    console.log('splash-screen.js: Is window.AppSplashScreen frozen?', Object.isFrozen(window.AppSplashScreen || {}));

    // Try alternative export method
    window['AppSplashScreen'] = AppSplashScreen;

    console.log('splash-screen.js: AppSplashScreen exported to window');
    console.log('splash-screen.js: window.AppSplashScreen has keys:', Object.keys(window.AppSplashScreen));
    console.log('splash-screen.js: window.AppSplashScreen.init exists?', typeof window.AppSplashScreen.init);

})(window);
console.log('splash-screen.js: FILE COMPLETE');
