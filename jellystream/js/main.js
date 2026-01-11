/**
 * JellyStream - Application Bootstrap
 * Entry point for the application
 */
(function(window, document) {
    'use strict';

    var JellyStream = {
        version: '2.0.0',
        isInitialized: false,

        /**
         * Initialize the application
         */
        init: function() {
            console.log('JellyStream ' + this.version + ': Starting...');

            // Check if all dependencies are loaded
            if (!this.checkDependencies()) {
                console.error('JellyStream: Missing dependencies, retrying in 500ms...');
                setTimeout(this.init.bind(this), 500);
                return;
            }

            console.log('JellyStream: All dependencies loaded');

            // Initialize lifecycle manager
            if (window.AppLifecycle) {
                window.AppLifecycle.initialize();
            }

            this.isInitialized = true;
            console.log('JellyStream: Initialized successfully');
        },

        /**
         * Check if all required dependencies are loaded
         */
        checkDependencies: function() {
            var required = [
                'StateManager',
                'AppLifecycle',
                'Router',
                'JellyfinClient',
                'JellyseerrClient'
            ];

            for (var i = 0; i < required.length; i++) {
                if (!window[required[i]]) {
                    console.error('JellyStream: Missing dependency: ' + required[i]);
                    return false;
                }
            }

            return true;
        },

        /**
         * Get current version
         */
        getVersion: function() {
            return this.version;
        },

        /**
         * Check if fully authenticated
         */
        isAuthenticated: function() {
            return window.StateManager && window.StateManager.isFullyAuthenticated();
        },

        /**
         * Navigate to a screen
         */
        navigate: function(hash) {
            if (window.Router) {
                window.Router.navigateTo(hash);
            }
        },

        /**
         * Go to home screen
         */
        goHome: function() {
            this.navigate('#/home');
        },

        /**
         * Go to login screen
         */
        goToLogin: function() {
            this.navigate('#/login');
        },

        /**
         * Logout and clear authentication
         */
        logout: function() {
            console.log('JellyStream: Logging out');

            if (window.StateManager) {
                window.StateManager.clearAuth();
            }

            this.goToLogin();
        },

        /**
         * Refresh current screen
         */
        refresh: function() {
            if (window.Router && window.Router.currentScreenId) {
                var screenModule = window.Router.getScreenModule(window.Router.currentScreenId);
                if (screenModule && screenModule.load) {
                    screenModule.load();
                }
            }
        }
    };

    // Export to global scope
    window.JellyStream = JellyStream;

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            JellyStream.init();
        });
    } else {
        // DOM already loaded
        JellyStream.init();
    }

})(window, document);
