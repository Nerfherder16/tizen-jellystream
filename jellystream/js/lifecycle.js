/**
 * JellyStream Lifecycle Manager
 * Handles Tizen application lifecycle events
 */
(function(window) {
    'use strict';

    var AppLifecycle = {
        isInitialized: false,
        isPaused: false,

        /**
         * Initialize the application
         */
        initialize: function() {
            console.log('AppLifecycle: Initializing application');

            // Register Tizen TV input device keys
            this.registerTizenKeys();

            // Initialize state manager
            if (window.StateManager) {
                window.StateManager.init();
            }

            // Initialize UI managers
            if (window.FocusManager) {
                window.FocusManager.init();
            }
            if (window.ModalManager) {
                window.ModalManager.init();
            }

            // Set up visibility change listener (for pause/resume)
            this.setupVisibilityHandler();

            // Set up back key handler
            this.setupBackKeyHandler();

            this.isInitialized = true;
            console.log('AppLifecycle: Application initialized');

            // Start the app router
            if (window.Router) {
                window.Router.init();
            }
        },

        /**
         * Register Samsung Tizen TV remote keys
         */
        registerTizenKeys: function() {
            try {
                if (window.tizen && window.tizen.tvinputdevice) {
                    var keys = [
                        'MediaPlayPause',
                        'MediaPlay',
                        'MediaPause',
                        'MediaStop',
                        'MediaFastForward',
                        'MediaRewind',
                        'ColorF0Red',
                        'ColorF1Green',
                        'ColorF2Yellow',
                        'ColorF3Blue'
                    ];

                    for (var i = 0; i < keys.length; i++) {
                        try {
                            window.tizen.tvinputdevice.registerKey(keys[i]);
                        } catch (e) {
                            // Key may already be registered or not available
                            console.log('AppLifecycle: Could not register key ' + keys[i]);
                        }
                    }

                    console.log('AppLifecycle: Tizen keys registered');
                } else {
                    console.log('AppLifecycle: Tizen TV APIs not available (running in browser?)');
                }
            } catch (e) {
                console.error('AppLifecycle: Error registering Tizen keys', e);
            }
        },

        /**
         * Set up visibility change handler for pause/resume
         */
        setupVisibilityHandler: function() {
            var self = this;
            document.addEventListener('visibilitychange', function() {
                if (document.hidden) {
                    self.pause();
                } else {
                    self.resume();
                }
            });
        },

        /**
         * Set up back key handler
         */
        setupBackKeyHandler: function() {
            var self = this;
            window.addEventListener('tizenhwkey', function(e) {
                if (e.keyName === 'back') {
                    var handled = self.handleBackKey();
                    if (handled) {
                        e.preventDefault();
                    }
                }
            });
        },

        /**
         * Handle back key press
         * Returns true if handled, false if should exit app
         */
        handleBackKey: function() {
            console.log('AppLifecycle: Back key pressed');

            // If modal is open, close it
            if (window.StateManager && window.StateManager.ui.isModalOpen) {
                if (window.ModalManager && window.ModalManager.close) {
                    window.ModalManager.close();
                    return true;
                }
            }

            // If player is active, stop playback and return to previous screen
            if (window.StateManager && window.StateManager.ui.currentScreen === 'player') {
                if (window.Router && window.Router.goBack) {
                    window.Router.goBack();
                    return true;
                }
            }

            // If not on home screen, go back
            if (window.StateManager && window.StateManager.ui.currentScreen !== 'home') {
                if (window.Router && window.Router.goBack) {
                    window.Router.goBack();
                    return true;
                }
            }

            // On home screen - exit app
            return false; // Let default handler exit the app
        },

        /**
         * Pause the application
         * Called when app goes to background (user pressed Home button)
         */
        pause: function() {
            if (this.isPaused) return;

            console.log('AppLifecycle: Application pausing');
            this.isPaused = true;

            // Save current playback position if playing
            if (window.StateManager && window.StateManager.playback.isPlaying) {
                // Player should handle saving position
                if (window.PlayerScreen && window.PlayerScreen.savePosition) {
                    window.PlayerScreen.savePosition();
                }
            }

            // Save current UI state
            if (window.StateManager) {
                window.StateManager.saveToStorage();
            }

            // Pause video if playing
            if (window.PlayerScreen && window.PlayerScreen.pause) {
                window.PlayerScreen.pause();
            }

            console.log('AppLifecycle: Application paused');
        },

        /**
         * Resume the application
         * Called when app returns to foreground
         */
        resume: function() {
            if (!this.isPaused) return;

            console.log('AppLifecycle: Application resuming');
            this.isPaused = false;

            // Reload state from storage (might have changed)
            if (window.StateManager) {
                window.StateManager.loadFromStorage();
            }

            // Refresh current screen data
            var currentScreen = window.StateManager ? window.StateManager.ui.currentScreen : null;
            if (currentScreen && window[currentScreen] && window[currentScreen].refresh) {
                window[currentScreen].refresh();
            }

            // Resume playback if was playing
            if (window.StateManager && window.StateManager.playback.isPlaying && !window.StateManager.playback.isPaused) {
                if (window.PlayerScreen && window.PlayerScreen.resume) {
                    window.PlayerScreen.resume();
                }
            }

            console.log('AppLifecycle: Application resumed');
        },

        /**
         * Terminate the application
         * Clean up resources before exit
         */
        terminate: function() {
            console.log('AppLifecycle: Application terminating');

            // Save final state
            if (window.StateManager) {
                window.StateManager.saveToStorage();
            }

            // Stop playback
            if (window.PlayerScreen && window.PlayerScreen.stop) {
                window.PlayerScreen.stop();
            }

            // Exit the Tizen app
            try {
                if (window.tizen && window.tizen.application) {
                    window.tizen.application.getCurrentApplication().exit();
                }
            } catch (e) {
                console.error('AppLifecycle: Error exiting app', e);
            }
        }
    };

    // Export to global scope
    window.AppLifecycle = AppLifecycle;

})(window);
