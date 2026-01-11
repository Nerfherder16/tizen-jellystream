/**
 * JellyStream - Splash Screen
 * Initial loading screen
 */
(function(window) {
    'use strict';

    var SplashScreen = {
        initialized: false,

        /**
         * Initialize splash screen
         */
        init: function() {
            if (this.initialized) return;

            console.log('SplashScreen: Initializing');
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
            console.log('SplashScreen: Checking authentication');

            // Check if we have valid saved credentials
            var hasValidAuth = false;

            if (window.StateManager && window.StateManager.jellyfin.connected) {
                var token = window.StateManager.jellyfin.accessToken;
                var userId = window.StateManager.jellyfin.userId;

                if (token && userId) {
                    console.log('SplashScreen: Found saved credentials, validating...');

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
                            console.log('SplashScreen: Token valid, user:', user.Name);
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
                            console.log('SplashScreen: Token invalid or expired, redirecting to login');
                            this.goToLogin();
                        }.bind(this));

                    return; // Wait for async validation
                }
            }

            // No valid auth, go to login
            console.log('SplashScreen: No valid credentials found');
            this.goToLogin();
        },

        /**
         * Navigate to login screen
         */
        goToLogin: function() {
            this.updateMessage('Please sign in');
            setTimeout(function() {
                if (window.Router) {
                    window.Router.navigateTo('#/login');
                }
            }, 500);
        }
    };

    // Export to global scope
    window.SplashScreen = SplashScreen;

})(window);
